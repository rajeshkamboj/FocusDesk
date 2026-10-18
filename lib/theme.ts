import type { ThemePreference } from './types';

// Keep the existing key and repository-backed appearance setting: no new store.
const THEME_KEY = 'pace.theme';

/** Retired Light/System preferences and malformed values safely use Existing Dark. */
export function normalizeTheme(value: unknown): ThemePreference {
  return value === 'pixldot' ? 'pixldot' : 'dark';
}

export function readStoredTheme(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    if (value !== null) return normalizeTheme(value);
    const data = JSON.parse(window.localStorage.getItem('pace.db.v1') || '{}');
    return normalizeTheme(data?.settings?.appearance?.theme);
  } catch {
    return 'dark';
  }
}

/** Applies immediately; pace.theme is the early-startup cache of appearance.theme. */
export function applyTheme(preference: ThemePreference) {
  const theme = normalizeTheme(preference);
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be blocked. Theme switching still works for this session.
  }
}

/** Shared by the beforeInteractive script; instrumentation uses the same policy. */
export const themeInitScript = `(function(){var t;try{t=localStorage.getItem('${THEME_KEY}');if(t===null){var d=JSON.parse(localStorage.getItem('pace.db.v1')||'{}');t=d&&d.settings&&d.settings.appearance&&d.settings.appearance.theme;}}catch(e){}document.documentElement.setAttribute('data-theme',t==='pixldot'?'pixldot':'dark');})();`;
