# FocusDesk project plan — `focusdesk-project-plan` v1

The JSON format FocusDesk imports to turn a plan written in ChatGPT into real
records:

```
Goal → Project → Project Milestone → Task → child Task → …
```

Import it in the app: **Settings → Data → Import Project Plan**. Paste the
JSON (or choose a file), read the preview, press **Import plan**. Nothing is
written before you confirm, and nothing that already exists is ever changed —
a plan only *adds* records.

The importer has two modes (a switch at the top of the dialog):

* **Create New Project** — creates the plan's goal, projects, project
  milestones and tasks (the Phase 4 behavior, documented below).
* **Add to Existing Project** — adds the plan's milestones and tasks to one
  project that already exists (documented in §8).

The importer is application-level. It needs no API key, calls no AI service and
runs no migration: you generate the JSON in ChatGPT yourself and paste it in.

Code: `lib/project-plan.ts` (format, validation, preview) ·
`AppRepository.importProjectPlan` (the write) ·
`components/settings/project-plan-import.tsx` (the UI).
A working example (including three nested child tasks) lives in
`fixtures/focusdesk-project-plan-v1.json`. The original, unchanged 52-task
fixture is retained as `fixtures/focusdesk-project-plan-v1-no-subtasks.json`
for backward-compatibility tests. **The envelope and version stay at v1.**

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
| `subtasks` | task[] | no | Recursive full child tasks; same fields/defaults; root = level 1, maximum 20 levels |

Other non-structural fields are reported and ignored. In particular a plan
cannot set `completedAt`, `actualDuration*`, timer state, `recurrence` or
`archived`. `goalId` is rejected: a task's goal follows its project, never a
separate JSON task reference. Populated `parentTaskId`,
`parent_task_id` and `parentTaskTempId` on tasks are **errors**, not an
alternative way to express a hierarchy: use nested `subtasks`, never an existing
task's id. Omitted/null unknown fields retain the original ignore behavior and
cannot create a parent link. Unknown non-structural fields such as `progress` or `owner` retain the existing
warning-and-ignore behavior; they never become persisted task fields.

### Full child tasks, not checklist items

A subtask accepts the same `title`, `description`, `status`, `priority`,
`scheduledDate`, `dueDate`, `estimatedDuration`, `notes`, `tags` and recursive
`subtasks` as its parent. Optional import-only `id` values are also allowed.
Every child needs its **own non-blank title**. Status defaults to `created` and
priority to `medium` independently; a parent's priority/dates are not copied
onto its children. All ordinary task validation and warnings apply at every
level, including positive integer minutes, real dates, supported enums and
completed-task import timestamps.

Children inherit the **parent's resolved project and milestone**, including
"no project" / "no milestone". An explicit `projectId` or `milestoneId` can
only repeat that association (with the existing redundant-reference warning);
it cannot move a child to another project/milestone or give a standalone child
a project its parent lacks. Omit these references on children in normal plans.

These are full `Task` records in `tasks`, using the existing `parentTaskId` /
`parent_task_id` self-reference. They are **not** the lightweight `Subtask`
checklist records in the separate `subtasks` table from migration 005. Full
child tasks have their own status, schedule and timer, and contribute to task,
project-progress and review counts like any other task. Existing checklist
items and their UI stay unchanged.

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
              "estimatedDuration": 120,
              "subtasks": [
                {
                  "title": "Create the theme workspace",
                  "description": "Separate theme code from plugin code.",
                  "priority": "high",
                  "estimatedDuration": 30,
                  "subtasks": [
                    {
                      "title": "Verify the local build",
                      "description": "Run the existing build command.",
                      "status": "planned",
                      "priority": "high",
                      "scheduledDate": "2026-10-10",
                      "dueDate": "2026-10-10",
                      "estimatedDuration": 10,
                      "notes": "Record any build errors.",
                      "tags": ["toolchain"]
                    }
                  ]
                },
                { "title": "Configure the plugin workspace", "estimatedDuration": 30 }
              ]
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

That plan creates **1 goal, 2 projects, 2 project milestones and 11 total
tasks**: **8 top-level/parent tasks + 3 subtasks**. "Top-level" here means a
task without a parent task, even when it sits under a project/milestone, and
includes unbranched tasks.

