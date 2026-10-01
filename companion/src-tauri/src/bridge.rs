//! Loopback bridge: the only channel between the FocusDesk PWA and the widget.
//!
//! Protocol v1 (identical to `lib/focus-widget/protocol.ts` and to the Node
//! reference implementation in `companion/tools/mock-bridge.mjs`):
//!
//!   GET  /focus/v1/health                     → { ok, app, protocol, version, visible }
//!   GET  /focus/v1/session                    → current mirrored session (debug)
//!   POST /focus/v1/session  { session, attached, reason }
//!   GET  /focus/v1/commands?since=N&wait=20   → short hold, then
//!                                               { commands: […], nextSince: N }
//!
//! Design notes
//!  - Bound to 127.0.0.1 only: nothing on the network can reach it.
//!  - The PWA is the writer. Writes are `application/json`, which forces a CORS
//!    preflight; the bridge answers only origins from the allow-list, so a
//!    random web page cannot fake a session or read the command stream.
//!  - The widget's own buttons never touch HTTP: they use Tauri IPC, so only the
//!    companion process can queue commands.
//!  - Every request runs in its own thread, so a held command poll can never
//!    delay a snapshot.

use crate::session::{parse_iso, CommandType, SessionSnapshot, Visibility, WidgetState};
use crate::logging;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tiny_http::{Header, Method, Request, Response, Server};

pub const PROTOCOL_VERSION: u32 = 1;
pub const APP_NAME: &str = "focusdesk-focus-widget";
const BASE_PATH: &str = "/focus/v1";
const MAX_BODY_BYTES: u64 = 64 * 1024;
const MAX_POLL_SECONDS: u64 = 25;
const POLL_STEP: Duration = Duration::from_millis(250);

/// Something the Tauri side has to react to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BridgeEvent {
    /// Show / hide / leave the widget window (see [`Visibility`]).
    Visibility(Visibility),
}

pub type EventSink = Arc<dyn Fn(BridgeEvent) + Send + Sync>;

struct Ctx {
    state: Arc<Mutex<WidgetState>>,
    allowed_origins: Vec<String>,
    on_event: EventSink,
    visible: Arc<AtomicBool>,
}

fn lock(state: &Arc<Mutex<WidgetState>>) -> MutexGuard<'_, WidgetState> {
    // A poisoned mutex must not take the widget down: recover the data.
    state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Bind the loopback socket. Kept separate from [`serve`] so the caller can
/// learn the port (for the tray and the diagnostics line) *before* the first
/// request can arrive.
pub fn bind(port: u16) -> Result<(Server, u16), String> {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let server =
        Server::http(address).map_err(|error| format!("could not listen on 127.0.0.1:{port}: {error}"))?;
    let bound_port = server
        .server_addr()
        .to_ip()
        .map(|addr| addr.port())
        .unwrap_or(port);
    Ok((server, bound_port))
}

/// Serve requests until the process ends. One thread per request keeps a held
/// command poll from delaying snapshots.
pub fn serve(
    server: Server,
    allowed_origins: Vec<String>,
    state: Arc<Mutex<WidgetState>>,
    on_event: EventSink,
    visible: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let ctx = Ctx {
                state: state.clone(),
                allowed_origins: allowed_origins.clone(),
                on_event: on_event.clone(),
                visible: visible.clone(),
            };
            std::thread::spawn(move || handle(request, ctx));
        }
    });
}

