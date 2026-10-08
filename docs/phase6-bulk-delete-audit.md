# PHASE 6 AUDIT — FocusDesk Bulk Select & Safe Bulk Delete

**Status: DESIGN ONLY — no implementation. Awaiting explicit approval.**
**Base:** `main` @ `f84df1e` (Phase 5 merged, PR #35). Working branch: `arena/49ea4013-focusdesk`.
**Audited:** HEAD `f84df1e4f0165f7b80b9d18f91ca118c466507f7`.

---

## 1. Current single-record delete architecture (UI → DataProvider → Repository)

```
TaskRow menu / ConfirmDialog ──▶ actions.deleteTask(id)
ProjectsScreen menu ───────────▶ actions.deleteProject(id)
ProjectMilestoneSections ─────▶ actions.deleteProjectMilestone(id)
GoalsScreen menu ──────────────▶ actions.deleteGoal(id)
                                     │
                                     ▼
                          repo().<collection>.delete(id)
                          (LocalRepository | SupabaseRepository)
```

Exact provider behavior today (`components/data/data-provider.tsx`):

- **`deleteTask(id)`** (line ~1037): deletes every child **subtask** row, drops the task's in-memory
  open-timer bookmark (`openSessionRef`), deletes every **timer session** row of the task, then
  `repo().tasks.delete(id)`, then prunes the snapshot. **No settle/stop of a running timer and no
  descendant checks** — the run is simply discarded (its already-recorded session rows are deleted with it).
- **`deleteProject(id)`** (~1499): computes the project's milestone ids from the snapshot, awaits
  `settleTaskWrites(...)` for tasks bound to those milestones, then deletes each milestone
  (`repo().projectMilestones.delete(mid)` — which itself clears the link on tasks), then
  `repo().projects.delete(id)`. On failure: toast + `refreshProjectMilestones()`, nothing else changes.
  On success: snapshot removes the project + milestones and clears `projectId` / `projectMilestoneId`
  on its tasks **in memory** (see §23.5 for the storage asymmetry). **Tasks are never deleted. Goal untouched.**
- **`deleteProjectMilestone(id)`** (~1644): settles task writes for its tasks, `repo().projectMilestones.delete(id)`,
  snapshot clears the link. **Tasks stay in the project without a milestone.**
- **`deleteGoal(id)`** (~1538): `repo().goals.delete(id)`; snapshot detaches projects and tasks.
  **Projects/tasks are kept, only the link goes.**

Confirmation UI today: `ConfirmDialog` (`components/ui/confirm.tsx`) with `danger` + `confirmLabel`.
Task deletion confirm is gated by `settings.general.confirmTaskDeletion` (default true); project,
milestone and goal deletes always confirm and their copy already states the cascade explicitly
(e.g. project: *"…and its milestones will be removed. Its tasks are kept — they simply lose the project link."*).

## 2. Exact repository delete methods

`lib/store/repository.ts`:
- `EntityRepository<T, C>` = `list / create / update / delete(id)`. **No bulk method exists on the public contract.**
- `ProjectMilestoneRepository` adds `listForProject`, `reorder`, and — documented verbatim — the referential
  contract: *"deleting a milestone clears `projectMilestoneId` on the tasks that used it (tasks are never
  deleted), and a milestone can never move to another project."*

`lib/store/local-repository.ts`:
- `Collection.delete(id)` (line 156): operates on `current()` (fresh multi-tab sync), filters out the row,
  one whole-database `write()` per call.
- `LocalProjectMilestones.delete(id)` (line 225): **one write** that both clears `projectMilestoneId` on all
  referencing tasks and removes the milestone.
- `write()` swallows quota errors (in-memory continues) — the only local failure mode, unchanged since Phase 1.

`lib/store/supabase-repository.ts`:
- `RestCollection.delete(id)` (line 457) → `SupabaseHttpClient.delete(table, id)` =
  `.delete().eq('user_id', uid).eq('id', id)` — always user-scoped, idempotent (0 matching rows → success).
- **`SupabaseHttpClient.deleteMany(table, ids)` already exists** (line 546):
  `.delete().eq('user_id', uid).in('id', ids)`, no-op on empty list. Private today; it is the compensating
  delete used by both project-plan imports. This is exactly the safe bulk primitive Phase 6 needs.
- `patchWhere(table, filters, body)` (line 492): user-scoped bulk **UPDATE**, eq-filters only.
  `SupabaseProjectMilestones.delete(id)` (line 630) = `patchWhere('tasks', {project_milestone_id: id},
  {project_milestone_id: null})` then delete the row — explicit detach-before-delete so both backends behave
  identically (comment says so).
