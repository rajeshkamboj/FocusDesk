//! Focus session model.
//!
//! The companion never measures time on its own. `elapsed_seconds()` is a
//! faithful mirror of `elapsedActiveSeconds()` in `lib/timer.ts`, computed from
//! the very same persisted timestamps the FocusDesk PWA sends:
//!
//!     running: accumulated + (now - startedAt)
//!     paused:  accumulated
//!
//! Both sides read the same machine clock, so the widget and the PWA always
//! show the same value — the widget can not drift, because it owns no counter.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Timer sub-state of a task that is `in_progress` (see `lib/timer.ts`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RunState {
    Running,
    Paused,
}

/// A snapshot of the task FocusDesk is timing right now.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub protocol: u32,
    pub session_id: String,
    pub task_id: String,
    pub title: String,
    #[serde(default)]
    pub project_name: Option<String>,
    pub state: RunState,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub paused_at: Option<String>,
    #[serde(default)]
    pub accumulated_seconds: f64,
    #[serde(default)]
    pub elapsed_seconds: f64,
    #[serde(default)]
    pub estimated_minutes: Option<u32>,
    #[serde(default)]
    pub sent_at: Option<String>,
}

/// Parse an ISO-8601 / RFC-3339 timestamp (`new Date().toISOString()`).
pub fn parse_iso(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|parsed| parsed.with_timezone(&Utc))
}

impl SessionSnapshot {
    /// Active working seconds, exactly as `lib/timer.ts` computes them.
    pub fn elapsed_seconds(&self, now: DateTime<Utc>) -> f64 {
        let accumulated = if self.accumulated_seconds.is_finite() {
            self.accumulated_seconds.max(0.0)
        } else {
            0.0
        };
        if self.state == RunState::Running {
            if let Some(segment) = self
                .started_at
                .as_deref()
                .and_then(parse_iso)
                .map(|started| (now - started).num_milliseconds() as f64 / 1000.0)
            {
                return accumulated + segment.max(0.0);
            }
        }
        accumulated
    }

    /// A new timing segment begins with every Start/Resume: the value of
    /// `startedAt` (or `pausedAt` when paused) identifies it.
    pub fn segment_key(&self) -> (String, String) {
        let marker = self
            .started_at
            .clone()
            .or_else(|| self.paused_at.clone())
            .unwrap_or_default();
        (self.session_id.clone(), marker)
    }
}

/// A request coming from the widget, answered by the PWA.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CommandType {
    Pause,
    Resume,
    Finish,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetCommand {
    pub id: u64,
    #[serde(rename = "type")]
    pub kind: CommandType,
    pub task_id: String,
    pub created_at: String,
}

/// What the window should do after a state change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Visibility {
    /// An active task exists and the widget was not dismissed → show it.
    Show,
    /// No active task any more → hide it.
    Hide,
    /// Nothing to do (same task, or suppressed because the user closed it).
    Keep,
}

/// Shared state of the companion: the mirrored session plus the command queue.
#[derive(Debug)]
pub struct WidgetState {
    session: Option<SessionSnapshot>,
    attached: bool,
    last_seen: Option<DateTime<Utc>>,
    /// Set when the user closed the widget by hand: auto-show stays suppressed
    /// for this timing segment, but the task itself is untouched.
    dismissed_for: Option<(String, String)>,
    commands: Vec<WidgetCommand>,
    next_command_id: u64,
}

impl Default for WidgetState {
    fn default() -> Self {
        Self::new()
    }
}

impl WidgetState {
    pub fn new() -> Self {
        Self {
            session: None,
            attached: false,
            last_seen: None,
            dismissed_for: None,
            commands: Vec::new(),
            next_command_id: 1,
        }
    }

    pub fn session(&self) -> Option<&SessionSnapshot> {
        self.session.as_ref()
    }

    pub fn attached(&self) -> bool {
        self.attached
    }

    pub fn last_seen(&self) -> Option<DateTime<Utc>> {
        self.last_seen
    }

    pub fn dismissed(&self) -> bool {
        self.dismissed_for.is_some()
    }

    /// True while the PWA is attached and its last snapshot is recent.
    pub fn is_online(&self, now: DateTime<Utc>, stale_after_seconds: i64) -> bool {
        if !self.attached {
            return false;
        }
        match self.last_seen {
            Some(seen) => (now - seen).num_seconds() <= stale_after_seconds,
            None => false,
        }
    }

