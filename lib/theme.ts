'use client';

import type { ThemePreference } from './types';

const THEME_KEY = 'pace.theme';

export function readStoredTheme(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* ignore */
  }
  return 'system';
}

export function storeTheme(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_KEY, preference);
  } catch {
    /* ignore */
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies the theme immediately (data-theme attribute drives the tokens). */
export function applyTheme(preference: ThemePreference) {
  const resolved = preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;
  document.documentElement.setAttribute('data-theme', resolved);
  storeTheme(preference);
}

/** Keeps 'system' in sync with OS changes. Returns a cleanup function. */
export function watchSystemTheme(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (readStoredTheme() === 'system') applyTheme('system');
  };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
