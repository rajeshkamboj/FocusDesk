# FocusDesk project plan — `focusdesk-project-plan` v1

The JSON format FocusDesk imports to turn a plan written in ChatGPT into real
records:

```
Goal → Project → Project Milestone → Task
```

Import it in the app: **Settings → Data → Import Project Plan**. Paste the
JSON (or choose a file), read the preview, press **Import plan**. Nothing is
written before you confirm, and nothing that already exists is ever changed —
a plan only *adds* records.

The importer is application-level. It needs no API key, calls no AI service and
runs no migration: you generate the JSON in ChatGPT yourself and paste it in.

Code: `lib/project-plan.ts` (format, validation, preview) ·
`AppRepository.importProjectPlan` (the write) ·
`components/settings/project-plan-import.tsx` (the UI).
A working example lives in `fixtures/focusdesk-project-plan-v1.json`.

---

## 1. Structure

```jsonc
{
  "format": "focusdesk-project-plan",   // required, exactly this string
  "version": 1,                         // required, the number 1
  "name": "…",                          // optional label, shown in the preview only

  "goal": { … },                        // optional — at most one
  "projects": [ … ],                    // the usual body of a plan
  "projectMilestones": [ … ],           // optional flat milestones (see §3.3)
  "tasks": [ … ]                        // optional tasks with no project
}
```

### Goal

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | no | Temporary id, import-only (see §4) |
| `name` | string | **yes** | Non-blank |
| `description` | string | no | |
| `deadline` | `YYYY-MM-DD` | no | |
| `status` | `active` \| `completed` \| `archived` | no | Default `active` |

### Project

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | no | Temporary id |
| `name` | string | **yes** | Non-blank |
| `description` | string | no | |
| `deadline` | `YYYY-MM-DD` | no | |
| `status` | `active` \| `on_hold` \| `completed` \| `archived` | no | Default `active` |
| `milestones` | array | no | Project Milestones of this project, in order |
| `tasks` | array | no | Tasks of this project that sit in no milestone |

A project belongs to the plan's `goal` when the plan has one. There is no
`goalId` on a project: a plan has exactly one goal or none.

### Project Milestone

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | no | Temporary id |
| `projectId` | string | only in the flat array | Must name a project of the plan |
| `name` | string | **yes** | Non-blank |
| `description` | string | no | |
| `targetDate` | `YYYY-MM-DD` | no | A real calendar date, not a partial one |
| `tasks` | array | no | Tasks inside this milestone |

`position` is **not** a field of the format. FocusDesk derives it from the order
in the JSON: the first milestone of a project gets `0`, the next `1`, and so on.
Never from a date, a name or a creation time.

### Task

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | no | Temporary id |
| `projectId` | string | no | Only on a top-level task, or to confirm the project it already sits in |
| `milestoneId` | string | no | Only outside a milestone; must be a milestone **of the task's own project** |
| `title` | string | **yes** | Non-blank |
| `description` | string | no | |
| `status` | `created` \| `planned` \| `today` \| `in_progress` \| `completed` \| `incomplete` \| `someday` \| `cancelled` | no | Default `created` |
| `priority` | `high` \| `medium` \| `low` | no | Default `medium` |
| `scheduledDate` | `YYYY-MM-DD` | no | When you plan to work on it |
| `dueDate` | `YYYY-MM-DD` | no | The hard deadline |
| `estimatedDuration` | integer | no | Minutes, 1 or more |
| `notes` | string | no | |
| `tags` | string[] | no | Non-empty strings |

Anything else in the format is not a FocusDesk task field and will be reported
and ignored. In particular a plan cannot set `completedAt`, `actualDuration*`,
timer state, `parentTaskId`/subtasks, `recurrence`, `archived` or a `goalId`.

---

## 2. Complete example

```json
{
  "format": "focusdesk-project-plan",
  "version": 1,
  "name": "PatientScure Development Plan",
  "goal": {
    "name": "Build and grow PatientScure",
    "description": "A WordPress-based patient engagement platform.",
    "deadline": "2026-12-31"
  },
  "projects": [
    {
      "id": "p1",
      "name": "PatientScure Website",
      "description": "Marketing site plus the WordPress REST integration.",
      "deadline": "2026-12-31",
      "status": "active",
      "milestones": [
        {
          "id": "m1",
          "name": "Foundation",
          "targetDate": "2026-10-15",
          "tasks": [
            {
              "title": "Set up project structure",
              "description": "Theme, plugins, local environment.",
              "dueDate": "2026-10-10",
              "priority": "high",
              "estimatedDuration": 120
            },
            { "title": "Configure WordPress API", "dueDate": "2026-10-14" }
          ]
        },
        {
          "id": "m2",
          "name": "SEO",
          "targetDate": "2026-10-30",
          "tasks": [
            { "title": "Configure sitemap" },
            { "title": "Write the first three service pages", "priority": "medium" }
          ]
        }
      ],
      "tasks": [
        { "title": "Renew the domain registration", "dueDate": "2026-11-01" },
        { "title": "Prepare the launch checklist", "milestoneId": "m2" }
      ]
    },
    {
      "id": "p2",
      "name": "PatientScure Onboarding",
      "status": "on_hold",
      "tasks": [{ "title": "Draft the intake form", "status": "someday" }]
    }
  ],
  "tasks": [
    { "title": "Review documentation", "scheduledDate": "2026-10-09" }
  ]
}
```

