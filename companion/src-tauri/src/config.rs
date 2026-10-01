//! Companion configuration.
//!
//! A single small JSON file next to the app's data:
//!
//!   %APPDATA%\com.focusdesk.focuswidget\config.json
//!
//!   {
//!     "port": 8787,
//!     "allowedOrigins": ["http://localhost:3000", "http://127.0.0.1:3000"],
//!     "staleAfterSeconds": 8
//!   }
//!
//! `allowedOrigins` must contain the origin FocusDesk is served from (add your
//! Vercel URL if you run the deployed PWA). `"*"` accepts every origin — only do
//! that for local experiments on a machine you trust.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const CONFIG_FILE_NAME: &str = "config.json";

pub fn default_allowed_origins() -> Vec<String> {
    vec![
        "http://localhost:3000".to_string(),
        "http://127.0.0.1:3000".to_string(),
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WidgetConfig {
    /// Loopback port the bridge listens on (must match the PWA's
    /// NEXT_PUBLIC_FOCUS_WIDGET_PORT, default 8787).
    pub port: u16,
    /// Origins allowed to talk to the bridge (the FocusDesk PWA).
    pub allowed_origins: Vec<String>,
    /// How long without a snapshot before the widget calls FocusDesk offline.
    pub stale_after_seconds: i64,
}

impl Default for WidgetConfig {
    fn default() -> Self {
        Self {
            port: 8787,
            allowed_origins: default_allowed_origins(),
            stale_after_seconds: 8,
        }
    }
}

impl WidgetConfig {
    /// Environment overrides — handy for `tauri dev`:
    /// `FOCUSDESK_WIDGET_PORT`, `FOCUSDESK_WIDGET_ORIGINS` (comma separated).
    pub fn with_env_overrides(mut self) -> Self {
        if let Ok(port) = std::env::var("FOCUSDESK_WIDGET_PORT") {
            if let Ok(parsed) = port.trim().parse::<u16>() {
                if parsed > 0 {
                    self.port = parsed;
                }
            }
        }
        if let Ok(origins) = std::env::var("FOCUSDESK_WIDGET_ORIGINS") {
            let list: Vec<String> = origins
                .split(',')
                .map(|origin| origin.trim().to_string())
                .filter(|origin| !origin.is_empty())
                .collect();
            if !list.is_empty() {
                self.allowed_origins = list;
            }
        }
        self.sanitised()
    }

    fn sanitised(mut self) -> Self {
        if self.port == 0 {
            self.port = default_port();
        }
        self.allowed_origins
            .retain(|origin| origin == "*" || origin.starts_with("http://") || origin.starts_with("https://"));
        if self.allowed_origins.is_empty() {
            self.allowed_origins = default_allowed_origins();
        }
        if self.stale_after_seconds < 2 {
            self.stale_after_seconds = 8;
        }
        self
    }
}

pub fn default_port() -> u16 {
    WidgetConfig::default().port
}

/// Load `config.json` from `dir`, creating it with defaults on first run.
/// Returns the config and the file path (for logging).
pub fn load(dir: &Path) -> (WidgetConfig, PathBuf) {
    let path = dir.join(CONFIG_FILE_NAME);
    let config = match std::fs::read_to_string(&path) {
        Ok(raw) => match serde_json::from_str::<WidgetConfig>(&raw) {
            Ok(parsed) => parsed.sanitised(),
            Err(error) => {
                eprintln!("[focus-widget] config.json is not readable ({error}) — using defaults");
                WidgetConfig::default()
            }
        },
        Err(_) => {
            let defaults = WidgetConfig::default();
            if let Ok(json) = serde_json::to_string_pretty(&defaults) {
                let _ = std::fs::create_dir_all(dir);
                let _ = std::fs::write(&path, format!("{json}\n"));
            }
            defaults
        }
    };
    (config.with_env_overrides(), path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_loopback_friendly() {
        let config = WidgetConfig::default();
        assert_eq!(config.port, 8787);
        assert!(config.allowed_origins.iter().all(|origin| origin.starts_with("http")));
        assert!(config.stale_after_seconds >= 2);
    }

    #[test]
    fn a_zero_port_falls_back_to_the_default() {
        let config = WidgetConfig {
            port: 0,
            ..WidgetConfig::default()
        }
        .with_env_overrides();
        assert_eq!(config.port, default_port());
    }

    #[test]
    fn nonsense_origins_are_dropped() {
        let config = WidgetConfig {
            allowed_origins: vec!["javascript:alert(1)".into(), "https://app.example.com".into()],
            ..WidgetConfig::default()
        }
        .with_env_overrides();
        assert_eq!(config.allowed_origins, vec!["https://app.example.com".to_string()]);
    }

    #[test]
    fn a_missing_file_is_created_with_defaults() {
        let dir = std::env::temp_dir().join(format!("focusdesk-widget-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let (config, path) = load(&dir);
        assert_eq!(config.port, 8787);
        assert!(path.exists(), "config.json should be written on first run");
        let (again, _) = load(&dir);
        assert_eq!(again.port, 8787);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