- `supportsProjectMilestones()` gates every `project_milestones` / `tasks.project_milestone_id` touch
  (migration 008 may be unapplied; writes then leave the column out and milestone UI stays hidden).
- Batching precedent: `PLAN_INSERT_BATCH = 200` rows per request.

## 3. Database foreign keys / cascade behavior (audited, not assumed)

From `supabase/schema.sql` + `migrations/004–008`:

| Relationship | Constraint | Delete effect |
|---|---|---|
| `tasks.project_id → projects(id)` | ON DELETE **SET NULL** | task survives, link cleared |
| `tasks.goal_id → goals(id)` | ON DELETE **SET NULL** | task survives, link cleared |
| `tasks.parent_task_id → tasks(id)` | ON DELETE **SET NULL** | broken-down children survive as top-level tasks |
| `projects.goal_id → goals(id)` | ON DELETE **SET NULL** | project survives, link cleared |
| `subtasks.parent_task_id → tasks(id)` (005) | ON DELETE **CASCADE** | subtasks die with the task |
| `timer_sessions.task_id → tasks(id)` (006) | ON DELETE **CASCADE** | focus runs die with the task |
| `project_milestones (project_id,user_id) → projects (id,user_id)` (008) | ON DELETE **CASCADE** | **project delete deletes its milestones** |
| `tasks (project_milestone_id, project_id) → project_milestones (id, project_id)` (008) | ON DELETE SET NULL of `project_milestone_id` | milestone delete keeps tasks |
| `tasks.project_milestone_id → project_milestones(id)` (008, single-col) | ON DELETE SET NULL | guarantees the link can never dangle, even mid-project-cascade |
| `task_history.task_id` | **no FK at all** | history rows outlive deleted tasks (current single-delete behavior) |
| `monthly_priorities.goal_id / project_id` | ON DELETE SET NULL | detach |

Every table has RLS enabled with 4 own-row policies (`auth.uid() = user_id`); the repositories additionally
filter `user_id` on **every** read/update/delete and stamp `user_id` on every insert.
Migration 008's header states it is **prepared but possibly not applied to production**; the app probes
(`supportsProjectMilestones()`) and hides the feature otherwise. Phase 6 must not apply or change migrations.

**Critical conclusion:** the deliberate, documented, twice-verified (fake PostgREST + real PGlite in
`scripts/verify-project-milestones-sql.ts`) semantics are **DETACH, not destroy**, for
Goal→projects/tasks, Project→tasks, and Milestone→tasks. Only `task → subtasks/timer_sessions` and
`project → project_milestones` truly cascade — by design, not accidentally.

## 4. Current project → milestone → task relationships

`Project.projectId` keying: milestones carry `projectId`, ordered by `position`; tasks carry `projectId`
and optional `projectMilestonesId` that **must belong to the task's own project** (enforced in
`lib/project-milestones.ts` → `resolveTaskMilestone`, in `LocalRepository.checkTaskMilestone`, and by the
008 composite FKs). Milestones exist only inside a project — no independent lifetime. Milestone bulk
deletion therefore only needs the detach rule; project bulk deletion additionally needs "its milestones die".

## 5. Current goal → project relationship

`Project.goalId` optional, `Task.goalId` optional. Delete = detach on both backends (§3). **No architecture
in FocusDesk ever deletes a project because its goal was deleted** — Goal is a label with a link, nothing owns
it. Bulk goal deletion can therefore never orphan projects: an orphan project is only a project with a dangling
`goalId`, and the UI already treats unresolved links as "no goal" everywhere (verified: screens resolve via
`find(...)`, `TaskList`/cards render blank when unresolved; `project-plan` importer is link-tolerant too).

## 6. Timer ↔ task relationship (audited as required)

- Timer truth lives on the **task** (`status='in_progress'`, `startedAt`, `pausedAt`, `actualDurationSeconds`)
  — `lib/timer.ts`, pure. No independent "active session" store.
- `timer_sessions` rows = recording of runs for day attribution; one row per continuous run; a row is
  **never left open**: the "ended_at = last durable checkpoint" model + load-time recovery
  (`interruptedTimerPatch`) + the `pace.tabs.v1` presence registry (`otherTabAlive`, 10s TTL).
- DataProvider keeps a per-task in-memory bookmark `openSessionRef`, checkpoint writes every 10 s
  (`taskWriteQueueRef` per-task serialization; `settleTaskWrites(tasks)` = "await that task's queued writes").