That plan creates **1 goal, 2 projects, 2 project milestones and 6 tasks**:

```
Goal: Build and grow PatientScure · deadline 2026-12-31
├── PatientScure Website · deadline 2026-12-31
│   ├── Foundation · target 2026-10-15 — 2 tasks
│   │   ├── Set up project structure · due 2026-10-10
│   │   └── Configure WordPress API · due 2026-10-14
│   ├── SEO · target 2026-10-30 — 3 tasks
│   │   ├── Configure sitemap
│   │   ├── Write the first three service pages
│   │   └── Prepare the launch checklist          ← joined by "milestoneId": "m2"
│   └── Renew the domain registration · due 2026-11-01
└── PatientScure Onboarding · On Hold
    └── Draft the intake form · Someday

Tasks without a project
└── Review documentation · scheduled 2026-10-09
```

The three smaller shapes are all valid on their own:

```jsonc
// Project → Task, no goal, no milestones
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [{ "name": "Kitchen rebuild", "tasks": [{ "title": "Order the sink" }] }] }

// Tasks with no project at all
{ "format": "focusdesk-project-plan", "version": 1,
  "tasks": [{ "title": "Review documentation" }, { "title": "Call the dentist" }] }

// A goal with projects, and nothing else
{ "format": "focusdesk-project-plan", "version": 1,
  "goal": { "name": "Run a marathon" },
  "projects": [{ "name": "Marathon 2027" }] }
```

---

## 3. Rules

### 3.1 The envelope is checked first

* `format` must be exactly `"focusdesk-project-plan"`.
* `version` must be exactly the number `1` (not `"1"`).
* A FocusDesk **data export** is refused here, with a message pointing at
  Settings → Data → Import (JSON) — the two do opposite things.
* A top-level `milestones` array is refused. In a FocusDesk export that key
  means **Learnings** (the learning timeline), which is a different feature and
  is never imported as Project Milestones.
* ```json … ``` fences around the plan are tolerated and stripped.

### 3.2 Names, titles and dates

* `goal.name`, `projects[].name`, milestone `name` and task `title` are
  required and may not be blank. Whitespace around them is trimmed.
* Every date is a **full ISO date**, `YYYY-MM-DD`, and a real calendar day:
  `2026-02-30` is refused. Timestamps (`2026-10-10T00:00:00Z`), partial dates
  (`2026-10`) and locale formats (`10/15/2026`) are refused too — a FocusDesk
  date is a local calendar day, and guessing one would move it.
* Dates in the past are allowed and produce a warning.

### 3.3 Where a record may appear

* Milestones live in `projects[].milestones`, **or** in the top-level
  `projectMilestones` array where each one names its project with `projectId`.
  Nested ones come first; flat ones are appended after them, and positions
  follow that order.
* Tasks live inside a milestone, directly inside a project, or in the
  top-level `tasks` array (no project).
* A task's project comes from **where it sits**. An explicit `projectId` may
  only agree with that; naming a different project is an error. Repeating the
  project it already sits in is a warning and is ignored.
* `milestoneId` is how a task *outside* a milestone joins one. The milestone
  must exist in the plan and must belong to the task's project — a task can
  never carry a milestone of another project.
* A milestone inside a project must not carry a conflicting `projectId`.

### 3.4 Statuses and enums

Status and priority values are matched case-insensitively and accept `-` or a
space where the model has `_` (`On Hold`, `on-hold` and `on_hold` are the same).
Any other value is an error listing the supported ones — the importer never
invents a status.

### 3.5 Errors versus warnings

An **error** refuses the whole plan; nothing is written. A **warning** is shown
and the import may proceed unchanged.