```
Goal: Build and grow PatientScure · deadline 2026-12-31
├── PatientScure Website · deadline 2026-12-31
│   ├── Foundation · target 2026-10-15 — 5 tasks
│   │   ├── Set up project structure · due 2026-10-10
│   │   │   ├── Create the theme workspace
│   │   │   │   └── Verify the local build · due 2026-10-10
│   │   │   └── Configure the plugin workspace
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
* Root tasks live inside a milestone, directly inside a project, or in the
  top-level `tasks` array (no project). Each can contain nested `subtasks`;
  descendants inherit its project/milestone rather than being flattened.
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

Limits (`PROJECT_PLAN_LIMITS`): **100 projects**, **500 project milestones**,
**2,000 total full tasks including all descendants**, **20 task levels**
(root task is level 1, at most 19 child edges), and **5 MiB of UTF-8 text** for
pasted/uploaded JSON (including any Markdown wrapper). The task-count ceiling
is unchanged; it now counts every child/grandchild as a real task. Structural
arrays and task depth/count are bounded before recursive validation/rendering;
excessively deep input produces a readable error, not a stack overflow.
The size check runs before parsing text or reading an oversized upload.
Split a bigger plan into independent parent branches; a child cannot reference
a parent from a previous import.

The parsed-object API also refuses cyclic/reused task objects. Nested JSON
cannot encode cycles, and the format accepts no separately represented parent
references. Repositories nevertheless re-check pending parent ids, missing
parents, cycles, depth, fields, duplicate ids and same-project/milestone chains
before any write, so a hand-built resolved import cannot bypass validation.

### 3.6 Duplicates

**Import as new, always.** If a project in the plan has the same name
(case-insensitive) as an existing one, the preview says so and asks you to
confirm — FocusDesk then creates a second project with that name. It never
merges, renames, updates or deletes the existing project, its tasks or its
milestones. The same is true of goals: a plan's goal is always created new, and
is never matched against an existing goal by name. Tasks are always created new
too — a duplicate title never merges into the existing task. (In **Add to
Existing Project** mode, milestones are the one exception to "always new":
an exact normalized-name match is *offered* as "Use existing", and only your
choice reuses it — see §8.)

---

## 4. Temporary ids

An `id` in a plan is **import-only**. It exists so records can refer to each
other (`milestoneId`, `projectId`), and it is thrown away at write time:

* FocusDesk generates the real ids with its own generator (`crypto.randomUUID`),
  exactly as it does for a record created in the UI.
* Every reference is rewritten through the temporary → real map, so `m1`
  becomes the real Project Milestone id and `t7` the real Task id. Nested
  placement creates an internal `parentTaskTempId`; the builder rewrites it
  to the real parent's `Task.parentTaskId`. This internal key is not a JSON
  format field. A child never points at an existing task, even when a supplied
  temporary id happens to equal an existing record's real id.
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
* **Atomic locally; compensated on Supabase.** Local storage stages the
  complete graph (fresh ids, root tasks and descendants) and commits it in
  **one** storage operation. A quota/storage failure rejects the import and
  leaves both persisted and in-memory data unchanged.
  Supabase has no cross-table transaction over PostgREST: it inserts goals →
  projects → project milestones → root tasks → children → grandchildren, in
  batches of at most 200 rows **per hierarchy depth**. Every parent has a
  real, persisted id before the child request. Each attempted batch's fresh
  ids are tracked before sending, including a lost response after a commit.
  Failure triggers id-scoped, user-scoped deletes in reverse batch/depth
  order, touching only this import's records. With successful compensation,
  no descendants or parent records remain. If cleanup itself fails, the
  importer explicitly says records may remain and retains their ancestors
  rather than tearing apart the surviving hierarchy. This is **not** a claim
  of server-side transactional atomicity or of live deployment verification.
* **Additive only.** The format has no update and no delete. Existing goals,
  projects, tasks, project milestones, learnings, priorities, notes and timer
  sessions are untouched.
* **Authenticated, RLS-respecting writes.** Records go through the same
  `DataProvider` → `AppRepository` path as every other change and are written
  as the signed-in user. No service-role key, no SQL from the browser, and a
  `user_id` in the JSON would be an unsupported field — it is never read.
* **Positions from the JSON order.** Milestone 1 → `position` 0, milestone 2 →
  `1`, and so on, per project. The resolved tasks and local stored arrays keep
  JSON preorder and sibling order. Full tasks have **no manual position field**
  (unlike checklist items); Supabase does not promise a persistent custom
  sibling sort. Projects keeps its existing completion sorting among roots/
  siblings while grouping each visible child beneath its parent.
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

// A per-project goal (only the single top-level goal is supported)
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

### Invalid child hierarchies (complete JSON examples)

A missing/blank child title refuses the parent and the entire plan:

```json
{"format":"focusdesk-project-plan","version":1,"tasks":[{"title":"Parent","subtasks":[{"title":"  "}]}]}
```

Invalid values are not silently replaced with defaults (all three below are
errors at `tasks[0].subtasks[0]`):

```json
{"format":"focusdesk-project-plan","version":1,"tasks":[{"title":"Parent","subtasks":[{"title":"Child","dueDate":"2026-02-30","status":"blocked","priority":"critical"}]}]}
```

Duplicate temporary ids include descendants and share the goal/project/
milestone/task namespace:

```json
{"format":"focusdesk-project-plan","version":1,"tasks":[{"id":"t1","title":"Parent","subtasks":[{"id":"t1","title":"Child"}]}]}
```

A child cannot cross project boundaries:

```json
{"format":"focusdesk-project-plan","version":1,"projects":[{"id":"p1","name":"One","tasks":[{"title":"Parent","subtasks":[{"title":"Child","projectId":"p2"}]}]},{"id":"p2","name":"Two"}]}
```

A separately represented parent is not allowed, even if that task exists in
the app:

```json
{"format":"focusdesk-project-plan","version":1,"tasks":[{"title":"Child","parentTaskId":"existing-task-id"}]}
```

Non-array `subtasks`, a conflicting child `milestoneId`, a 21st task level,
and a 2,001st total task are likewise errors. Parents and descendants are
never silently flattened, skipped or partially imported.

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
>   `notes`, `tags` (array of strings), `subtasks` (optional array of tasks
>   with the same fields). Nested children inherit the parent's project and
>   milestone; do not send `parentTaskId` or move children to other projects.
>   Limit nesting to 20 task levels and the whole plan to 2,000 tasks including
>   descendants, 100 projects, 500 milestones and 5 MiB of UTF-8 JSON.
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

## 8. Add to Existing Project

The same `focusdesk-project-plan` JSON can be **added to a project that already
exists** instead of creating a new one. In the importer, switch to **Add to
Existing Project**, choose the target project, and paste the plan. The flow is
the same as everywhere else — parse → validate → preview → confirm → import —
and nothing is written before you confirm.

This mode accepts **exactly one** source project in the plan's `projects`
array. A plan with zero projects or with more than one is refused — that keeps
the mapping from the plan to the target project unambiguous.

### What is never touched

"Add to existing project" means *add*: new milestones and new tasks inside the
selected project. It never:

* creates, updates, renames or deletes the target project — its `name`,
  `description`, `deadline`, `status`, `goal` relationship and timestamps stay
  exactly as they are;
* creates or modifies the project's goal — if the plan contains a `goal`, it is
  shown as *source plan* metadata only: *"Existing project goal will be
  preserved. Imported plan goal will not be created or applied."* (A target
  project without a goal simply stays without one — attaching one would mean
  modifying the project, which this mode never does.);
* updates, renames or deletes an existing project milestone;
* updates, merges or deletes an existing task — every imported task is new,
  even when an existing task has exactly the same title;
* creates another project or another goal.

### Milestone matching

Every imported milestone is compared against the milestones that already
belong to the target project. Matching is a conservative, deterministic
**normalized exact-name** rule: trim whitespace, collapse runs of whitespace
to one space, lowercase. `"SEO"`, `" seo "` and `"Seo"` match; `"SEO"` and
`"SEO Optimization"` never do. There is no fuzzy, semantic or AI matching.

For each imported milestone the preview shows its mapping and lets you choose:

* **Use existing** — the milestone's normalized name matches an existing
  milestone of the target project. That milestone is **reused, not modified**:
  the imported `description`, `targetDate` and order are discarded, and only
  its id becomes the parent of the newly imported tasks. When several existing
  milestones share the normalized name, all of them are offered and you pick
  one (the lowest position is recommended).
* **Create new** — always available, even for an exact name match, when you
  intentionally want a second milestone with the same name.

Example — target project has `Foundation` (0), `Backend` (1), `SEO` (2); the
plan imports `Foundation`, `Backend`, `SEO`, `Launch`, `Analytics`:

```
✓ Foundation  → Use existing milestone (stays at position 0)
✓ Backend     → Use existing milestone (stays at position 1)
✓ SEO         → Use existing milestone (stays at position 2)
+ Launch      → Create new milestone (position 3)
+ Analytics   → Create new milestone (position 4)
```

New milestones are appended **after** the project's existing milestones, in
the imported order (`max(position) + 1`, then +2, …) — existing milestones are
never renumbered, the same rule the app uses when you add a milestone by hand.

If two imported milestones both map to the same existing milestone, the preview
warns you — their tasks would share it — and you can switch either one to
"Create new".

### Task behavior

* Tasks nested under an imported milestone become new tasks with
  `projectId` = the target project and `projectMilestoneId` = the mapped
  milestone (the existing milestone's id, or the new milestone's id). A task can
  never carry a milestone of another project — the same invariant the database
  enforces (`tasks_project_milestone_same_project_fkey`).
* Tasks in the plan's project `tasks` array become new **project-level tasks**:
  `projectId` = the target project, no milestone.
* Tasks in the plan's top-level `tasks` array do **not** become unassigned
  tasks here — they become project-level tasks of the target project
  (`projectId` = target, no milestone). The preview labels them
  *"root task → project-level task"*. (In Create New Project mode they stay
  project-less.)
* Every nested child is also a **new full task**. Its `parentTaskId` points
  to its newly imported parent, and its project/milestone resolve through the
  same target/milestone mapping. A reused milestone is not a reused parent
  task. Even the plan's standalone root branches, including every descendant,
  become tasks of the selected target project.
* Every task is created new. Duplicate titles are never deduplicated: an
  imported "Configure WordPress API" next to an existing "Configure WordPress
  API" produces a second, new task. The preview says so explicitly.

The preview separates **top-level tasks**, **subtasks** (all descendants),
and **total tasks**. Milestone/project-level/standalone-source section counts
include descendants and partition that total; do not add the subtask count to
those section totals again. Both modes use the same task tree, descriptions,
priorities and dates. For more than 300 preview rows, **Show all** reveals every
remaining branch before confirmation rather than permanently hiding it.
Deep trees scroll within the preview on narrow screens; each label retains a
readable text width rather than shrinking to zero beneath the indentation.

### Safety guarantees

* **Validated as a whole first.** The same validation as Create New Project
  runs, plus the exactly-one-project rule, plus the target project must exist
  (and, on Supabase, belong to the signed-in user — the repository re-checks
  before writing). Any failure means zero writes.
* **Same rollback behavior as Create New Project (§5).** Local storage
  commits the entire hierarchy once or leaves it unchanged. Supabase inserts
  new milestones, then tasks by depth, and compensates attempted new ids
  children-first on failure. A failed cleanup is explicitly reported, not
  presented as a successful/atomic import. Reused milestones, the target
  project and its goal are never included in rollback deletes.
* **Additive only.** No update and no delete is ever issued for existing
  records — the preview's "Existing data" box lists what will remain unchanged.
* **Authenticated, RLS-respecting writes** through
  `useData().actions.importProjectPlanIntoExistingProject` →
  `AppRepository.importProjectPlanIntoExistingProject`, as the signed-in user.

---

## 9. Versioning

`version: 1` is the only version this build understands. A plan with any other
version is refused with a message saying so, rather than being guessed at. When
a version 2 exists it will be a new document
(`docs/focusdesk-project-plan-v2.md`) and version 1 plans will keep importing.

Not in version 1, deliberately: CSV, recurring imports, updates to existing
records, goal matching by name, and any AI/API integration. Optional recursive
`subtasks` are a backward-compatible v1 extension: omitting them preserves the
original import behavior.

---

## 10. Database review, hierarchy lifecycle and deployment checks

**No new migration is required by this enhancement.** The base
`supabase/schema.sql` already defines
`tasks.parent_task_id text REFERENCES tasks(id) ON DELETE SET NULL`. `Task`/`TaskInput`, both repository task writes
and Supabase's camelCase/snake_case read mapper already carry this field.
The importer reuses it; migration 005's lightweight checklist table is not
used for imported child tasks. Milestone plans retain the existing migration
008 capability gate. A nested milestone-free plan works without 008.

Projects now groups visible full child tasks under their parents at all
supported import levels. Deep branches cap their indentation on narrow screens
and show explicit task-level markers; no menu clipping or extra persistence is
introduced. Task rows also show **Subtask of: [parent title]**, including on
flat/filter-based task views. Missing/filtered parents do not hide their
children. The hierarchy renderer bounds traversal of corrupt legacy cycles
without changing those stored records.

Full children retain the normal Task controls: edits, scheduling, completion,
reopening, timers, history and bulk selection remain independent. Completing
a parent does not complete children. Deleting a parent **keeps** full children
and clears their direct parent link (the existing `SET NULL` behavior), while
grandchildren keep their link to a surviving child. The local single-delete
path and DataProvider's in-memory snapshot now match this FK behavior. Existing
checklist items and timer sessions still follow their existing delete cascades.
Authenticated UI project/parent edits are checked so they cannot introduce
cross-project or cyclic parent chains; this does not invent a database-level
same-project parent constraint or change milestone editing semantics.

### Manual deployment verification (read-only)

No production database was accessed or changed during this implementation.
The Supabase write/read path is tested using the real SDK with an in-memory
PostgREST boundary. The source SQL/FKs and authenticated RLS behavior are also
tested in local PostgreSQL (PGlite). **This does not verify a live Supabase
schema/policy deployment.** The repository does not include the historical
ownership/bootstrap migration for the original tables; the SQL test explicitly
uses its documented ownership/RLS stand-in, not a claim that it exists live.

Before a deployment smoke test, the database owner can inspect the following
in their SQL administration tool — never SQL or privileged keys in the browser:

```sql
-- Existing columns and types (parent_task_id must be text, nullable).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'tasks'
  and column_name in ('parent_task_id', 'user_id', 'project_id', 'project_milestone_id');