- **`deleteTask` today deletes a task with a running timer without pausing it**: removes the bookmark,
  deletes the task's session rows, deletes the task. In-flight queued checkpoint writes land on a missing row
  and fail harmlessly (local `Collection.update` throws `Record not found`; `RestCollection.update` re-reads and
  throws the same; both are swallowed by the checkpoint error handler). On Supabase the 006 FK cascade
  additionally removes sessions. **No orphaned TimerSession row is possible today** — that invariant already holds and Phase 6 must keep it.
- Consequence for Phase 6: bulk task deletion should replicate the single-delete behavior
  (**discard the run**, drop the bookmark, delete session rows with the task). "Prevent deleting actively
  timed tasks" would *diverge* from the existing single-delete UX for no data-integrity gain; §15 recommends the settle-then-delete approach.

## 7. Multi-tab write/merge behavior (what bulk delete must respect)

- LocalRepository is whole-database JSON under `pace.db.v1`. `current()` re-reads whenever the stored raw
  string differs from `lastRaw`; **every mutation (including delete) is applied to the freshly synced state**,
  so a delete removes exactly the named ids from the newest database and rewrites the rest untouched —
  **a delete can never resurrect or erase another tab's work**. This is exactly what makes per-id delete safe today,
  and the same property holds for a `deleteMany` that filters a set of ids inside one sync-modify-write.
- Resurrection channels checked:
  1. *Stale-tab checkpoint/updates to deleted tasks* → repository throws/ignores; no re-insert (`Collection.update`
     refuses missing ids; `RestCollection.update` GETs first). No path exists that re-creates task rows from memory
     (no `create` on state loss) — verified in `scripts/verify-multi-tab.tsx`'s model.
  2. *The only whole-state write* is `importData`/`restoreBackup` — an explicit user action, already documented as
     replacing everything; not part of this feature.
  3. *Supabase* has no in-memory cache at all (each mutation is one scoped request), so nothing to stale-merge.
- Supabase cross-tab: another tab may have deleted one of the ids meanwhile → the `IN` delete matches fewer rows
  and silently succeeds (PostgREST) — already the semantics of today's single delete; harmless.
- **One real gap to report:** on Supabase, a tab whose local snapshot still lists a running (now deleted in tab B)
  task keeps ticking its timer UI until reload; its checkpoints fail silently, and a later `tasks.update` for that
  row throws `Record not found` (never recreating it). This is pre-existing single-delete behavior; Phase 6 inherits,
  documents, and does not worsen it (no BroadcastChannel sync exists anywhere in the app).

## 8. Current Tasks UI filtering / search / pagination

`components/tasks/tasks-screen.tsx` — all client-side over the full snapshot, **no pagination**:
- Status tabs: all / today / upcoming / unscheduled / someday / completed / cancelled (archived tasks always hidden;
  today's daily-priority timer task is hidden here — it is surfaced on Today and excluded so a bulk "select all visible"
  can never delete the priority timer's backing task by accident).
- Free-text search (title, notes, tags), project filter, goal filter (tasks directly on goal **or** in one of its projects), sort (8 orders).
- Renders `filtered` split into `active` + `completed` groups; footer already shows "N tasks in view".

**Design consequence:** "visible" == `filtered.length`; "select all" must mean *"Select all 12 in view"*, never the
whole table. There is no "matching beyond what is shown" case because there is no pagination. Selection is keyed by
id and persists across filter changes; the select-all control always refers to the current filtered set only.

## 9. Existing selection patterns

**None.** `TaskCheckbox` (task-row) is the round complete/reopen toggle — *not* selection, and it must stay as-is.
`components/ui/form.tsx` exports a square accessible `Checkbox` (button `role=checkbox` + `aria-checked`) used by
well-being/today screens — the visual/behavioral precedent to reuse. No list/table component has selection, no
selection context exists in DataProvider, no bulk UI anywhere. No new dependency is needed or wanted.

## 10. Proposed bulk-selection architecture

**Local component state per screen** (recommended by the brief; there is no cross-screen selection need):

```ts
// components/ui/bulk-select.tsx (new, shared)
useBulkSelection() → {
  selected: Set<string>, has(id), toggle(id), selectAll(ids), unselectAll(ids),
  clear(), count, isSelectedAll(ids): boolean, isPartial(ids): boolean,
}
```
- `<BulkActionBar>` — presentational strip (card-styled like existing surfaces, follows current design language):
  `"{n} selected" · [Delete selected] [Clear selection] [Done]`, `aria-live="polite"` for the count,
  the delete button labelled e.g. `Delete 8 tasks` (accessible destructive name).
- A "Select" toggle button in each screen's header switches a per-screen `selectionMode` (renders leading
  square checkboxes on rows/cards; all existing row interactions untouched in either mode — no overlap with
  the round complete button, timer buttons, menus, milestone "Move up/down" or drag behavior; there is no
  drag-and-drop today).