| Error | Warning |
|---|---|
| missing or wrong `format` / `version` | a field FocusDesk does not have (ignored) |
| missing name / title | a date in the past |
| malformed or impossible date | a plan with no goal |
| unsupported status or priority | a task with no milestone, or no project |
| unknown temporary id reference | a task scheduled after its own deadline |
| duplicate temporary ids | a task imported as `completed` |
| milestone in a project that is not in the plan | two projects sharing a name |
| task in a project that is not in the plan | a project with no milestones and no tasks |
| task carrying a milestone of another project | a redundant `projectId` / `milestoneId` |
| plan that would create nothing | |
| plan above the size limits | |
| project milestones when migration 008 is not applied | |

Limits: 100 projects, 500 project milestones, 2000 tasks per import. Split a
bigger plan and import it in parts.

### 3.6 Duplicates

**Import as new, always.** If a project in the plan has the same name
(case-insensitive) as an existing one, the preview says so and asks you to
confirm — FocusDesk then creates a second project with that name. It never
merges, renames, updates or deletes the existing project, its tasks or its
milestones. The same is true of goals: a plan's goal is always created new, and
is never matched against an existing goal by name.

---

## 4. Temporary ids

An `id` in a plan is **import-only**. It exists so records can refer to each
other (`milestoneId`, `projectId`), and it is thrown away at write time:

* FocusDesk generates the real ids with its own generator (`crypto.randomUUID`),
  exactly as it does for a record created in the UI.
* Every reference is rewritten through the temporary → real map, so `m1`
  becomes the real Project Milestone id and `t7` the real Task id.
* Ids must be unique **across the whole plan** (one namespace); a duplicate is
  an error, because it would make every reference to it ambiguous.
* Records without an `id` are fine — the importer makes an internal key for
  them. Only add ids where a relationship needs one.
* A temporary id is never stored as a primary key, so a plan cannot collide
  with, overwrite or address an existing record — not even by guessing a UUID.

---

## 5. What the importer guarantees

* **Validation before writing.** The whole tree is parsed, validated and
  resolved first. If anything is wrong, nothing at all is written.
* **All or nothing.** Local storage writes a plan in a single store operation.
  Supabase has no cross-table transaction over PostgREST, so records are
  inserted parents-first (goals → projects → project milestones → tasks) in
  whole batches, and if any request fails the rows that did land are deleted
  again and the failure is reported. An import either happened completely or
  the app says it did not.
* **Additive only.** The format has no update and no delete. Existing goals,
  projects, tasks, project milestones, learnings, priorities, notes and timer
  sessions are untouched.
* **Authenticated, RLS-respecting writes.** Records go through the same
  `DataProvider` → `AppRepository` path as every other change and are written
  as the signed-in user. No service-role key, no SQL from the browser, and a
  `user_id` in the JSON would be an unsupported field — it is never read.
* **Positions from the JSON order.** Milestone 1 → `position` 0, milestone 2 →
  `1`, and so on, per project.
* **Completed tasks get a date.** A task imported with `status: "completed"` is
  stamped with the import time as its `completedAt`, so it appears as completed
  work on the day you imported it (and the preview warns you).

---

## 6. Invalid examples

Every one of these is refused in full — nothing is written.

```jsonc
// Wrong format string
{ "format": "focusdesk-plan", "version": 1, "projects": [] }
// → “format” must be “focusdesk-project-plan”.

// Version as a string
{ "format": "focusdesk-project-plan", "version": "1" }
// → “version” must be the number 1.

// A FocusDesk backup pasted into the plan importer
{ "tasks": [ … ], "learnings": [ … ], "settings": { … } }
// → That looks like a FocusDesk data export, not a project plan.

// The legacy Learnings key
{ "format": "focusdesk-project-plan", "version": 1,
  "milestones": [{ "title": "React.js", "date": "2025-02" }] }
// → A top-level “milestones” array is not part of a project plan …

// Missing task title
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [{ "name": "Site", "tasks": [{ "description": "no title" }] }] }
// → This task needs “title”.

// Empty milestone name
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [{ "name": "Site", "milestones": [{ "name": "   " }] }] }
// → This project milestone needs “name”.

// Not a date FocusDesk can store
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [{ "name": "Site", "deadline": "31/12/2026" }] }
// → Use a full ISO date, YYYY-MM-DD.

// An impossible day, and a timestamp
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [{ "name": "Site", "milestones": [{ "name": "M", "targetDate": "2026-02-30" }],
                 "tasks": [{ "title": "T", "dueDate": "2026-10-10T00:00:00Z" }] }] }

// Unsupported status
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [{ "name": "Site", "status": "wip" }] }
// → Supported values: active, on_hold, completed, archived.

// Reference to a milestone that does not exist
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [{ "id": "p1", "name": "Site", "tasks": [{ "title": "T", "milestoneId": "m9" }] }] }
// → This task refers to a project milestone “m9”, which does not exist in this plan.

// A task pointing at a milestone of another project
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [
    { "id": "p1", "name": "Site", "milestones": [{ "id": "m1", "name": "Foundation" }] },
    { "id": "p2", "name": "App",  "tasks": [{ "title": "T", "milestoneId": "m1" }] }
  ] }
// → Task “T” is in a different project than milestone “m1”.

// A task with a milestone but no project
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [{ "id": "p1", "name": "Site", "milestones": [{ "id": "m1", "name": "Foundation" }] }],
  "tasks": [{ "title": "T", "milestoneId": "m1" }] }
// → Move the task into that milestone, or give it the milestone’s “projectId”.

// A flat milestone that names no project (or a project that is not there)
{ "format": "focusdesk-project-plan", "version": 1,
  "projectMilestones": [{ "name": "Foundation" }] }
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [{ "id": "p1", "name": "Site" }],
  "projectMilestones": [{ "projectId": "p9", "name": "Foundation" }] }

// Duplicate temporary ids
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [{ "id": "p1", "name": "Site" }, { "id": "p1", "name": "App" }] }
// → The temporary id “p1” is used twice …

// A second goal, or a per-project goal
{ "format": "focusdesk-project-plan", "version": 1,
  "goal": { "name": "One" }, "goals": [{ "name": "Two" }] }
{ "format": "focusdesk-project-plan", "version": 1,
  "projects": [{ "name": "Site", "goalId": "g1" }] }
// → “goalId” is not supported on project: a plan has at most one goal …

// Nothing to create
{ "format": "focusdesk-project-plan", "version": 1, "projects": [] }
// → This plan would create nothing.

// Not JSON at all
{ "format": "focusdesk-project-plan", …
// → That is not valid JSON — …
```

