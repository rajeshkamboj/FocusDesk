# Task actions on touch screens

`TaskRow` is the single task presentation used by Tasks, Today, Projects (including milestone hierarchies), Goals, Calendar and Review. Its three-dot button opens the same `Menu` children and action handlers on every screen and in both collection layouts. There is no separate or reduced mobile action list.

## Interaction contract

- **Desktop (fine pointer, hover, at least 640px):** retain the original compact 29px button, hidden until row hover or keyboard focus. An open menu keeps its button visible.
- **Small screens and touch-first devices:** always show a 44×44px button. Menu items are at least 44px high. The menu uses the existing theme surface, ink, border and shadow tokens.
- The menu is portaled to `document.body`, positioned against the trigger, flipped above when needed, constrained to the visual viewport, and scrollable when tall. Scroll/resize repositions it; scrolling the trigger out of view dismisses it.
- Outside pointerdown, choosing an action, Escape, focus leaving the menu, route change and unmount dismiss it. Escape/actions restore trigger focus; outside interaction does not steal focus.
- Trigger and portal stop event propagation so actions do not expand or select the row. Existing editors, date pickers, breakdown, clipboard feedback and deletion confirmation remain unchanged.
- No long-press recognizer is installed: normal scrolling, text selection and browser touch gestures remain untouched.

## Regression checks

The DOM-free/geometry and real-component checks run with the repository's existing `tsx`/`jsdom` verification-tool setup:

```sh
npm run verify:task-menu
npm run verify:task-context
npx tsx scripts/verify-timer-concurrency.tsx
npx tsx scripts/verify-bulk-delete.tsx
npm run verify:view-modes
npx tsc --noEmit
npm run lint
npm run build
npx tsx scripts/verify-mobile-layout.tsx
```

For a browser pass, run the app without Supabase credentials and seed only disposable browser-local data. Check:

1. 320×568, 390×844, 844×390 and 768×1024 with touch: visible 44px triggers, full action set, 44px items, no row selection/expansion, and no menu outside the viewport.
2. 1280×800 with mouse: original 29px hover reveal and unchanged row layout; keyboard arrows/Home/End/Escape and focus restoration.
3. Edit and save; Copy context for AI and inspect the clipboard without task mutation; Start, Complete, Reopen, Do tomorrow, Reschedule, Deadline, Break down, Someday and Cancel.
4. Delete with confirmation enabled: Keep preserves, Delete removes. Also verify the existing confirmation opt-out and always-on bulk-delete confirmation.
5. Outside tap, action selection, navigation, nested scrolling and a long menu whose final action must remain reachable.
6. Projects list/grid, Goals list/grid, Today, Calendar and Review; light and dark themes.
7. A touch swipe scrolls normally without opening a menu; browser console has no uncaught errors.