- `Esc` exits selection mode (documented in the row-aria pass); selection `Set<string>` of ids only — ids are
  stable (uuid), duplicate titles irrelevant (tests cover).
- On successful deletion: `clear()`. On failure: selection preserved, error shown (the action surfaces its error;
  the screen keeps rows selected).

## 11–14. Proposed deletion semantics (all follow the audited existing contract)

### 11 Tasks (`deleteTasks(ids)` / `actions.deleteTasks`)
Delete exactly the selected task rows and, with them, **their subtasks and their timer-session rows** — the same
net effect as today's `deleteTask`, batched:
- LocalRepository `deleteTasks`: one sync + **one write**: remove tasks ∈ ids, remove subtasks with
  `parentTaskId ∈ ids`, remove timer sessions with `taskId ∈ ids`, (and clear `parentTaskId` of surviving tasks
  pointing into the deleted set, mirroring the SET NULL FK Supabase applies — a strict consistency improvement,
  §23.5).
- Supabase: one `DELETE FROM tasks WHERE user_id = uid AND id IN (chunk)`; subtasks/timer_sessions removed by
  the existing FK cascades (005/006), `parent_task_id` set null by FK — same guarantee the single delete already
  relies on ("Supabase cascades too" comment in `deleteTask`). No new HTTP surface.
- Parent tasks of *unselected* children: children survive as plain tasks (matches FK + current single behavior).
- **Never** touches their project, milestone, goal rows.

