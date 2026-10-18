'use client';

import { useState, useSyncExternalStore } from 'react';
import { useData } from '@/components/data/data-provider';
import { SectionTitle } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import {
  applyTheme, contrastRatio, customThemeTokens, DEFAULT_CUSTOM_COLORS,
  normalizeHex, normalizeTheme, readCustomColors, storeCustomColors,
  subscribeCustomColors, THEME_OPTIONS, type CustomColors,
} from '@/lib/theme';
import type { ThemePreference } from '@/lib/types';

const colorFields = [
  ['background', 'Background'], ['text', 'Primary text'], ['surface', 'Surface / card'],
  ['accent', 'Primary accent'], ['border', 'Border'], ['muted', 'Muted text'],
] as const;
const getPaletteSnapshot = () => JSON.stringify(readCustomColors());
const getServerPaletteSnapshot = () => JSON.stringify(DEFAULT_CUSTOM_COLORS);

export function AppearanceSettings() {
  const { data, actions, notify } = useData();
  const savedTheme = normalizeTheme(data.settings.appearance.theme);
  const [pendingTheme, setPendingTheme] = useState<ThemePreference | null>(null);
  const activeTheme = pendingTheme ?? savedTheme;
  const rawPalette = useSyncExternalStore(subscribeCustomColors, getPaletteSnapshot, getServerPaletteSnapshot);
  const colors = JSON.parse(rawPalette) as CustomColors;
  const [drafts, setDrafts] = useState<Partial<CustomColors>>({});
  const [storageWarning, setStorageWarning] = useState(false);

  const setTheme = async (theme: ThemePreference) => {
    if (pendingTheme) return;
    setDrafts({});
    setPendingTheme(theme);
    applyTheme(theme);
    try {
      await actions.updateSettings({ appearance: { theme } });
    } catch {
      applyTheme(savedTheme);
      notify('Could not save appearance. Please try again.');
    } finally {
      setPendingTheme(null);
    }
  };

  const saveColors = (next: CustomColors) => setStorageWarning(!storeCustomColors(next));
  const tokens = customThemeTokens(colors);
  const surfaces = [colors.background, colors.surface, tokens['--surface-2'], tokens['--surface-3']];
  const textContrast = Math.min(...surfaces.map((bg) => contrastRatio(colors.text, bg)));
  const mutedContrast = Math.min(...surfaces.map((bg) => contrastRatio(colors.muted, bg)));
  const accentContrast = Math.min(...surfaces.map((bg) => contrastRatio(colors.accent, bg)));

  return (
    <section aria-labelledby="appearance-title">
      <SectionTitle><span id="appearance-title">Appearance</span></SectionTitle>
      <div className="mt-3 space-y-5 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <p id="appearance-hint" className="text-[13px] text-ink-2">Choose how Focus Desk looks.</p>
        <fieldset aria-describedby="appearance-hint" disabled={pendingTheme !== null}>
          <legend className="sr-only">Theme</legend>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {THEME_OPTIONS.map((option) => {
              const swatch = option.value === 'custom'
                ? { background: colors.background, surface: colors.surface, accent: colors.accent, ink: colors.text }
                : option;
              const selected = activeTheme === option.value;
              return (
                <label key={option.value} className={`min-w-0 cursor-pointer rounded-xl border p-3 transition-colors ${
                  selected ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:border-line-strong hover:bg-surface-2'
                } ${pendingTheme ? 'cursor-wait opacity-70' : ''}`}>
                  <span aria-hidden="true" className="mb-3 flex h-12 items-center gap-2 overflow-hidden rounded-lg border border-black/10 p-2" style={{ background: swatch.background }}>
                    <span className="h-full w-5 rounded-sm" style={{ background: swatch.surface, borderLeft: `3px solid ${swatch.accent}` }} />
                    <span className="flex-1 space-y-1.5">
                      <span className="block h-1 w-3/4 rounded-full opacity-80" style={{ background: swatch.ink }} />
                      <span className="block h-1 w-1/2 rounded-full opacity-40" style={{ background: swatch.ink }} />
                    </span>
                    <span className="h-4 w-7 rounded-sm" style={{ background: swatch.accent }} />
                  </span>
                  <span className="flex items-start gap-2.5">
                    <input type="radio" name="theme" value={option.value} checked={selected}
                      onChange={() => void setTheme(option.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{option.label}</span>
                      <span className="mt-1 block text-[11.5px] text-ink-2">{option.hint}</span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {activeTheme === 'custom' ? (
          <div className="space-y-4 border-t border-line pt-5">
            <div>
              <h3 className="text-sm font-medium text-ink">Custom colors</h3>
              <p id="custom-color-help" className="mt-1 text-xs leading-relaxed text-ink-2">
                Changes preview instantly. Use #RGB or #RRGGBB. Your palette stays saved on this device when you switch themes.
              </p>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              {colorFields.map(([key, label]) => {
                const draft = drafts[key] ?? colors[key];
                const invalid = normalizeHex(draft) === null;
                return (
                  <div key={key} className="min-w-0">
                    <label htmlFor={`custom-${key}-hex`} className="mb-1.5 block text-xs font-medium text-ink">{label}</label>
                    <div className="flex min-w-0 items-center gap-2">
                      <input type="color" value={colors[key]} aria-label={`${label} color`}
                        className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
                        onChange={(event) => {
                          const color = normalizeHex(event.target.value);
                          if (!color) return;
                          setDrafts((current) => ({ ...current, [key]: color }));
                          saveColors({ ...colors, [key]: color });
                        }} />
                      <Input id={`custom-${key}-hex`} aria-label={`${label} hex`} value={draft}
                        spellCheck={false} autoComplete="off" maxLength={32}
                        aria-invalid={invalid} aria-describedby={invalid ? `custom-${key}-error` : 'custom-color-help'}
                        className="min-w-0 flex-1 font-mono"
                        onChange={(event) => {
                          const value = event.target.value;
                          setDrafts((current) => ({ ...current, [key]: value }));
                          const color = normalizeHex(value);
                          if (color) saveColors({ ...colors, [key]: color });
                        }}
                        onBlur={() => {
                          if (!invalid) setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
                        }} />
                    </div>
                    {invalid ? <p id={`custom-${key}-error`} className="mt-1 text-xs text-danger" role="status">Use #RGB or #RRGGBB. The last valid color is still applied.</p> : null}
                  </div>
                );
              })}
            </div>
            <div aria-label="Custom color preview" className="rounded-xl border border-line bg-surface-2 p-4">
              <p className="text-sm font-medium text-ink">A little room to focus</p>
              <p className="mt-1 text-xs text-ink-2">A live preview of your text, cards, borders and controls.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm">Primary button</Button>
                <span className="rounded-md bg-accent-soft px-2 py-1 text-xs text-accent-ink">Selected</span>
                <span className="rounded-md bg-warning-soft px-2 py-1 text-xs text-warning">Warning</span>
                <span className="rounded-md bg-danger-soft px-2 py-1 text-xs text-danger">Overdue</span>
              </div>
            </div>
            <p className="text-xs text-ink-2">Minimum text contrast: {textContrast.toFixed(2)}:1 · Muted: {mutedContrast.toFixed(2)}:1 · Accent: {accentContrast.toFixed(2)}:1</p>
            {textContrast < 4.5 || mutedContrast < 4.5 || accentContrast < 3 ? (
              <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
                Low contrast: aim for at least 4.5:1 for text and 3:1 for accent indicators on all surfaces. Adjust your colors, or reset custom colors.
              </p>
            ) : null}
            {storageWarning ? <p role="status" className="text-xs text-danger">Browser storage is unavailable. These colors will last only for this session.</p> : null}
            <Button variant="primary" onClick={() => { setDrafts({}); saveColors({ ...DEFAULT_CUSTOM_COLORS }); }}>Reset Custom Colors</Button>
          </div>
        ) : null}
        <div className="border-t border-line pt-4">
          <Button variant="primary" disabled={pendingTheme !== null} onClick={() => void setTheme('dark')}>Reset Theme</Button>
          <p className="mt-2 text-[11.5px] text-ink-2">Return to Existing Dark without erasing your custom colors.</p>
        </div>
      </div>
    </section>
  );
}
