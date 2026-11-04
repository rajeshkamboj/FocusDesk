# Projects & Goals: list ⇄ grid

Both screens keep their existing list and gain a **grid**: 1 column on a phone,
2 on a tablet (`sm`), 3 from desktop (`lg`). The switch sits in the toolbar next
to the sort control and is remembered per device.

## What does not change

- Every existing action: New Project / New Goal, per-row `⋯` menu (edit, status,
  archive, delete), expand/collapse, add task, add/edit/delete milestone, bulk
  select + bulk delete, and the status filters on Projects.
- Sorting (deadline/created, both directions) and filtering: the grid renders
  exactly the same sorted, filtered array the list does.
- The empty state and the shared loading state.
- The list itself. Its markup, spacing and behaviour are untouched; the grid is
  a second wrapper class around the same card component.

## The card

It is the same card in both layouts. Two small things make it work in a narrow
column:

- `h-full` so a row of cards shares one height;
- the progress row wraps instead of overflowing;
- an **expanded** card takes the full row back (`sm:col-span-2 lg:col-span-3`),
  because the task list inside it needs the width.

## The preference

`lib/view-mode.ts`, stored as `pace.viewMode.projects` / `pace.viewMode.goals`.

That is the app's **existing** convention for this-device view state — the same
one `pace.timerDock.collapsed` and `pace.lastSection` already use. Synced user
preferences (theme, display name, notifications) live in `Settings`; a
collection's layout is not one of those, so this adds **no settings screen, no
settings field, no schema change and no migration**.

Properties, all covered by `npm run verify:view-modes`:

- default is **list**, so nothing moves for an existing user;
- a stored value that is unreadable, unrecognised or foreign falls back to list;
- a storage that throws (private mode, quota) is ignored — the choice still
  applies for the session and the screen still works;
- the screen reads through `useSyncExternalStore` with `serverViewMode()` as the
  server snapshot, so server and first client paint both render the list: no
  hydration mismatch and no flash from list to grid;
- another tab's `storage` event updates the layout in this tab too.

## The switch

A `radiogroup` with two `role="radio"` buttons — one control with two states,
rather than two independent toggles — so `aria-checked` tells a screen reader
which layout is current. Arrow keys move between options, each option has a
visible focus ring, and on a phone the icons carry the control while the text
label is hidden to keep the toolbar from wrapping.

## Verifying

```bash
npm run verify:view-modes
```

15 checks: the preference (default, per-collection memory, unknown value,
throwing storage, no storage), the switch's markup and keyboard wiring, the
1/2/3 responsive classes, the retained list, filters, sorting, bulk actions,
expansion and empty states, the absence of any Settings/schema change, and the
re-render/cross-tab notification path. No browser, database or network needed.

## Screenshots

Captured from a browser session against this branch; the harness asserts the
layout classes because the sandbox has no browser. Grid at desktop width shows
three cards per row, at tablet width two, and at phone width one.