### 12 Project Milestones (`deleteProjectMilestones(ids)`)
**Existing established behavior — keep tasks, clear their links** (repository contract, both backends, both FKs,
and the current confirm copy all say this). The brief's two preferred options (block, or cascade-delete tasks)
would *contradict the documented contract* and diverge bulk from single-record deletes, so the audit recommends
**not** inventing new semantics:
- Local: one write — clear `projectMilestoneId` on all referencing tasks + remove milestone rows (same code path
  shape as today's single delete).
- Supabase: one `UPDATE tasks SET project_milestone_id = null WHERE user_id = uid AND project_milestone_id IN (chunk)`
  (new `patchWhereIn` helper, §16) + one `DELETE FROM project_milestones WHERE user_id = uid AND id IN (chunk)`.
  Order = detach first, then delete (mirrors single delete exactly). 008-FK SET NULL is a safety net, never relied upon.
- Confirmation copy (count-aware): *"Delete 3 milestones? These milestones contain 27 tasks. The tasks are kept —
  they stay in their projects without a milestone."*
- If the user instead wants true cascade ("milestone + its tasks"), that is a **semantic change for single deletes
  too** — flagged in §23.1 for approval, out of the recommended scope.

### 13 Projects (`deleteProjects(ids)`)
Same rule as §12, one level up — mirror today's `deleteProject`, batched:
- Selected projects' milestone ids are computed in the provider from the snapshot; those milestones are deleted
  (which detaches their tasks' milestone links); then the project rows are deleted. Tasks of the project keep
  existing but lose the project link (Supabase FK SET NULL; local aggregate also nulls `projectId` in the same write).
- **Goal never deleted, never even detached** (goal may have other projects — untouched rows).
- Supabase request sequence (per batch, all user-scoped): if milestones enabled — `UPDATE tasks detach` + `DELETE
  project_milestones` + `DELETE projects`; if 008 not applied — just `DELETE projects` (tasks lose the link via the
  base FK; no milestones exist to clean). Order = children detach → children delete → parent delete;
  each request is individually atomic; a failure mid-sequence leaves a consistent superset (see §18).
- Confirmation lists the exact cascade: *"Delete 2 projects? This will permanently delete 2 projects and 7 project
  milestones. 143 tasks are kept — they simply lose the project link. Goals are unchanged."* (Counts of 0 render
  "has no milestones and no tasks" phrasing.)

### 14 Goals (`deleteGoals(ids)`)
Existing semantics = **detach projects/tasks** (Option C from the brief; already the implemented and documented
behavior on both backends — FK `SET NULL`, DataProvider snapshot detach, confirm copy). No orphan projects are
possible (dangling `goalId` is a resolved-to-nothing optional link; UI shows it as "No goal"). No descendant
deletion ever happens. Therefore **bulk goal delete is included in Phase 6 and is the simplest case**:
- Local: one write — remove goal rows + clear `goalId` on tasks and projects.
- Supabase: one `DELETE FROM goals WHERE user_id = uid AND id IN (chunk)` (+ FK SET NULL in the DB).
- Confirmation: *"Delete 2 goals? Their 5 projects and 87 tasks are kept — they simply lose the goal link."*
  The descendant counts stay in the dialog so the effect is understood, but **no cascade deletion happens**.

## 15 Timer safety strategy

`actions.deleteTasks(ids)` (bulk path only):
1. `await settleTaskWrites(selected tasks)` — drain queued checkpoint writes first (same safeguard
   `deleteProject`/`deleteProjectMilestone` already use; today's single `deleteTask` lacks it, which is a
   tolerated latent race — closing it in the bulk path is cheap and safe).
2. Drop `openSessionRef` bookmarks for every selected task (so the state-driven close effect can never try to
   write a "final" session row for a deleted task, and no timer write can target a deleted row afterwards).
3. Repository bulk delete (sessions removed per §11 — local explicitly, Supabase by FK).
4. Snapshot prune + selection clear (in the UI).

Running timers on selected tasks are thus **ended by deletion itself** (time recorded so far goes with the task —
identical to single `deleteTask`). The confirmation dialog adds a line when relevant:
*"1 of these tasks has a running timer — deleting it stops that timer and discards its focus record."*
No new blocking rules, no divergence from single-delete semantics. Daily-priority backing tasks
(`daily-priority-timer:*`) are not selectable from the Tasks screen (already filtered out of the view).

## 16 Supabase bulk-delete strategy

- Reuse `deleteMany(table, ids)` = `DELETE … WHERE user_id = eq(uid) AND id IN (…)`. Add sibling
  `patchWhereIn(table, column, values, body)` for the detach updates (same shape as `patchWhere` but `.in()`).
- **Chunk ids at 200 per request** (new `PLAN_DELETE_BATCH = 200` mirroring `PLAN_INSERT_BATCH`; keeps
  PostgREST URLs well inside limits; a 90-task delete is exactly **one** DELETE).
- Every request is user-scoped; an empty id list short-circuits (no request) — never an unscoped delete.
- No RPC/transaction (none exists; creating one is a schema change → out of Phase 6). The per-request
  DELETE-with-IN is itself atomic in PostgreSQL; cross-request sequences use the safe order + honest error
  reporting below. **We do not claim transactionality.**
- Failure of any request throws `Error('Supabase delete from <table> failed: …')` (existing client style),
  the provider catch toasts, selection preserved, affected lists re-read where cheap (`tasks.list()` etc.) so
  the UI ends up truthful.

## 17 Local-storage strategy

- One `deleteMany(ids)` per collection is implemented on the generic `Collection` (single sync + single write,
  `Set`-based filter — one pass, not 90).
- The **aggregate** operations (`LocalRepository.deleteTasks/deleteProjects/deleteProjectMilestones/deleteGoals`)
  mutate the freshly synced `AppData` in memory and `write()` **exactly once** — the whole bulk operation is one
  atomic store write (matching the `importProjectPlan` precedent, which the repository docs already describe as
  "Local storage does it in one write").
- `pace.backup.v1` is not touched by deletes (it only changes on explicit `backupNow`) — restore remains
  replace-all semantics, by design.

## 18 Partial-failure strategy

| | LocalRepository | SupabaseRepository |
|---|---|---|
| Bulk of one table | single write → atomic | single `DELETE … IN (≤200)` per chunk → atomic per request |
| Multi-step (milestone+project, task+sessions) | still one write (aggregate) → atomic | multiple sequential requests → **not** atomic |
| On failure mid-sequence | cannot fail before `setItem` (serialize is pure; quota failure keeps memory, matches current behavior) | earlier chunks already deleted; provider toasts, preserves selection, re-reads lists; retry completes (deletes are idempotent; re-running a partial cascade never damages the remaining set) |
| Ordering | n/a | children-detach → children-delete → parent-delete, so any intermediate state is "too much remains", never "orphaned/broken": no reference is cleared unless it is about to be, and no parent is deleted before its dependants are cleaned |

Honest messaging: a failure toast says *"some records were deleted — reload and retry"* rather than claiming all-or-nothing.
The verification script asserts this state explicitly (inject failure after first chunk on the fake PostgREST).

## 19 UI files expected to change (exact)

1. `components/tasks/tasks-screen.tsx` — select-mode toggle in header, Select-all-in-view row, `<BulkActionBar>`,
   confirmation modal wiring, selection state.
2. `components/tasks/task-row.tsx` — optional `selection` prop → leading square Checkbox only when provided
   (complete-toggle, timer buttons, menu, subtasks, expansion all unchanged; zero impact where TaskRow is used
   without selection: monthly-review, projects/goal `TaskList`).
3. `components/projects/projects-screen.tsx` — selection mode for **projects**, header-level "Select"; bulk
   confirmation; passes `selection` props into `ProjectMilestoneSections` for **milestone** selection (checkbox per
   milestone header + per-project "select all" in the expanded section) — milestones have no other page, this is
   where they "naturally belong".
4. `components/projects/project-milestones.tsx` — optional selection props on the milestone section header.
5. `components/goals/goals-screen.tsx` — selection mode for goals + bulk confirm.
6. **new** `components/ui/bulk-select.tsx` — `useBulkSelection`, `BulkActionBar`, `BulkConfirmDialog`
   (extends existing `Modal`+`Button`+`ConfirmDialog` patterns; the richer bullet-list body is why a thin new
   dialog component is used instead of overloading `ConfirmDialog`'s single-string message).
7. `README.md` — one "Bulk select & delete" doc block + the new verify command (repo convention documents each capability/script).

No changes to: app-shell, sidebar/nav, today/inbox/ideas/learnings/review/calendar screens, settings screens
(except none — the `confirmTaskDeletion` setting stays single-delete-only), timer dock/pip, PWA/sw.

## 20 Data-provider / repository files expected to change (exact)

1. `lib/store/repository.ts` — add to `EntityRepository`: `deleteMany?(ids: string[]): Promise<void>` (implemented
   by both `Collection` and `RestCollection`); `ProjectMilestoneRepository` gains `deleteMany(ids)` (detach semantics
   documented next to the existing `delete` doc); `AppRepository` gains aggregate
   `deleteTasks(ids) / deleteProjectMilestones(ids) / deleteProjects(ids) / deleteGoals(ids)`, documented with the
   same referential contract text as their single-record siblings (aggregate = where the local "one write" atomicity lives).
2. `lib/store/local-repository.ts` — implement `deleteMany` in `Collection`; aggregates in `LocalRepository`
   (single `current()` + single `write()` each); `LocalProjectMilestones.deleteMany` = today's loop body, batched.
3. `lib/store/supabase-repository.ts` — `RestCollection.deleteMany` (chunked `http.deleteMany`);
   `SupabaseHttpClient.patchWhereIn`; `SupabaseProjectMilestones.deleteMany` (detach-then-delete, schema-gated);
   `SupabaseRepository` aggregates composing them per §13/§14, with the `supportsProjectMilestones()` gate honored
   exactly as `importData`/`importProjectPlan` do.
4. `components/data/data-provider.tsx` — four new `DataActions` + implementations (§15 sequence for tasks),
   per-action error toast + targeted re-read. **No UI code calls repositories directly; no entity logic in components.**

Dataflow stays `UI → DataProvider actions → AppRepository aggregate → backend`. The single-record actions are
refactored **only if trivial** (e.g. `deleteTask` could delegate to `deleteTasks([id])`); default plan: leave
single paths untouched to honor "preserve all existing functionality" and minimize risk.

## 21 Tests to add (exact)

New **`scripts/verify-bulk-delete.tsx`** in the established house style (assertion counter, in-memory
`StorageLike`, **fake PostgREST at the fetch boundary** with per-request log + `in`-filter + `fail(method, table)`
injection, real `LocalRepository`/`SupabaseRepository`/`DataProvider`/screens, jsdom + React act;
run: `npm i --no-save jsdom tsx && npx tsx scripts/verify-bulk-delete.tsx`). Sections mapped to the brief's list:

1. **Tasks / selection** (items 1–7): render TasksScreen with fixture tasks; toggle select mode; click row
   checkboxes → count; select-all visible (with and without an active status/search/project filter — the "N in view"
   label and set follow the filter); clear; group boundaries (active+completed both selectable under 'all').
2. **Confirmation** (8–9): Cancel leaves `pace.db.v1` byte-identical and rows listed; confirm deletes — asserted
   against the *repository*, not just React: `repo.tasks.list()` empty for ids; raw stored JSON parsed and scanned.
3. **Local storage** (10–11): direct `map.get('pace.db.v1')` inspection: no deleted ids anywhere in `tasks`, no
   orphaned subtasks/timerSessions, surviving tasks keep all fields; exactly **one** `setItem` call counted for a
   90-task bulk operation (atomic-write assertion).
4. **Supabase fake** (12, 27, 40): per operation assert DELETE/PATCH calls: right `table`, `id=in.(…)` containing
   exactly the ids (+chunking >200 → two calls), every request carries `user_id=eq.<uid>`; before/after row counts;
   other users' rows in the fake untouched; deleting ids that don't exist = success, no unrelated rows removed.
5. **Parents survive** (13–15): after task deletes, project/milestone/goal rows still present in both backends.
6. **Milestones** (20–28): select, count of descendant tasks in dialog text ("27 tasks" — computed from snapshot),
   confirm ⇒ milestone rows gone, tasks' `projectMilestoneId` cleared (local storage scanned; supabase fake shows
   the detach PATCH before the DELETE and the order), project + goal intact.
7. **Projects** (29–39): counts of milestones/tasks in confirm; confirm ⇒ projects + project_milestones rows gone;
   tasks survive with `projectId` cleared (supabase via base FK — fake asserts only the sequence; local storage
   scanned clean); other projects untouched; goal untouched; **no orphans**: scan every surviving row's references.
8. **Goals** (41–43): bulk goal delete detaches: surviving `projects`/`tasks` keep existing, links cleared
   (local) / FK-null (supabase request log); no project deleted; other goals untouched.
9. **Timers** (44–47): start a timer on two selected tasks, delete: `openSessionRef` cleaned (no writes to deleted
   sessions after delete observable on the fake log order: settle first), session rows gone, dock shows nothing,
   no `tasks.update` for deleted ids after the DELETE (sequence asserted via the fake's log).
10. **Multi-tab** (48–49): two `LocalRepository` instances over one storage — tab A bulk-deletes 3 ids while tab B
    still lists them; tab B then updates a *surviving* task → merge keeps B's edit and the 3 deletions (final state
    via a third fresh repo); tab B checkpoint on a deleted id fails without resurrecting.
11. **Partial failure** (19): fake `fail('DELETE','tasks')` on the second chunk → provider toast, selection
    preserved (UI), first chunk really gone in the fake table, error surfaced verbatim.
12. **Regressions** (50–58): run `verify-workflow`, `verify-learnings-project-milestones`, `verify-project-plan-import`,
    `verify-project-plan-add-to-existing`, `verify-multi-tab`, `verify-timer-concurrency`, `verify-review-stats`,
    `npx tsc --noEmit`, `npm run lint`, `npm run build`. (SQL-level cascade truth is already pinned by
    `verify-project-milestones-sql.ts`; re-run unchanged — no migration edits.)
13. **Accessibility pass**: every new control has a name (`Select task: <title>`, `Select all tasks in view (12)`,
    `Delete 8 tasks`, `Clear selection`), checkbox is `role=checkbox aria-checked` (mixed state on select-all
    allowed as `aria-checked="mixed"`), focus-visible ring like existing controls, keyboard toggle via Enter/Space,
    Esc exits select mode.

## 22 Schema changes required?

**None.** Every cascade/detach Phase 6 needs is already enforced or emulated by the audited schema and
repositories; bulk delete rides `delete()`-equivalent scoped requests plus two existing FK cascade paths
(005/006) and the detach FKs. No new migration, no policy change, **no production Supabase write during
development/testing** (tests use in-memory fakes only; the PGlite script already covers real-DB semantics and is
not re-pointed).

## 23 Risks / ambiguities found (needing approval or explicit note)

1. **Cascade-vs-detach tension (the big one).** The brief's preferred examples ("delete project + its 90 tasks",
   "delete milestone + its tasks") contradict FocusDesk's explicit, documented, both-backend, FK-backed
   contract ("tasks are never deleted" by milestone/project deletion). **Audit recommendation: Phase 6 = follow
   the existing architecture** (detach), with confirmation dialogs that state exactly what happens (tasks
   survive, links cleared, milestones die with projects, goals detach). Divergence would mean either bulk-only
   semantics (bulk ≠ single = confusing, dangerous) or changing single-delete semantics (violates "preserve all
   existing functionality"). If the user explicitly wants cascade-delete tasks-with-project/milestone, that is a
   **semantic change to single deletes too + new repository contract text + new confirm copy** — approved separately,
   it doubles the risk surface; not recommended for Phase 6.
2. `task_history` rows of deleted tasks are kept (no FK) — current single-delete behavior too. Out of scope; noted.
3. Supabase bulk sequences are **not transactional** across requests (PostgREST reality). Mitigated by ordering
   (children before parent), idempotent deletes, honest toasts, selection preserved for retry. No RPC added.
4. Multi-tab: a stale tab's *stale snapshot* keeps showing deleted rows until it next loads (pre-existing; no
   live-sync exists anywhere in the app). Data itself can never be resurrected by it (§7) — the verification script
   pins exactly this.
