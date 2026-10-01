// FocusDesk Focus Widget — Windows companion (experimental).
//
// A tiny always-on-top window that mirrors the task FocusDesk is timing and
// relays Pause / Resume / Finish back to the PWA. It owns no task data: the
// FocusDesk PWA pushes the active session over a loopback HTTP bridge, and this
// app only renders it.
//
// See companion/README.md and lib/focus-widget/protocol.ts.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod config;
mod logging;
mod session;

use bridge::{BridgeEvent, WidgetStateView};
use chrono::Utc;
use session::{Visibility, WidgetState};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_window_state::StateFlags;

/// Label of the widget window (see `tauri.conf.json`).
const WINDOW_LABEL: &str = "widget";

struct AppCtx {
    state: Arc<Mutex<WidgetState>>,
    config: config::WidgetConfig,
    bridge_port: u16,
    visible: Arc<AtomicBool>,
}

fn lock_state(state: &Arc<Mutex<WidgetState>>) -> MutexGuard<'_, WidgetState> {
    state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/* ------------------------------------------------------------------ */
/* Window helpers                                                      */
/* ------------------------------------------------------------------ */

/// Bring the widget back onto a real monitor if the display layout changed
/// since it was last moved (undocked laptop, disconnected screen…).
fn ensure_on_screen(window: &tauri::WebviewWindow) {
    let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };
    let Ok(monitors) = window.available_monitors() else {
        return;
    };
    if monitors.is_empty() {
        return;
    }
    let (x, y) = (position.x as i64, position.y as i64);
    let (width, height) = (size.width as i64, size.height as i64);

    let on_a_monitor = monitors.iter().any(|monitor| {
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let (mx, my) = (monitor_position.x as i64, monitor_position.y as i64);
        let (mw, mh) = (monitor_size.width as i64, monitor_size.height as i64);
        let overlap_x = (x + width).min(mx + mw) - x.max(mx);
        let overlap_y = (y + height).min(my + mh) - y.max(my);
        overlap_x > 64 && overlap_y > 32
    });

    if !on_a_monitor {
        logging::line("widget was off-screen — centering on the primary monitor");
        let _ = window.center();
    }
}

fn show_widget(app: &AppHandle, ctx: &AppCtx) {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return;
    };
    ensure_on_screen(&window);
    if let Err(error) = window.set_always_on_top(true) {
        logging::line(&format!("could not pin the widget on top: {error}"));
    }
    if let Err(error) = window.show() {
        logging::line(&format!("could not show the widget: {error}"));
    }
    // Deliberately *no* set_focus(): showing the widget must not yank the caret
    // out of whatever the user is typing into.
    ctx.visible.store(true, Ordering::Relaxed);
}

fn hide_widget(app: &AppHandle, ctx: &AppCtx) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        if let Err(error) = window.hide() {
            logging::line(&format!("could not hide the widget: {error}"));
        }
    }
    ctx.visible.store(false, Ordering::Relaxed);
}

/// React to something the PWA said over the bridge.
fn handle_bridge_event(app: &AppHandle, ctx: &AppCtx, event: BridgeEvent) {
    match event {
        BridgeEvent::Visibility(Visibility::Show) => show_widget(app, ctx),
        BridgeEvent::Visibility(Visibility::Hide) => hide_widget(app, ctx),
        BridgeEvent::Visibility(Visibility::Keep) => {}
    }
}

/* ------------------------------------------------------------------ */
/* IPC commands (called by the widget window's own frontend)           */
/* ------------------------------------------------------------------ */

#[tauri::command]
fn get_widget_state(ctx: tauri::State<'_, AppCtx>) -> WidgetStateView {
    let state = lock_state(&ctx.state);
    WidgetStateView::from_state(
        &state,
        ctx.config.stale_after_seconds,
        ctx.bridge_port,
        &ctx.config.allowed_origins,
    )
}

/// Queue a Pause / Resume / Finish for the PWA to apply. The companion never
/// changes task state itself — FocusDesk does, through its normal actions.
#[tauri::command]
fn widget_command(ctx: tauri::State<'_, AppCtx>, command: String) -> Result<(), String> {
    let Some(kind) = bridge::command_type_from_str(&command) else {
        return Err(format!("unknown command: {command}"));
    };
    let queued = {
        let mut state = lock_state(&ctx.state);
        state.enqueue_command(kind, Utc::now())
    };
    if queued.is_none() {
        return Err("no active task".to_string());
    }
    logging::line(&format!("widget asked FocusDesk to {command}"));
    Ok(())
}