fn handle(request: Request, ctx: Ctx) {
    let allow_origin = resolve_allow_origin(header_value(&request, "ORIGIN").as_deref(), &ctx.allowed_origins);
    let method = request.method().clone();

    if method == Method::Options {
        let status = if allow_origin.is_some() { 204 } else { 403 };
        let mut response = Response::empty(status);
        for header in cors_headers(allow_origin.as_deref(), true) {
            response = response.with_header(header);
        }
        let _ = request.respond(response);
        return;
    }

    let url = request.url().to_string();
    let (path, query) = match url.split_once('?') {
        Some((path, query)) => (path, query),
        None => (url.as_str(), ""),
    };
    let route = path.strip_prefix(BASE_PATH).unwrap_or(path);

    if route != "/health" && route != "/session" && route != "/commands" {
        respond_status(request, 404, allow_origin.as_deref());
        return;
    }

    // Every endpoint except the health probe requires an allow-listed origin.
    if route != "/health" && allow_origin.is_none() {
        respond_status(request, 403, allow_origin.as_deref());
        return;
    }

    if method == Method::Get && route == "/health" {
        respond_json(
            request,
            200,
            &serde_json::json!({
                "ok": true,
                "app": APP_NAME,
                "protocol": PROTOCOL_VERSION,
                "version": env!("CARGO_PKG_VERSION"),
                "visible": ctx.visible.load(Ordering::Relaxed),
            }),
            allow_origin.as_deref(),
        );
        return;
    }

    if method == Method::Get && route == "/session" {
        let now = Utc::now();
        let body = {
            let state = lock(&ctx.state);
            let session = state.session().cloned();
            let elapsed = session
                .as_ref()
                .map(|snapshot| snapshot.elapsed_seconds(now))
                .unwrap_or(0.0);
            serde_json::json!({
                "session": session,
                "attached": state.attached(),
                "lastSeenAt": state.last_seen().map(|seen| seen.to_rfc3339()),
                "elapsedSeconds": elapsed,
            })
        };
        respond_json(request, 200, &body, allow_origin.as_deref());
        return;
    }

    if method == Method::Post && route == "/session" {
        handle_session_post(request, &ctx, allow_origin.as_deref());
        return;
    }

    if method == Method::Get && route == "/commands" {
        handle_commands(request, &ctx, allow_origin.as_deref(), query);
        return;
    }

    respond_status(request, 405, allow_origin.as_deref());
}

/* ------------------------------------------------------------------ */
/* Session upsert                                                      */
/* ------------------------------------------------------------------ */

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionPayload {
    #[serde(default)]
    session: Option<SessionSnapshot>,
    /// Omitted means "the PWA is still here" (a normal snapshot push).
    #[serde(default)]
    attached: Option<bool>,
    #[serde(default)]
    reason: Option<String>,
}

fn handle_session_post(mut request: Request, ctx: &Ctx, allow_origin: Option<&str>) {
    // Read the body inside its own scope so the borrow of `request` is
    // definitely over before the request is consumed by a response.
    let read = {
        let mut body = String::new();
        let mut reader = request.as_reader();
        let result = reader.by_ref().take(MAX_BODY_BYTES).read_to_string(&mut body);
        match result {
            Ok(_) => Ok(body),
            Err(_) => Err(()),
        }
    };
    let body = match read {
        Ok(body) => body,
        Err(_) => {
            respond_error(request, 400, "could not read body", allow_origin);
            return;
        }
    };

    let payload: SessionPayload = match serde_json::from_str(&body) {
        Ok(payload) => payload,
        Err(error) => {
            respond_error(request, 400, &format!("invalid payload: {error}"), allow_origin);
            return;
        }
    };

    let now = Utc::now();
    let attached = payload.attached.unwrap_or(true);
    let reason = payload.reason.unwrap_or_default();

    let event = match payload.session {
        Some(snapshot) => {
            if snapshot.protocol != PROTOCOL_VERSION {
                respond_error(
                    request,
                    409,
                    &format!(
                        "protocol mismatch: widget speaks {PROTOCOL_VERSION}, PWA sent {}",
                        snapshot.protocol
                    ),
                    allow_origin,
                );
                return;
            }
            // Integrity cross-check only — the widget derives its own clock from
            // the same timestamps, so a mismatch is worth a line in the log but
            // never changes what is displayed.
            let derived = snapshot.elapsed_seconds(now);
            let reported = snapshot.elapsed_seconds;
            if reported.is_finite() && (derived - reported).abs() > 10.0 {
                logging::line(&format!(
                    "elapsed mismatch (derived {derived:.1}s vs reported {reported:.1}s) for {reason}"
                ));
            }
            if parse_iso(snapshot.sent_at.as_deref().unwrap_or_default()).is_none() {
                logging::line("snapshot without a parsable sentAt");
            }

            let mut state = lock(&ctx.state);
            let previous_task = state.session().map(|session| session.session_id.clone());
            let visibility = state.apply_snapshot(snapshot.clone(), attached, now);
            let is_new_task = previous_task.as_deref() != Some(snapshot.session_id.as_str());
            if is_new_task {
                logging::line(&format!(
                    "session attached: \"{}\" ({})",
                    snapshot.title,
                    if attached { "attached" } else { "detached" }
                ));
            }
            BridgeEvent::Visibility(visibility)
        }
        None => {
            let mut state = lock(&ctx.state);
            let visibility = state.clear(now);
            let why = if reason.is_empty() { "finished" } else { reason.as_str() };
            logging::line(&format!("session cleared ({why})"));
            BridgeEvent::Visibility(visibility)
        }
    };

    respond_json(request, 200, &serde_json::json!({ "ok": true }), allow_origin);
    (ctx.on_event)(event);
}