5. Minor improvement proposed for local: the aggregates also clear now-dangling `projectId`/`goalId` references on
   *surviving* tasks inside their one write (today's single-delete leaves them dangling in storage, resolved-to-nothing
   by the UI anyway). Recommended for the "no orphan records" test to pass **on storage state, not just memory**;
   it is a superset of current behavior and affects no other code path.
6. Running-timer tasks are deletable in bulk (matches single delete, §15) — the brief's alternative ("prevent") is
   rejected for parity; the confirm dialog discloses it.
7. Selection is id-only and filter-scoped; "select all" never means "all rows in DB" (there is no unfiltered
   server-side select). If a future server-side pagination lands, this audit's rule ("select all currently
   matching") must be re-checked.
8. Supabase URL-length with very large `IN (...)` → chunk 200 (§16); >64k deletes would need many requests —
   acceptable (import batching precedent), no silent truncation.
9. `confirmTaskDeletion=false` users still get a confirmation for **bulk** deletes (safety requirement wins over
   the setting for bulk; setting continues to govern single deletes exactly as today).
10. Learnings (`lib/learnings` list screen) *could* get bulk delete almost for free (flat entity, single delete
    today, no references) — **reported optional, not implemented**; Habits (well-being check-ins are toggles on a
    dated row, not deletable records) — **explicitly out**, would need invented semantics.