/// The user closed the widget by hand: hide it and remember not to pop back up
/// for this timing segment. **The task is not finished or changed in any way.**
#[tauri::command]
fn dismiss_widget(app: AppHandle, ctx: tauri::State<'_, AppCtx>) -> Result<(), String> {
    {
        let mut state = lock_state(&ctx.state);
        state.dismiss();
    }
    logging::line("widget closed by the user (task left untouched)");
    hide_widget(&app, ctx.inner());
    Ok(())
}

/// Let the widget be moved by dragging its header.
///
/// Implemented in Rust on purpose: moving a window needs no JS permission this
/// way (`data-tauri-drag-region` would require the window plugin's
/// `start-dragging` capability), so the widget runs with the smallest possible
/// permission surface.
#[tauri::command]
fn drag_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|error| error.to_string())
}

/* ------------------------------------------------------------------ */
/* Tray                                                                */
/* ------------------------------------------------------------------ */

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show focus widget", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let builder = TrayIconBuilder::new()
        .tooltip("FocusDesk — Focus Widget")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let ctx = app.state::<AppCtx>();
                let has_session = {
                    let state = lock_state(&ctx.state);
                    state.session().is_some()
                };
                {
                    let mut state = lock_state(&ctx.state);
                    state.undismiss();
                }
                if has_session {
                    show_widget(app, ctx.inner());
                } else {
                    logging::line("nothing to show — no task is running in FocusDesk");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });

    // The window icon doubles as the tray icon (see `bundle.icon`).
    match app.default_window_icon().cloned() {
        Some(icon) => {
            builder.icon(icon).build(app)?;
        }
        None => {
            builder.build(app)?;
        }
    }
    Ok(())
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

fn main() {
    let state: Arc<Mutex<WidgetState>> = Arc::new(Mutex::new(WidgetState::new()));
    let visible = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .plugin(
            // Remember where the user put the widget — position and size only,
            // never visibility (a hidden widget must stay hidden on next launch).
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_widget_state,
            widget_command,
            dismiss_widget,
            drag_window
        ])
        .setup({
            let state = state.clone();
            let visible = visible.clone();
            move |app| {
                let handle = app.handle().clone();

                /* Configuration + logging ------------------------------- */
                let config_dir: PathBuf = app
                    .path()
                    .app_config_dir()
                    .unwrap_or_else(|_| PathBuf::from("."));
                let _ = std::fs::create_dir_all(&config_dir);
                logging::init(config_dir.join("widget.log"));
                let (config, config_path) = config::load(&config_dir);
                logging::line(format!("FocusDesk Focus Widget v{}", env!("CARGO_PKG_VERSION")));
                logging::line(format!("config: {}", config_path.display()));
                logging::line(format!(
                    "allowed origins: {}",
                    if config.allowed_origins.is_empty() {
                        "(none)".to_string()
                    } else {
                        config.allowed_origins.join(", ")
                    }
                ));

                /* Bridge ------------------------------------------------ */
                // Bind first: the port is part of the state the widget window
                // reads, and nothing may call back into `AppCtx` before it is
                // managed.
                let (server, port) = bridge::bind(config.port).map_err(|error| {
                    logging::line(&error);
                    error
                })?;

                app.manage(AppCtx {
                    state: state.clone(),
                    config: config.clone(),
                    bridge_port: port,
                    visible: visible.clone(),
                });

                let on_event: bridge::EventSink = {
                    let handle = handle.clone();
                    Arc::new(move |event| {
                        let ctx = handle.state::<AppCtx>();
                        handle_bridge_event(&handle, ctx.inner(), event);
                    })
                };
                bridge::serve(
                    server,
                    config.allowed_origins.clone(),
                    state.clone(),
                    on_event,
                    visible.clone(),
                );
                logging::line(format!("bridge listening on http://127.0.0.1:{port}/focus/v1"));

                /* Tray -------------------------------------------------- */
                if let Err(error) = build_tray(&handle) {
                    logging::line(&format!("could not create the tray icon: {error}"));
                }

                /* Window behaviour -------------------------------------- */
                if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                    let window_handle = handle.clone();
                    window.on_window_event(move |event| {
                        if let WindowEvent::CloseRequested { api, .. } = event {
                            // Closing the widget is never "finish the task":
                            // hide it and let the timer keep running.
                            api.prevent_close();
                            let ctx = window_handle.state::<AppCtx>();
                            {
                                let mut state = lock_state(&ctx.state);
                                state.dismiss();
                            }
                            logging::line("widget closed by the user (task left untouched)");
                            hide_widget(&window_handle, ctx.inner());
                        }
                    });
                }

                Ok(())
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the FocusDesk focus widget");
}