/* ------------------------------------------------------------------ */
/* Command poll                                                        */
/* ------------------------------------------------------------------ */

fn handle_commands(request: Request, ctx: &Ctx, allow_origin: Option<&str>, query: &str) {
    let since = query_param(query, "since")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let wait = query_param(query, "wait")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0)
        .min(MAX_POLL_SECONDS);
    let deadline = Instant::now() + Duration::from_secs(wait);

    loop {
        let (commands, next_since, pending) = {
            let state = lock(&ctx.state);
            let commands = state.commands_since(since);
            let next_since = state.last_command_id();
            let pending = state.has_commands_since(since);
            (commands, next_since, pending)
        };

        if pending || Instant::now() >= deadline {
            let body = serde_json::json!({ "commands": commands, "nextSince": next_since });
            respond_json(request, 200, &body, allow_origin);
            return;
        }
        std::thread::sleep(POLL_STEP);
    }
}

/* ------------------------------------------------------------------ */
/* HTTP plumbing                                                       */
/* ------------------------------------------------------------------ */

fn query_param(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        if key == name {
            Some(value.to_string())
        } else {
            None
        }
    })
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("static header")
}

fn header_value(request: &Request, name: &str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|header| header.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|header| header.value.as_str().to_string())
}

/// `Access-Control-Allow-Origin` for this request, or `None` when the caller
/// must be refused.
///
///  - request without an `Origin` header → `*` (not a browser: curl, the test
///    tooling, or another local program; the socket is loopback-only)
///  - allow-listed origin  → that origin
///  - anything else        → `None` (403, and the browser hides the response)
fn resolve_allow_origin(origin: Option<&str>, allowed: &[String]) -> Option<String> {
    match origin {
        None => Some("*".to_string()),
        Some(origin) => {
            if allowed.iter().any(|entry| entry == "*" || entry == origin) {
                Some(origin.to_string())
            } else {
                logging::line(&format!("rejected origin {origin} (see allowedOrigins in config.json)"));
                None
            }
        }
    }
}