## 24 Recommended final Phase 6 scope

**In:** reusable per-screen bulk selection (tasks, projects, project milestones, goals) with filter-aware
select-all, count, bulk action bar; always-confirm bulk dialogs with honest, hierarchy-aware summaries;
`deleteMany` on `EntityRepository` + four aggregate repository methods (`deleteTasks`, `deleteProjects`,
`deleteProjectMilestones`, `deleteGoals`) + four `DataActions`; real deletion on both backends (local one-write
aggregates; Supabase chunked user-scoped `id IN` DELETEs + `IN`-detach PATCH where the contract needs it);
timer-settle + session cleanup for task bulk; preserve-selection-on-failure; `scripts/verify-bulk-delete.tsx`
(+ README doc block). **No dependency, no schema change, no production data touched, single-record paths
behaviorally untouched.**

**Out (documented):** cascade-delete-tasks-with-parents (await explicit user decision — default no),
learnings/habits bulk (optional later), cross-tab live sync, task_history GC, RPC transactions.

---

**STOP. Awaiting approval before any implementation.**

---

## 25. Implementation addendum — what shipped (2026-10-08)

Approval was given with the detach-semantics decisions (bulk task delete preserves the
existing subtask/timer-session cascade; bulk milestone/project/goal deletes detach — never
delete — tasks, projects and goals). The implementation follows this audit with exactly two
structural refinements:

