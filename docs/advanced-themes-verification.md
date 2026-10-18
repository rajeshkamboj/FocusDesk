# Advanced themes — implementation and verification

## Review scope

- Session branch: `arena/4fb0fea3-focusdesk`. Arena fixes this session to this branch, so the requested `feature/focusdesk-advanced-themes` branch could not be created. This extends the existing unmerged branding work rather than discarding it or starting from an older `main`.
- Base before this extension: `20da718`.
- Review: https://github.com/rajeshkamboj/FocusDesk/pull/49 (draft; no automatic merge).
- Branch: https://github.com/rajeshkamboj/FocusDesk/tree/arena/4fb0fea3-focusdesk
- Branch preview: https://focus-desk-git-arena-4fb0fea3-focusdesk-pixldot.vercel.app
- Branch preview deployments are permitted by the user. No production promotion, merge, authentication change, schema change, or production environment change is part of this work.

## Features

The existing Appearance section now offers **six** choices (the request lists six despite the testing section saying five):

1. Existing Dark — original green palette, unchanged.
2. PixlDot — original blue `#3757F5`, coral `#E87552`, and dark surfaces, unchanged.
3. Light — near-white background, white cards, restrained green accents.
4. Midnight — near-black foundation, charcoal cards, cool silver accents.
5. Warm Paper — ivory, beige surfaces, amber/brown accents.
6. Custom — six editable colors: background, primary text, surface/card, accent, border, muted text.

Each theme has a preview swatch and a native radio control. The selector is one column on small phones and two columns at larger widths. Native radios provide keyboard navigation and checked semantics. Existing reduced-motion behavior is unchanged.

Custom exposes native color pickers and labelled hex inputs. Only `#RGB` and `#RRGGBB` are accepted (case-insensitive; surrounding whitespace is trimmed). Valid values normalize to six-digit lowercase hex. Invalid/incomplete values remain editable with an associated error while the last valid color stays active. Named colors, CSS expressions, alpha hex, JavaScript, URLs, and arbitrary CSS are not supported. No user code is evaluated.

Valid changes update the entire application immediately. The editor includes a live component preview, minimum contrast readouts, and warnings for text below 4.5:1 or accent indicators below 3:1 on background/card/nested surfaces. Reset Custom Colors restores the default custom palette without changing selection. Reset Theme returns to Existing Dark without erasing the custom palette. Both reset buttons use contrast-aware primary-control labels, so they remain usable even if custom text colors are poorly chosen.

## Token architecture

- Extends the existing `data-theme` attribute and semantic CSS variables in `app/globals.css`. Predefined themes use the same background, surface, ink, border, accent, warning, danger, shadow, and focus tokens consumed throughout the app. No new UI/theme library or competing provider was added.
- `lib/theme.ts` contains theme validation, custom palette validation, color math, token derivation, storage helpers, selector metadata, and the shared early-startup engine.
- Custom colors seed the same semantic tokens using validated root inline properties. Nested surfaces, hover colors, strong borders, accent text, focus rings, and active-control labels are derived centrally. Leaving Custom removes only these custom properties, not unrelated inline styles.
- Added semantic `--on-accent` / `text-on-accent` for filled-control labels and icons. Shared buttons, completion controls, tabs, badges/counts, navigation capture controls, and the existing app brand mark use it. It remains white in Existing Dark and PixlDot, preserving their appearance. Midnight uses a dark foreground on silver; Custom chooses black or white for at least 4.5:1 contrast against any valid accent, with a compatible hover fill.
- Added `--switch-off-thumb` for a visible inactive switch knob on light/custom surfaces. Existing dark-theme switch colors are unchanged.
- Warning/error colors remain semantically distinct and readable on their own soft surfaces; they are not replaced by the custom accent. Existing textual/icon task/status cues remain intact. Existing progress, chart, timer, dialog, menu, and form components continue to consume shared tokens.
- Timer Picture-in-Picture mirrors both the root `data-theme` and inline custom tokens, observing style updates so live color edits reach an already-open pop-out.
- Every original Existing Dark and PixlDot token compared equal to base `20da718`. The dedication, local PixlDot logo artwork, branding text, and routes are unchanged.

## Persistence and startup

- Selected theme: the established `settings.appearance.theme` repository API, with the existing `pace.theme` localStorage startup cache. Local/Supabase behavior for settings is unchanged; no schema migration is needed.
- Custom colors: separate namespaced localStorage key **`focusdesk.theme.custom.v1`**, containing only the six validated colors. Custom palettes are intentionally **device/browser-local**, independent of the selected theme. They are not added to imports/exports or Supabase records.
- Switching away/back, navigation, refresh, and reopening restore saved custom colors. Native storage events synchronize palette changes across tabs; a local event updates the current editor. A session palette allows immediate editing if writes are blocked, with a visible persistence warning.
- Missing/invalid theme values fall back to Existing Dark; legacy `system` is treated as obsolete. `light` is now a supported explicit choice. Missing/malformed palette values fall back field-by-field to safe defaults.
- The same self-contained, validated engine is used by the existing `beforeInteractive` script and client startup. It applies saved custom tokens as well as selection before hydration, minimizing flashes. Root HTML/CSS still defaults to Existing Dark. Serialization/startup parity is covered by tests and production-build browser checks.

