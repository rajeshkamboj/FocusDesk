# Focus Desk branding and PixlDot theme

## Implementation

- Session branch: `arena/4fb0fea3-focusdesk` (Arena fixes this session to this separate branch; `main` was not modified).
- Visible product branding is **Focus Desk** in the desktop/mobile navigation, authentication screens, document/Apple/PWA titles, timer PiP title, and existing product help text. Internal repository, export format/filename, localStorage keys, notification identifiers, and database names remain unchanged.
- Sidebar footer includes “Developed with love for Rajesh Singh”, the unchanged local `public/Logo-2x.png` at 24 × 24 CSS pixels, and linked PixlDot text/logo. The PNG itself is 1080 × 1080, so its aspect ratio is preserved. The notice distinguishes local storage from the Supabase backend. The footer cannot shrink into navigation; the navigation scrolls independently on short screens.
- The existing Appearance section now has native keyboard-accessible radio cards for **Existing Dark** and **PixlDot**. The entire interface updates immediately via the existing `data-theme` attribute and semantic CSS variables, including timer PiP's existing attribute observer.
- All original dark tokens (backgrounds, surfaces, ink, accents, statuses, borders, shadows) compare equal to the base commit. PixlDot changes dark surfaces and accents, not warning/error semantics. Accent text and focus use a lighter blue than filled controls.

## Actual logo palette

Decoded opaque pixels of `public/Logo-2x.png`:

| Color | Opaque pixels | Use |
| --- | ---: | --- |
| Royal blue `#3757F5` | 673,080 | Primary controls and accent indicators |
| Coral `#E87552` | 175,694 | Quiet footer border highlight |

The transparent background is not treated as black branding. No logo artwork was modified.

PixlDot filled buttons with white text have calculated contrast of **5.46:1**, and **4.75:1** on hover. The dimmest text token has at least **4.78:1** against the theme's background/surface tokens; accent text has at least **7.99:1**. These are palette calculations, not a claim of a full accessibility audit. Existing Dark's legacy palette is deliberately unchanged.

## Persistence / compatibility

- Reuses `settings.appearance.theme` through the established local/Supabase repository API (the existing JSON settings field; no schema migration).
- Reuses `pace.theme` as the early-startup localStorage cache. If absent, startup can read the existing `pace.db.v1` appearance setting. No additional preference store or key was introduced.
- Existing Dark is the fallback for missing/invalid values and retired `light`/`system` preferences. Those legacy stored values are interpreted safely without resetting user records or writing a bulk migration. Only the two requested choices are exposed.
- Root HTML and CSS default to dark. The shared `beforeInteractive` script and client instrumentation restore saved choices before hydration; repository preferences are applied once loaded, as before.
- Storage access failures do not crash startup or prevent session-only switching. A rejected repository settings save is caught and rolls the optimistic UI back. Existing local-repository quota/in-memory fallback behavior is unchanged.

## Checks run (2026-10-18)

| Check | Result |
| --- | --- |
| `npm ci` | Passed; reported 7 existing high-severity dependency advisories. No dependency/lockfile upgrades in this UI change. |
| `npm run lint` | Passed |
| `npx tsc --noEmit` | Passed |
| `npm run build` | Passed; all application routes built |
| `git diff --check` | Passed |
| TS/TSX verification scripts | 22 passed, 1 existing failing script, 1 skipped; details below |
| `scripts/verify-branding-theme.cjs` | Passed in headless Chromium 153 |
| `scripts/verify-ui-update.cjs` | Passed in headless Chromium 153 |
| Original dark-token comparison | Passed for every original token |

The TS/TSX run covers workflow, timers/concurrency/navigation/dock, focused time, reminders, multi-tab persistence, bulk deletion, project imports/milestones, priorities, review charts/statistics, completion dates, and mobile layout. The SQL verification ran only in throwaway in-memory PGlite; no live Supabase access occurred.

### Known existing test failure