-- Confirm parent_task_id → tasks(id) ON DELETE SET NULL, plus milestone FKs.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.tasks'::regclass and contype = 'f';

-- Confirm ownership policies for the authenticated application user.
select relrowsecurity from pg_class where oid = 'public.tasks'::regclass;
select policyname, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'tasks';

-- Read-only integrity checks; both should return zero rows for a valid tree.
select t.id, t.parent_task_id
from public.tasks t left join public.tasks p on p.id = t.parent_task_id
where t.parent_task_id is not null and p.id is null;

select t.id, p.id as parent_id
from public.tasks t join public.tasks p on p.id = t.parent_task_id
where t.project_id is distinct from p.project_id
   or t.user_id is distinct from p.user_id;
```

If the parent column is missing, a nested import is **refused before any
write**, with a message naming the missing capability. Stop and resolve the
deployment mismatch with the database owner: re-running `CREATE TABLE IF NOT
EXISTS` from the base schema does **not** retrofit a missing column or FK on an
existing table. No unverified migration is supplied or automatically applied.
If milestones are needed and 008 is absent, follow that migration's existing
preconditions/rollout instructions, then reload the app. Do not change existing
production rows as part of testing this feature.

For manual acceptance, use a disposable local/test account: preview/import the
nested fixture in Create New Project mode, reload and inspect the task tree;
then add it to a test project with a matching milestone, choose reuse/create-new
as appropriate, reload and inspect the children and unchanged existing records.
If compensation reports incomplete cleanup, reload and investigate the
**import-created** records/cause before retrying; never clear a table or touch
unrelated records to recover an import.

---

## 11. Implementation record — 2026-10-10

Implemented on `arena/46f96212-focusdesk`. This entry extends the existing
feature document rather than creating a separate tracking system. No commit,
push, production mutation, runtime dependency or lockfile change was needed.

### Decisions and changed files

| Files | Purpose / decision |
|---|---|
| `lib/project-plan.ts` | Optional recursive v1 `subtasks`; inherited associations; internal pending-parent IDs; bounded iterative preflight; task-field/chain revalidation at repository boundaries; fresh parent-ID mapping; both preview trees and descendant-aware counts. |
| `lib/types.ts` | Clarifies the existing full Task parent relationship; no new domain/database task fields. |
| `lib/task-hierarchy.ts` | Pure hierarchy rows with safe handling of filtered/legacy parents; UI action integrity guard only on actual relationship changes (ordinary legacy edits are preserved). |
| `lib/store/repository.ts` | Documents descendant-aware import/compensation contracts. |
| `lib/store/local-repository.ts` | Stage/commit the entire hierarchy once; storage failures leave memory and disk unchanged; single deletion matches the existing parent FK. |
| `lib/store/supabase-repository.ts` | Probe existing parent-column capability before writes; insert tasks by depth in 200-row batches; track attempted fresh IDs (including lost responses); compensate descendants first; preserve ancestors/report incomplete cleanup. |
| `components/data/data-provider.tsx` | Existing import actions already merge full Task results; align deletion state with FK semantics and guard project/parent edits. |
| `components/settings/project-plan-import.tsx` | Shared recursive preview in both modes, task descriptions/metadata, top-level/subtask/total counts, accessible Show all and bounded horizontal scrolling for large/deep trees, oversized-upload rejection; preserves mapping, confirmation and cancel flows. |
| `components/tasks/task-list.tsx`, `components/tasks/task-row.tsx` | Optional hierarchy view using existing row controls; visible parent context; phone-friendly deep-level markers. |
| `components/projects/projects-screen.tsx`, `components/projects/project-milestones.tsx` | Opt Projects and its milestone sections into hierarchy rendering; preserve ordinary task/milestone controls and completion sorting. |
| `fixtures/focusdesk-project-plan-v1.json` | Existing example plus two child tasks and a grandchild (55 full tasks). |
| `fixtures/focusdesk-project-plan-v1-no-subtasks.json` | Original fixture, byte-identical to the starting commit (52 tasks), retained for regression tests. |
| `scripts/verify-project-plan-subtasks.tsx` | New pure/local/Supabase SDK/jsdom hierarchy tests, both modes, rollback, fields, limits, lifecycle, preview and actual Projects rendering. |
| `scripts/verify-project-plan-import.tsx`, `scripts/verify-project-plan-add-to-existing.tsx` | Keep legacy-mode coverage; account for descendant counts and attempted-ID compensation. |
| `scripts/verify-project-milestones-sql.ts` | Extend the established PGlite schema test with real task-parent FK, fields, both builders, reused-milestone, ownership/RLS and deletion checks; no live SQL. |
| `README.md`, `docs/focusdesk-project-plan-v1.md` | Feature overview, complete valid/invalid examples, limits, persistence/lifecycle, migration status, verification and manual acceptance notes. |

### Verification

Use the established headless-script tooling (development-only, not app runtime):

```bash
npm ci
npm install --no-save --package-lock=false jsdom tsx @electric-sql/pglite
npx tsx scripts/verify-project-plan-import.tsx
npx tsx scripts/verify-project-plan-add-to-existing.tsx
npx tsx scripts/verify-project-plan-subtasks.tsx
npx tsx scripts/verify-project-milestones-sql.ts
npx tsx scripts/verify-learnings-project-milestones.tsx
npx tsx scripts/verify-bulk-delete.tsx
npx tsx scripts/verify-project-task-order.ts
npx tsx scripts/verify-phase7-completion-date.tsx
npx tsx scripts/verify-workflow.tsx
npx tsx scripts/verify-timer-navigation.tsx
npx tsx scripts/verify-timer-concurrency.tsx
npx tsx scripts/verify-multi-tab.tsx
npx tsc --noEmit
npm run lint
npm run build
npx tsx scripts/verify-mobile-layout.tsx
```

Results: the original Create New Project suite (242 checks), Add to Existing
Project suite (167 checks), new native-subtask suite (**34 cases**), SQL suite
(78 checks), Learnings/Project Milestones suite (123 checks), bulk-delete suite
(143 checks), task ordering (12 checks), completion-date, workflow, timer
navigation, concurrent timers and multi-tab suites all passed. A separate
`verify-learnings-backup.ts` round trip also passed on a **synthetic** 56-learning
legacy export with a computed ID fingerprint; no real user's backup was used.

The backup script needs a file argument: an initial invocation without one
returned its usage/exit 2, then it was rerun correctly on the synthetic export.
The new SQL negative tests initially exposed a test-harness transaction-abort
issue; savepoint recovery fixed the harness and the full SQL suite passed.
The final ordering rerun also initially used a nonexistent shortened filename;
the discovered `verify-project-task-order.ts` entrypoint passed all 12 checks.
None is an unresolved application regression. Final `npx tsc --noEmit`,
`npm run lint`, `npm run build` and the compiled-CSS headless mobile-layout
audit (74 checks) passed. The layout audit uses jsdom/intrinsic-size estimates;
it is not a claim of pixel-accurate browser or live Supabase verification.
A production preview was started on `0.0.0.0:3000` in local-storage mode;
`/settings` and `/projects` returned HTTP 200. No Supabase configuration or live
database was used for that smoke check.

**Remaining/manual work:** no known incomplete code feature. No new migration
was added/applied. Live Supabase schema/policies and a disposable-account
browser smoke test remain deployment checks (§10); do not interpret SDK mocks
or local PostgreSQL as proof of production persistence. True cross-table
server-side transactional atomicity remains the existing PostgREST limitation,
not a new promise of this v1 extension.