fn cors_headers(allow_origin: Option<&str>, preflight: bool) -> Vec<Header> {
    let mut headers = vec![header("Vary", "Origin")];
    if let Some(origin) = allow_origin {
        headers.push(header("Access-Control-Allow-Origin", origin));
        headers.push(header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"));
        headers.push(header("Access-Control-Allow-Headers", "content-type"));
        headers.push(header("Access-Control-Max-Age", "600"));
        // Chrome's Private/Local Network Access preflight (a public page talking
        // to 127.0.0.1). Harmless where it is not implemented.
        headers.push(header("Access-Control-Allow-Private-Network", "true"));
        if preflight {
            headers.push(header("Access-Control-Allow-Private-Network-Age", "600"));
        }
    }
    headers
}

fn respond_json(request: Request, status: u16, body: &serde_json::Value, allow_origin: Option<&str>) {
    let mut response = Response::from_string(body.to_string()).with_status_code(status);
    for header in cors_headers(allow_origin, false) {
        response = response.with_header(header);
    }
    response = response.with_header(header("Content-Type", "application/json"));
    response = response.with_header(header("Cache-Control", "no-store"));
    let _ = request.respond(response);
}

fn respond_error(request: Request, status: u16, message: &str, allow_origin: Option<&str>) {
    logging::line(&format!("bridge error {status}: {message}"));
    respond_json(request, status, &serde_json::json!({ "ok": false, "error": message }), allow_origin);
}

fn respond_status(request: Request, status: u16, allow_origin: Option<&str>) {
    let mut response = Response::empty(status);
    for header in cors_headers(allow_origin, false) {
        response = response.with_header(header);
    }
    let _ = request.respond(response);
}

/// Serialisable view of the mirrored session, handed to the widget webview.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetStateView {
    pub protocol: u32,
    pub session: Option<SessionSnapshot>,
    pub elapsed_seconds: f64,
    pub attached: bool,
    pub online: bool,
    pub dismissed: bool,
    pub last_seen_at: Option<String>,
    /// Diagnostics for the widget: where FocusDesk should connect.
    pub bridge_port: u16,
    pub allowed_origins: Vec<String>,
}

impl WidgetStateView {
    pub fn from_state(
        state: &WidgetState,
        stale_after_seconds: i64,
        bridge_port: u16,
        allowed_origins: &[String],
    ) -> Self {
        let now = Utc::now();
        let session = state.session().cloned();
        let elapsed = session
            .as_ref()
            .map(|snapshot| snapshot.elapsed_seconds(now))
            .unwrap_or(0.0);
        Self {
            protocol: PROTOCOL_VERSION,
            session,
            elapsed_seconds: elapsed,
            attached: state.attached(),
            online: state.is_online(now, stale_after_seconds),
            dismissed: state.dismissed(),
            last_seen_at: state.last_seen().map(|seen| seen.to_rfc3339()),
            bridge_port,
            allowed_origins: allowed_origins.to_vec(),
        }
    }
}

/// Commands the PWA will pick up on its next poll.
pub fn command_type_from_str(value: &str) -> Option<CommandType> {
    match value {
        "pause" => Some(CommandType::Pause),
        "resume" => Some(CommandType::Resume),
        "finish" => Some(CommandType::Finish),
        other => {
            logging::line(&format!("ignoring unknown widget command \"{other}\""));
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allow_origin_rules() {
        let allowed = vec!["http://localhost:3000".to_string(), "https://app.example.com".to_string()];
        assert_eq!(resolve_allow_origin(Some("http://localhost:3000"), &allowed), Some("http://localhost:3000".to_string()));
        assert_eq!(resolve_allow_origin(Some("https://evil.example"), &allowed), None);
        assert_eq!(resolve_allow_origin(None, &allowed), Some("*".to_string()));
        let wildcard = vec!["*".to_string()];
        assert_eq!(resolve_allow_origin(Some("https://anything.example"), &wildcard), Some("https://anything.example".to_string()));
    }

    #[test]
    fn query_parameters_are_parsed() {
        assert_eq!(query_param("since=4&wait=20", "since"), Some("4".to_string()));
        assert_eq!(query_param("since=4&wait=20", "wait"), Some("20".to_string()));
        assert_eq!(query_param("since=4", "missing"), None);
        assert_eq!(query_param("", "since"), None);
    }

    #[test]
    fn commands_are_typed_by_name() {
        assert_eq!(command_type_from_str("pause"), Some(CommandType::Pause));
        assert_eq!(command_type_from_str("resume"), Some(CommandType::Resume));
        assert_eq!(command_type_from_str("finish"), Some(CommandType::Finish));
        assert_eq!(command_type_from_str("explode"), None);
    }
}
