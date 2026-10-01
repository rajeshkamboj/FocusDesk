//! Minimal logging: stderr plus a small append-only file.
//!
//! The companion is built as a windowless Windows binary, so stderr is only
//! visible when it is launched from a terminal. The log file lives next to
//! `config.json` and is the place to look when the widget says
//! "FocusDesk not connected".

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static LOG_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

pub fn init(path: PathBuf) {
    let _ = LOG_PATH.set(Mutex::new(Some(path)));
}

pub fn line(message: impl AsRef<str>) {
    let message = message.as_ref();
    eprintln!("[focus-widget] {message}");
    let Some(slot) = LOG_PATH.get() else { return };
    let Ok(guard) = slot.lock() else { return };
    let Some(path) = guard.as_ref() else { return };
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{} {message}", chrono::Local::now().to_rfc3339());
    }
}