---

## 7. Copy-paste prompt for ChatGPT

> Create a FocusDesk project plan JSON for the project below.
>
> Return **JSON only** — no Markdown, no code fences, no commentary before or
> after the JSON object.
>
> Use exactly this format:
>
> - Top level: `"format": "focusdesk-project-plan"`, `"version": 1`, then
>   optionally `"name"`, `"goal"`, `"projects"`, `"projectMilestones"`,
>   `"tasks"`. No other top-level keys.
> - `"goal"` is a single object (`name`, optional `description`, `deadline`,
>   `status`). Only include it if I gave you a real goal — never invent one,
>   and never add more than one.
> - Each project: `name` (required), optional `description`, `deadline`,
>   `status` (`active` | `on_hold` | `completed` | `archived`), then
>   `milestones` and/or `tasks`.
> - Each milestone: `name` (required), optional `description`, `targetDate`,
>   `tasks`. Put milestones inside their project, in the order they should
>   appear — the order is the only thing that decides their position.
> - Each task: `title` (required), optional `description`, `status`
>   (`created` | `planned` | `today` | `in_progress` | `completed` |
>   `incomplete` | `someday` | `cancelled`), `priority` (`high` | `medium` |
>   `low`), `scheduledDate`, `dueDate`, `estimatedDuration` (whole minutes),
>   `notes`, `tags` (array of strings).
> - Every date is a full ISO date, `YYYY-MM-DD`, and a real calendar day.
> - Use only these fields. Do **not** add fields FocusDesk does not have (no
>   `owner`, `dependencies`, `progress`, `goalId`, `position`, `id` unless a
>   reference needs it, no `user_id`).
> - Keep the hierarchy intact: a task goes inside the milestone it belongs to.
>   Tasks that belong to the project but to no milestone go in the project's
>   own `tasks` array. Tasks that have no project go in the top-level `tasks`
>   array.
> - Add `"id"` values only where a relationship needs one — short temporary ids
>   like `"p1"`, `"m1"`, `"t1"`, unique across the whole plan. They are
>   import-only and are replaced by real ids. Use `"milestoneId"` on a task
>   outside its milestone, and `"projectId"` on a milestone in the top-level
>   `"projectMilestones"` array.
> - A task may only reference a milestone of its own project.
> - Do not mark tasks `completed` unless I told you they are done.
>
> The project:
>
> *[describe the project, its milestones and its tasks here — dates, deadlines
> and priorities if you have them]*

Then copy the JSON into FocusDesk → **Settings → Data → Import Project Plan**,
check the preview (counts, hierarchy, warnings) and press **Import plan**.

---

## 8. Versioning

`version: 1` is the only version this build understands. A plan with any other
version is refused with a message saying so, rather than being guessed at. When
a version 2 exists it will be a new document
(`docs/focusdesk-project-plan-v2.md`) and version 1 plans will keep importing.

Not in version 1, deliberately: CSV, recurring imports, updates to existing
records, subtasks, goal matching by name, and any AI/API integration.