`verify-project-plan-subtasks.tsx`: 33 cases pass, one case fails at line 672 (`Child A` status is `today`, expected `planned`). Reproduced identically from an untouched `git archive` of base commit `ff872b3e2f51edaff21686c48341900121b8c009`. The fixture uses a scheduled date of 2026-10-12 while the current date is 2026-10-18, and automatic carry-forward applies. Task/scheduling logic was intentionally not changed for this branding task.

### Skipped check

`verify-learnings-backup.ts` requires the user's private JSON backup (normally 56 historical learning records). No private backup was supplied or accessed. The existing generic backup/normalization checks and targeted fixture record-preservation checks passed. Do not request production credentials for this check.

### Browser coverage

The new browser check verifies:

- Focus Desk titles/branding, dedication, PixlDot links, loaded logo size/aspect ratio.
- Dark default even with light OS preference; native radio selection and keyboard switching.
- Immediate semantic accent changes; readable computed accent text.
- Client-side sidebar navigation without reload, page reload, and a new browser context restored from persistent storage.
- Today, Inbox, Tasks, Projects, Goals, Calendar, Review, Learnings, Ideas, Curiosity, Settings in both themes at 320/390/1024/1440px. At 1024px it also checks a short 480px viewport, navigation access, and no footer collision.
- No horizontal document overflow, no uncaught browser runtime errors, and unchanged fixture records after theme changes.

The existing browser check verifies name persistence, greetings, daily quote stability, task completion/reopening, progress indicators, and mobile routes. Browser contexts were isolated, local-storage-only, with service workers blocked. Authenticated production/Supabase behavior was not manually exercised; authentication and repository implementations were not changed.

Optional local test tools were installed without changing package.json/package-lock.json: `tsx`, `jsdom`, `playwright`, `pngjs`, `@sparticuz/chromium`, `@electric-sql/pglite`. Chromium's bundled shared libraries were used only to run tests in the sandbox. Test output/screenshots stay in ignored `.next/`.

Re-run focused checks with optional tooling installed:

```sh
npx tsx scripts/verify-branding-theme.ts
UI_TEST_URL=http://localhost:3000 UI_TEST_EXECUTABLE_PATH=/path/to/chromium node scripts/verify-branding-theme.cjs
UI_TEST_URL=http://localhost:3000 UI_TEST_EXECUTABLE_PATH=/path/to/chromium node scripts/verify-ui-update.cjs
```

For the legacy browser check, omitting `UI_TEST_EXECUTABLE_PATH` retains its installed Microsoft Edge default. The new browser check uses Playwright Chromium by default.

## Changed files

- Theme/startup: `app/globals.css`, `app/layout.tsx`, `instrumentation-client.ts`, `lib/theme.ts`, `lib/types.ts`, `lib/store/defaults.ts`, `components/layout/app-shell.tsx`.
- Branding/footer/settings: `components/layout/sidebar.tsx`, `components/layout/mobile-nav.tsx`, `components/layout/timer-pip.tsx`, `components/auth/login-screen.tsx`, `components/auth/reset-password-screen.tsx`, `components/settings/settings-screen.tsx`, `components/settings/display-name-setting.tsx`, `components/settings/project-plan-import.tsx`, `components/calendar/calendar-screen.tsx`, `components/today/execution-warnings.tsx`, `public/manifest.webmanifest`.
- Verification: `scripts/verify-branding-theme.ts`, `scripts/verify-branding-theme.cjs`, `scripts/verify-focused-time.tsx`, `scripts/verify-priority-input.tsx`, `scripts/verify-ui-update.cjs`, this document. Existing assertions were updated only for renamed visible text, the semantic focus-ring token, or the replacement theme control.

## Deployment / review handoff

GitHub's repository metadata points at a Vercel site, and deployment history contains both Production and Preview deployments. There is no tracked Vercel or GitHub workflow configuration in the checkout that proves which branches are production-enabled. The Vercel dashboard's production-branch setting could not be verified from this environment. Consequently the implementation is committed **locally only**: no push, PR, merge, or production promotion was performed. No remote branch URL or PR URL exists for this change yet. A reviewer should verify that `arena/4fb0fea3-focusdesk` is preview-only before pushing it and opening a PR into `main`.
