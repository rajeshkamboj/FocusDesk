import type { ThemePreference } from './types';

export type CustomColors = {
  background: string;
  text: string;
  surface: string;
  accent: string;
  border: string;
  muted: string;
};

/**
 * Self-contained so the SAME validated engine can run before hydration.
 * No user code, CSS, or URLs are evaluated: only whitelisted hex colors enter tokens.
 */
function createThemeEngine() {
  return {
    themeKey: 'pace.theme',
    customKey: 'focusdesk.theme.custom.v1',
    themes: ['dark', 'pixldot', 'light', 'midnight', 'warm-paper', 'custom'] as const,
    defaults: {
      background: '#151613', text: '#ecece6', surface: '#1c1d19',
      accent: '#4fae8d', border: '#42443a', muted: '#a9aa9f',
    } as CustomColors,
    sessionPalette: null as CustomColors | null,
    normalizeTheme(value: unknown): ThemePreference {
      return this.themes.includes(value as ThemePreference) ? value as ThemePreference : 'dark';
    },
    hex(value: unknown): string | null {
      if (typeof value !== 'string') return null;
      const hex = value.trim().toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
      if (/^#[0-9a-f]{3}$/.test(hex)) return '#' + hex.slice(1).split('').map((c) => c + c).join('');
      return null;
    },
    palette(value: unknown): CustomColors {
      const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
      const result = { ...this.defaults };
      for (const key of Object.keys(result) as (keyof CustomColors)[]) result[key] = this.hex(source[key]) ?? this.defaults[key];
      return result;
    },
    readTheme(): ThemePreference {
      try {
        const value = window.localStorage.getItem(this.themeKey);
        if (value !== null) return this.normalizeTheme(value);
        const data = JSON.parse(window.localStorage.getItem('pace.db.v1') || '{}');
        return this.normalizeTheme(data?.settings?.appearance?.theme);
      } catch { return 'dark'; }
    },
    readPalette(): CustomColors {
      if (this.sessionPalette) return { ...this.sessionPalette };
      try { return this.palette(JSON.parse(window.localStorage.getItem(this.customKey) || 'null')); }
      catch { return { ...this.defaults }; }
    },
    luminance(hex: string): number {
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    },
    contrast(a: string, b: string): number {
      const first = this.luminance(a), second = this.luminance(b);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    },
    mix(a: string, b: string, amount: number): string {
      return '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount).toString(16).padStart(2, '0')).join('');
    },
    score(color: string, backgrounds: string[]): number {
      return Math.min(...backgrounds.map((bg) => this.contrast(color, bg)));
    },
    readable(color: string, backgrounds: string[]): string {
      let best = color;
      if (this.score(best, backgrounds) >= 4.5) return best;
      for (const target of ['#000000', '#ffffff']) {
        for (let step = 1; step <= 20; step++) {
          const candidate = this.mix(color, target, step / 20);
          if (this.score(candidate, backgrounds) > this.score(best, backgrounds)) best = candidate;
          if (this.score(candidate, backgrounds) >= 4.5) break;
        }
      }
      return best;
    },
    tokens(input: unknown): Record<string, string> {
      const p = this.palette(input);
      const dark = this.luminance(p.background) < 0.2;
      const onAccent = this.contrast('#ffffff', p.accent) >= this.contrast('#000000', p.accent) ? '#ffffff' : '#000000';
      const surface2 = this.mix(p.surface, p.text, 0.06), surface3 = this.mix(p.surface, p.text, 0.12);
      const accentSoft = this.mix(p.surface, p.accent, 0.18);
      const accentText = this.readable(p.accent, [p.background, p.surface, surface2, surface3, accentSoft]);
      return {
        'color-scheme': dark ? 'dark' : 'light',
        '--background': p.background, '--surface': p.surface, '--surface-2': surface2, '--surface-3': surface3,
        '--ink': p.text, '--ink-2': p.muted, '--ink-3': p.muted,
        '--line': p.border, '--line-strong': this.mix(p.border, p.text, 0.3),
        '--accent': p.accent, '--accent-hover': this.mix(p.accent, onAccent === '#ffffff' ? '#000000' : '#ffffff', 0.1),
        '--accent-soft': accentSoft, '--accent-ink': accentText, '--accent-text': accentText,
        '--accent-text-hover': accentText, '--on-accent': onAccent,
        '--switch-off-thumb': this.readable('#ffffff', [surface3]),
        '--focus-ring': this.readable(p.accent, [p.background, p.surface]),
        '--danger': dark ? '#f09d88' : '#993722', '--danger-soft': dark ? '#3a241c' : '#fbe9e4',
        '--warning': dark ? '#e0b866' : '#76520f', '--warning-soft': dark ? '#362c17' : '#fcf0cf',
        '--shadow-card': dark ? '0 1px 3px #00000040' : '0 1px 3px #0000000f',
        '--shadow-pop': dark ? '0 12px 32px #00000070' : '0 12px 32px #00000026',
      };
    },
    apply(preference: unknown): void {
      const theme = this.normalizeTheme(preference);
      const root = document.documentElement;
      // Remove only our custom tokens, never unrelated inline styles.
      const tokens = this.tokens(theme === 'custom' ? this.readPalette() : this.defaults);
      for (const [key, value] of Object.entries(tokens)) {
        if (theme === 'custom') root.style.setProperty(key, value);
        else root.style.removeProperty(key);
      }
      root.setAttribute('data-theme', theme);
    },
  };
}

const engine = createThemeEngine();
export const CUSTOM_COLORS_KEY = engine.customKey;
export const DEFAULT_CUSTOM_COLORS: Readonly<CustomColors> = Object.freeze({ ...engine.defaults });
export const THEME_OPTIONS = [
  { value: 'dark', label: 'Existing Dark', hint: 'The original calm green accents.', background: '#151613', surface: '#1c1d19', accent: '#4fae8d', ink: '#ecece6' },
  { value: 'pixldot', label: 'PixlDot', hint: 'Royal blue with warm coral highlights.', background: '#131620', surface: '#1a1e2b', accent: '#3757f5', ink: '#eef0f8' },
  { value: 'light', label: 'Light', hint: 'Clean white, with a little green.', background: '#f7f8f6', surface: '#ffffff', accent: '#1e6b52', ink: '#1b211d' },
  { value: 'midnight', label: 'Midnight', hint: 'Near-black, quiet charcoal, cool silver.', background: '#090b0e', surface: '#13161b', accent: '#a8b9cd', ink: '#f1f3f5' },
  { value: 'warm-paper', label: 'Warm Paper', hint: 'Soft ivory and warm amber ink.', background: '#f7f2e7', surface: '#fffcf5', accent: '#855216', ink: '#302a21' },
  { value: 'custom', label: 'Custom', hint: 'A palette that feels like you.', background: '#151613', surface: '#1c1d19', accent: '#4fae8d', ink: '#ecece6' },
] as const;

export function normalizeTheme(value: unknown): ThemePreference { return engine.normalizeTheme(value); }
export function normalizeHex(value: unknown): string | null { return engine.hex(value); }
export function normalizeCustomColors(value: unknown): CustomColors { return engine.palette(value); }
export function readStoredTheme(): ThemePreference { return engine.readTheme(); }
export function readCustomColors(): CustomColors { return engine.readPalette(); }
export function customThemeTokens(colors: CustomColors): Record<string, string> { return engine.tokens(colors); }
export function contrastRatio(a: string, b: string): number { return engine.contrast(a, b); }

/** Apply immediately; the existing key remains the early-startup settings cache. */
export function applyTheme(preference: ThemePreference) {
  const theme = normalizeTheme(preference);
  engine.apply(theme);
  try { window.localStorage.setItem(engine.themeKey, theme); } catch { /* session-only */ }
}

export function storeCustomColors(input: CustomColors): boolean {
  const colors = engine.palette(input);
  engine.sessionPalette = colors;
  let persisted = true;
  try { window.localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(colors)); }
  catch { persisted = false; }
  if (document.documentElement.dataset.theme === 'custom') engine.apply('custom');
  window.dispatchEvent(new Event('focusdesk:custom-colors'));
  return persisted;
}

/** Native storage events update other tabs; the custom event updates this tab. */
export function subscribeCustomColors(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== CUSTOM_COLORS_KEY && event.key !== null) return;
    engine.sessionPalette = null;
    if (document.documentElement.dataset.theme === 'custom') engine.apply('custom');
    onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('focusdesk:custom-colors', onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focusdesk:custom-colors', onChange);
  };
}

// Object methods keep all runtime dependencies inside the serialized function.
// The browser never evaluates palette contents: the code below is application code.
export const themeInitScript = `(function(){var engine=(${createThemeEngine.toString()})();engine.apply(engine.readTheme());})();`;
