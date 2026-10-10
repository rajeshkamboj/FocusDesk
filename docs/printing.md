# Printing

How FocusDesk behaves on paper, and what each part is responsible for.

## What you get

- **Print buttons** on the two natural print destinations — **Today** (header,
  next to the progress) and **Review** (next to the Daily/Weekly/Monthly tabs,
  prints whichever tab is active). Any other section prints the same way with
  `Ctrl/Cmd + P`.
- **A clean document, not a screenshot.** In print the app chrome is removed:
  sidebar, mobile nav, quick-capture, timer dock, focus mode, toasts, modals,
  dropdown menus, filter tabs and every action button. A print-only header bar
  (`components/layout/print-header.tsx`) marks the document with the brand,
  the section and the date it was printed.
- **Works in dark mode.** Print forces the light design tokens, so a dark
  theme on screen can never produce light-on-white invisible text.
- **Completed tasks are legible without colour** (title is struck through in
  print), so a printed task list reads correctly even with
  "Background graphics" switched off in the dialog.
- **Sane pagination.** Cards, list rows and table rows avoid splitting across
  pages where they fit; headings never start the last line of a page;
  paragraphs keep `orphans/widows: 2`.

## Two-sided (duplex) printing

The browser's print dialog owns the duplex switch — a web page cannot turn on
"Print on both sides" programmatically, and it should not: paper size,
orientation and duplex mode are the user's (or the office printer's) choice.
What the app is responsible for is that **two-sided output looks right**, and
that is the `@page` block in `app/globals.css`:

```css
@page        { margin: 13mm 13mm 15mm 16mm; }  /* left = binding gutter */
@page :left  { margin-right: 16mm; }           /* verso:  gutter on right */
@page :right { margin-left:  16mm; }           /* recto:  gutter on left  */
```

Long-edge binding is the default duplex mode: odd (recto) pages bind on the
left, even (verso) pages on the right.

- Browsers that honour the CSS Paged Media `:left`/`:right` page
  pseudo-classes move the 16mm gutter to the correct side of every page, so
  text is never caught in the binding on either side of the sheet.
- Browsers that ignore them (most today) fall back to the base rule: every
  page gets the wider left margin — the safe shape for long-edge binding.

Either way, choosing **"Print on both sides"** in the dialog produces a
document whose text clears the binding. Short-edge binding and single-sided
printing also work — the wider left margin simply reads as an ordinary margin.

To verify: open Review → Daily (or any section), press the **Print** button,
set the printer to "Print on both sides — flip on long edge", and print a
multi-page document (a busy week on Weekly Review is a good test).

## Colour

The print rules set `print-color-adjust: exact`, so when "Background
graphics" is enabled in the dialog the document keeps its ink: progress
segments, chart bars, badges and status tints print as designed. With it
disabled the document still reads — text and line structure carry the content
— because nothing important is conveyed by fill alone (every chart bar has
its value printed above it).

## Where each piece lives

| Concern                          | Location                                        |
| -------------------------------- | ----------------------------------------------- |
| `@page` margins + duplex gutter  | `app/globals.css` (`@page` block)               |
| Print media rules (theme, breaks)| `app/globals.css` (`@media print` block)        |
| Print-only document header       | `components/layout/print-header.tsx`            |
| Chrome hidden in print           | `print:hidden` on the chrome roots (sidebar,    |
|                                  | mobile nav, quick-add, dock, focus mode, toast, |
|                                  | modal, menu, buttons, tabs, task-row controls)  |
| Print buttons                    | `components/today/today-screen.tsx`,            |
|                                  | `components/review/review-screen.tsx`           |

## Deliberately not done

- **No forced paper size or orientation.** `@page` only declares margins;
  A4/Letter and portrait/landscape stay with the dialog so the app works with
  whatever paper is in the printer.
- **No server-side PDF generation.** `window.print()` → the OS dialog is the
  whole pipeline: no extra service, and the user's preferred printer, PDF
  target and duplex setting all apply unchanged.