## Verification results

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; all existing application routes built.
- `git diff --check`: passed.
- TS/TSX verification scripts: **23 passed, 1 existing failing script, 1 skipped**.
- `scripts/verify-advanced-themes.cjs`: passed against the production build in headless Chromium 153.
- `scripts/verify-branding-theme.cjs`: passed (branding/footer and original themes).
- `scripts/verify-ui-update.cjs`: passed (existing workflow and responsive checks).
- Original Dark/PixlDot token comparison against `20da718`: passed for every preexisting token.

### Targeted coverage

`verify-advanced-themes.ts` covers all six theme IDs, invalid/obsolete preferences, hex validation and CSS-injection rejection, partial/malformed palettes, independent persistence, inline token cleanup, startup parity, resets, cross-tab updates, blocked storage, black/white and hover label contrast, and unchanged user records through real local-repository fixture import/export.

The advanced browser check covers:

- All 11 screens in every theme at 320/768/1440px (including a short 480px desktop viewport): 198 route/theme/viewport combinations, with no horizontal document overflow.
- Immediate hex/native-picker updates, invalid values, shorthand expansion, contrast warnings, custom/predefined switching, native radio selection, both reset actions, and editor visibility/layout.
- SPA navigation without document reload, page refresh, a reopened browser context restored from persistent storage, and changes from another live tab.
- Computed normal/muted text contrast of at least 4.5:1 on all background/surface tokens for the supplied presets/default custom palette; danger/warning text contrast on semantic soft surfaces. Filled-control contrast is checked for PixlDot and all new themes; Existing Dark's legacy white-on-green treatment is deliberately preserved.
- No uncaught browser errors and byte-equivalent fixture records outside the appearance setting.
- Real task creation, timer start/pause, task completion, and an open timer PiP following custom accent edits and predefined/custom changes. Only the platform Document PiP window API is emulated with a normal same-origin popup; the real app components/state/styles are exercised.

The existing full suite additionally covers reminders, timer concurrency/dock/navigation/focused time, multi-tab data, project imports and milestones, task hierarchy, completion dates, review statistics/charts, bulk deletion, and mobile layout. The SQL check uses throwaway in-memory PGlite, not a live Supabase instance.

### Known limitations / remaining checks

- `verify-project-plan-subtasks.tsx` still has its previously reproduced baseline failure: 33 cases pass; the line-672 assertion expects `planned` while automatic carry-forward produces `today` for its dated fixture. Scheduling/task logic was not changed to hide that unrelated failure.
- `verify-learnings-backup.ts` requires a private backup export that was not supplied. It was skipped; no private records or production credentials were requested.
- A custom palette can deliberately choose unreadable text/background or invisible accent combinations. Those choices are preserved with live warnings rather than silently overwritten. Derived accent text/focus colors choose the best contrast practical; no single color can meet AA against every pair of arbitrarily opposed surfaces.
- Existing Dark's original white-on-green filled-control contrast is approximately 2.70:1. It is intentionally not changed by this task's preservation requirement. New custom filled controls automatically choose a readable foreground.
- Native OS color-picker chrome varies by browser. No full screen-reader audit or manual live-Supabase session was performed. Authentication and repository implementations are unchanged.
- Dependencies and package lock are unchanged. The earlier dependency installation reported existing advisories; dependency remediation is outside this theme extension.

## Files changed for this extension

- Theme architecture: `app/globals.css`, `lib/theme.ts`, `lib/types.ts`, `components/layout/app-shell.tsx`, `components/layout/timer-pip.tsx`.
- Appearance UI: new `components/settings/appearance-settings.tsx`, `components/settings/settings-screen.tsx`.
- Semantic accent foreground only: `components/ui/button.tsx`, `components/ui/form.tsx`, `components/ui/switch.tsx`, `components/ui/tabs.tsx`, `components/ui/bulk-select.tsx`, `components/tasks/task-row.tsx`, `components/tasks/task-subtasks.tsx`, `components/today/wellbeing-card.tsx`, `components/review/daily-review.tsx`, `components/review/weekly-review.tsx`, `components/review/monthly-review.tsx`, `components/calendar/calendar-screen.tsx`, `components/layout/sidebar.tsx`, `components/layout/mobile-nav.tsx`.
- Tests: new `scripts/verify-advanced-themes.ts`, new `scripts/verify-advanced-themes.cjs`, updated `scripts/verify-branding-theme.ts` for the newly supported Light value.
- Documentation: this document; a historical-note link in `docs/branding-theme-verification.md`.

Optional local test tools remain untracked/unlocked, following the existing verification-script convention. Generated test logs/screenshots stay under ignored `.next/`.

```sh
npx tsx scripts/verify-advanced-themes.ts
UI_TEST_URL=http://localhost:3000 UI_TEST_EXECUTABLE_PATH=/path/to/chromium node scripts/verify-advanced-themes.cjs
```