1. **`EntityRepository.deleteMany(ids)` is required, not optional** (the audit proposed `deleteMany?`).
   Both backends implement it once in their shared collection classes (`Collection`,
   `RestCollection`), so every collection gains the generic bulk-removal contract for free, and
   `ProjectMilestoneRepository` inherits it with the detach semantics documented beside `delete`.
   No public `deleteWhere`/`patchWhereIn` helpers were exposed on the repositories: bulk
   referential fixes ride on widened filter values (`string | string[]` → `.in(…)`) inside the
   private `SupabaseHttpClient.patchWhere`/`get`, which is less API surface, not more.
2. **The four aggregates (`deleteTasks`/`deleteProjects`/`deleteProjectMilestones`/`deleteGoals`)
   live on `AppRepository`** exactly as §20 recommended — LocalRepository implements each as ONE
   `current()` → mutate → `write()`, SupabaseRepository as ordered, chunked (200 ids),
   user-scoped requests. §16's "one generic `deleteMany` is enough" remains explicitly rejected.

Also, per the §23.5 note, the local bulk aggregates clear dangling `parentTaskId` /
`projectId` / `projectMilestoneId` / `goalId` references **in storage** (including
`monthlyPriorities`, matching the Supabase foreign keys), so a bulk delete leaves the local store
free of references into deleted rows. The single-record paths were deliberately NOT changed.

`scripts/verify-bulk-delete.tsx` implements the §21 test list (143 assertions). Its fake
PostgREST models the audited FK cascades/SET NULL on DELETE so store-state assertions match
what PostgreSQL leaves behind; the real SQL remains pinned by `verify-project-milestones-sql.ts`.

Full Phase 6 verification on `arena/49ea4013-focusdesk` (final state of this branch):
`npx tsc --noEmit`, `npm run lint` (only the two pre-existing `public/sw.js` warnings),
`npm run build`, and every prior suite: workflow, focused-time, review-stats, priority-input,
mobile-layout (same two pre-existing failures as on untouched `main` — its expectations predate
the Sort select, unrelated to Phase 6), multi-tab, timer-concurrency, timer-dock,
learnings-project-milestones, learnings-backup, project-plan-import,
project-plan-add-to-existing, project-milestones-sql (PGlite), bulk-delete.