    /// Apply a snapshot pushed by the PWA.
    ///
    /// `attached` is false when the PWA is going away (page reload, tab closed):
    /// the task keeps running, the widget keeps showing it, and the
    /// Pause/Resume/Finish buttons are disabled until FocusDesk is back.
    pub fn apply_snapshot(
        &mut self,
        snapshot: SessionSnapshot,
        attached: bool,
        now: DateTime<Utc>,
    ) -> Visibility {
        let segment = snapshot.segment_key();
        let is_new_task = self
            .session
            .as_ref()
            .map(|previous| previous.session_id != snapshot.session_id)
            .unwrap_or(true);
        let is_new_segment = self
            .session
            .as_ref()
            .map(|previous| previous.segment_key() != segment)
            .unwrap_or(true);

        if is_new_task {
            // Commands belong to the session they were made for.
            self.commands.clear();
        }
        // A different task — or a fresh Start/Resume on the same task — ends any
        // "the user closed the widget" suppression.
        if self.dismissed_for.as_ref() != Some(&segment) {
            self.dismissed_for = None;
        }

        self.session = Some(snapshot);
        self.attached = attached;
        self.last_seen = Some(now);

        if self.dismissed_for.is_some() {
            Visibility::Keep
        } else if attached || is_new_task || is_new_segment {
            Visibility::Show
        } else {
            Visibility::Keep
        }
    }

    /// No active task any more (Finished, cancelled, paused out of existence…).
    pub fn clear(&mut self, now: DateTime<Utc>) -> Visibility {
        self.session = None;
        self.attached = false;
        self.last_seen = Some(now);
        self.dismissed_for = None;
        self.commands.clear();
        Visibility::Hide
    }

    /// The user closed the widget: remember it, do not touch the task.
    pub fn dismiss(&mut self) {
        self.dismissed_for = self.session.as_ref().map(|session| session.segment_key());
    }

    /// The user asked for the widget back from the tray.
    pub fn undismiss(&mut self) {
        self.dismissed_for = None;
    }

    /// Queue a widget request for the PWA. Returns `None` without an active task.
    pub fn enqueue_command(&mut self, kind: CommandType, now: DateTime<Utc>) -> Option<WidgetCommand> {
        let session = self.session.as_ref()?;
        let command = WidgetCommand {
            id: self.next_command_id,
            kind,
            task_id: session.task_id.clone(),
            created_at: now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        };
        self.next_command_id += 1;
        self.commands.push(command.clone());
        // Bound the queue: a PWA that is offline for a long time must not
        // accumulate an unbounded list of stale button presses.
        if self.commands.len() > 32 {
            let excess = self.commands.len() - 32;
            self.commands.drain(0..excess);
        }
        Some(command)
    }

    /// Commands the PWA has not seen yet (cursor is the last id it received).
    pub fn commands_since(&self, since: u64) -> Vec<WidgetCommand> {
        self.commands
            .iter()
            .filter(|command| command.id > since)
            .cloned()
            .collect()
    }

    /// Highest command id handed out so far — the PWA's next cursor.
    pub fn last_command_id(&self) -> u64 {
        self.next_command_id.saturating_sub(1)
    }

