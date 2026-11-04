# Task context copy

Every task carries an action — **Copy context for AI…** — that puts a clean
Markdown brief of that task on the clipboard. Paste it into ChatGPT, Gemini,
Claude or any other assistant and it reads as a description of the work, with no
system detail attached.

## Where it is

- **Task row → `⋯` menu → Copy context for AI…** on Tasks, Today, Projects,
  Goals, the review screens and anywhere else a task row appears.
- **Task details (Edit task) → footer → Copy context for AI** on the left of the
  Cancel/Save pair.

Both are ordinary buttons, so the action is reachable by Tab, activated with
Enter or Space, and tappable on a phone. Success or failure is reported twice: a
toast in the corner, and an `aria-live` announcement for a screen reader. When
the browser refuses clipboard access the toast says so — the action never claims
a copy that did not happen.

## What the block contains

Only fields that actually have a value, in this order:

| Field | Rendered as |
| --- | --- |
| Title | `# <title>` |
| Status, priority | one line: `**Status:** In progress · **Priority:** High` |
| Start date, due date | the same line, as `6 November 2026` |
| Project (+ milestone), goal | `**Project:** Q4 lifecycle refresh · Email sequence` |
| Tags | `**Tags:** marketing, writing` |
| Description | `## Description`, then the text as written |
| Notes / context | `## Notes and context` |
| Subtasks | `## Subtasks`, as a `- [ ]` / `- [x]` checklist, then `1 of 2 complete.` |
| Tasks broken out of this one | `## Child tasks`, each with its status |
| Links | `## Links` — every URL already written in the description or notes |

An empty field is **omitted**, never printed as an empty label: "Priority:"
followed by nothing reads as a missing decision rather than an absent field.

## What it never contains

Internal ids (task, project, goal, milestone, parent), sync timestamps
(`createdAt`, `startedAt`, `pausedAt`, raw `completedAt` instants), timer
counters, postponement counts, archive flags, reminder instants, and any
authentication, account or storage detail. `lib/task-context.ts` is the only
place this is decided, and `scripts/verify-task-context.tsx` asserts it.

## Escaping

User text is escaped so it can never restructure the pasted Markdown: a task
called `# Release notes` becomes `# \# Release notes` (still the single H1), a
`##` line inside a description is escaped so it cannot open a new section, a
`===` underline cannot turn the previous line into a heading, and `*`, `` ` ``,
`[`, `|`, `+` and friends in titles and tags are inert. Line structure inside a
description or notes block — blank lines, indentation, plain `-` bullets typed by
the user — is preserved, because that is how people write notes.

## It is read-only

Copying performs no write of any kind. The task, its subtasks and every other
record are byte-identical afterwards; the harness asserts this on a full data
snapshot.

## Verifying

```bash
npm run verify:task-context
```

18 checks: complete fields, title-only tasks, partial data, dangling references,
subtask ordering and completion, Markdown escaping, the absence of internal data,
date and link extraction, the real clipboard write, the legacy textarea fallback,
blocked-clipboard failure, non-mutation, determinism and the keyboard-reachable
presentation. No credentials, database or network access required.