    pub fn has_commands_since(&self, since: u64) -> bool {
        self.commands.iter().any(|command| command.id > since)
    }

}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(state: RunState, started_ago: Option<i64>, accumulated: f64) -> SessionSnapshot {
        let now = Utc::now();
        SessionSnapshot {
            protocol: 1,
            session_id: "task-1".into(),
            task_id: "task-1".into(),
            title: "Write FocusDesk documentation".into(),
            project_name: None,
            state,
            started_at: started_ago.map(|seconds| {
                (now - chrono::Duration::milliseconds(seconds * 1000))
                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
            }),
            paused_at: None,
            accumulated_seconds: accumulated,
            elapsed_seconds: 0.0,
            estimated_minutes: None,
            sent_at: None,
        }
    }

    #[test]
    fn running_elapsed_matches_the_pwa_formula() {
        let session = snapshot(RunState::Running, Some(65), 0.0);
        let elapsed = session.elapsed_seconds(Utc::now());
        assert!((64.0..=66.5).contains(&elapsed), "elapsed was {elapsed}");
    }

    #[test]
    fn paused_elapsed_is_frozen() {
        let mut session = snapshot(RunState::Paused, None, 65.0);
        session.paused_at = Some(Utc::now().to_rfc3339());
        let first = session.elapsed_seconds(Utc::now());
        std::thread::sleep(std::time::Duration::from_millis(30));
        let second = session.elapsed_seconds(Utc::now());
        assert_eq!(first, second);
        assert_eq!(second, 65.0);
    }

    #[test]
    fn accumulated_time_is_added_to_the_current_segment() {
        let session = snapshot(RunState::Running, Some(10), 30.0);
        let elapsed = session.elapsed_seconds(Utc::now());
        assert!((39.0..=41.5).contains(&elapsed), "elapsed was {elapsed}");
    }

    #[test]
    fn invalid_timestamps_do_not_produce_nonsense() {
        let mut session = snapshot(RunState::Running, None, 12.0);
        session.started_at = Some("not a timestamp".into());
        assert_eq!(session.elapsed_seconds(Utc::now()), 12.0);
        session.accumulated_seconds = f64::NAN;
        assert_eq!(session.elapsed_seconds(Utc::now()), 0.0);
    }

    #[test]
    fn a_new_task_shows_the_widget_and_clears_old_commands() {
        let mut state = WidgetState::new();
        assert_eq!(
            state.apply_snapshot(snapshot(RunState::Running, Some(1), 0.0), true, Utc::now()),
            Visibility::Show
        );
        assert!(state.enqueue_command(CommandType::Pause, Utc::now()).is_some());
        assert_eq!(state.commands_since(0).len(), 1);

        let mut other = snapshot(RunState::Running, Some(1), 0.0);
        other.session_id = "task-2".into();
        other.task_id = "task-2".into();
        assert_eq!(state.apply_snapshot(other, true, Utc::now()), Visibility::Show);
        assert!(state.commands_since(0).is_empty(), "commands must not leak across tasks");
    }

    #[test]
    fn dismissing_hides_the_widget_but_keeps_the_task() {
        let mut state = WidgetState::new();
        state.apply_snapshot(snapshot(RunState::Running, Some(5), 0.0), true, Utc::now());
        state.dismiss();
        assert!(state.dismissed());
        // The PWA keeps sending snapshots for the same segment: stay hidden.
        assert_eq!(
            state.apply_snapshot(snapshot(RunState::Running, Some(5), 0.0), true, Utc::now()),
            Visibility::Keep
        );
        assert!(state.session().is_some(), "the task is untouched by closing the widget");
        // …but a new segment (Resume) brings it back.
        let mut resumed = snapshot(RunState::Running, Some(1), 5.0);
        resumed.started_at = Some(Utc::now().to_rfc3339());
        assert_eq!(state.apply_snapshot(resumed, true, Utc::now()), Visibility::Show);
    }

    #[test]
    fn clearing_needs_a_fresh_snapshot_to_reappear() {
        let mut state = WidgetState::new();
        state.apply_snapshot(snapshot(RunState::Running, Some(5), 0.0), true, Utc::now());
        assert_eq!(state.clear(Utc::now()), Visibility::Hide);
        assert!(state.session().is_none());
        assert_eq!(state.apply_snapshot(snapshot(RunState::Running, Some(1), 0.0), true, Utc::now()), Visibility::Show);
    }

    #[test]
    fn command_cursor_only_delivers_new_commands() {
        let mut state = WidgetState::new();
        state.apply_snapshot(snapshot(RunState::Running, Some(1), 0.0), true, Utc::now());
        state.enqueue_command(CommandType::Pause, Utc::now());
        state.enqueue_command(CommandType::Resume, Utc::now());
        let cursor = state.last_command_id();
        assert_eq!(state.commands_since(0).len(), 2);
        assert!(state.commands_since(cursor).is_empty());
        state.enqueue_command(CommandType::Finish, Utc::now());
        let pending = state.commands_since(cursor);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].kind, CommandType::Finish);
    }

    #[test]
    fn commands_are_impossible_without_an_active_task() {
        let mut state = WidgetState::new();
        assert!(state.enqueue_command(CommandType::Finish, Utc::now()).is_none());
    }

    #[test]
    fn offline_detection_uses_attachment_and_recency() {
        let mut state = WidgetState::new();
        let now = Utc::now();
        state.apply_snapshot(snapshot(RunState::Running, Some(1), 0.0), true, now);
        assert!(state.is_online(now, 8));
        assert!(!state.is_online(now + chrono::Duration::seconds(30), 8));
        state.apply_snapshot(snapshot(RunState::Running, Some(1), 0.0), false, now);
        assert!(!state.is_online(now, 8));
        assert!(state.session().is_some(), "a detached PWA still leaves the running task visible");
    }
}
