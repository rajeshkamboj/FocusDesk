/**
 * Project Milestones — pure rules, no I/O.
 *
 *   Goal → Project → ProjectMilestone → Task
 *
 * A task may sit directly under its project (no milestone) or inside one of
 * that project's milestones. The single invariant guarded here:
 *
 *   when a task has a projectMilestoneId, that milestone belongs to the
 *   task's own projectId — a task without a project has no milestone.
 *
 * Every task write in DataProvider goes through `resolveTaskMilestone`, the
 * local repository re-checks the reference against freshly stored data (the
 * job a foreign key does in PostgreSQL), and imports are checked by
 * `findProjectMilestoneProblems` before anything is replaced. So the app
 * never persists an invalid project/milestone combination.
 *
 * Unrelated to Learnings (the learning timeline once called "Milestones").
 */

import type { AppData, ID, ProjectMilestone, Task } from './types';

/** A rejected milestone operation. The message is written for the user. */
export class ProjectMilestoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectMilestoneError';
  }
}

/**
 * Manual order. `position` decides; equal positions (only concurrent creation
 * in two tabs can produce them) fall back to creation order and then id, so
 * the list is deterministic and never jumps around between renders.
 */
export function compareProjectMilestones(a: ProjectMilestone, b: ProjectMilestone): number {
  if (a.position !== b.position) return a.position - b.position;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** One project's milestones in their manual order. No project → none. */
export function projectMilestonesFor(milestones: ProjectMilestone[], projectId: ID | undefined): ProjectMilestone[] {
  if (!projectId) return [];
  return milestones.filter((m) => m.projectId === projectId).sort(compareProjectMilestones);
}

/** Position for a milestone appended after the project's current last one. */
export function nextProjectMilestonePosition(milestones: ProjectMilestone[], projectId: ID): number {
  return milestones.reduce((max, m) => (m.projectId === projectId ? Math.max(max, m.position) : max), -1) + 1;
}

/**
 * Validate a complete new order for one project and return the position each
 * milestone gets (its index). `orderedIds` must be exactly the project's
 * milestones — a missing, duplicated, unknown or foreign id is rejected, so a
 * reorder can never pull another project's milestone in.
 */
export function planProjectMilestoneOrder(
  milestones: ProjectMilestone[],
  projectId: ID,
  orderedIds: ID[],
): { id: ID; position: number }[] {
  const own = new Set(milestones.filter((m) => m.projectId === projectId).map((m) => m.id));
  const seen = new Set<ID>();
  for (const id of orderedIds) {
    if (!own.has(id)) throw new ProjectMilestoneError('That milestone is not part of this project.');
    if (seen.has(id)) throw new ProjectMilestoneError('A milestone appears twice in the new order.');
    seen.add(id);
  }
  if (seen.size !== own.size) throw new ProjectMilestoneError('The new order must include every milestone of the project.');
  return orderedIds.map((id, position) => ({ id, position }));
}

/** The id order after moving one milestone a single slot up (-1) or down (+1). */
export function moveProjectMilestone(ordered: ProjectMilestone[], id: ID, direction: -1 | 1): ID[] {
  const ids = ordered.map((m) => m.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}

const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Decide the milestone a task may have after a write — the one place the
 * invariant is enforced for the UI and service layer.
 *
 * `current` is the stored task (undefined when creating), `patch` the
 * incoming change (for a new task: its whole input). Returns the patch to
 * persist:
 *
 *  - An explicit milestone must name an existing milestone of the task's
 *    resulting project. Anything else is rejected with a ProjectMilestoneError
 *    — never silently swapped for a different milestone.
 *  - An explicit empty value ('' / undefined) means "No milestone".
 *  - A real project change without an explicit milestone keeps the current
 *    milestone only if it belongs to the new project; otherwise the patch
 *    clears it. Re-sending the same project changes nothing.
 *  - A patch that touches neither field is returned as-is.
 */
export function resolveTaskMilestone<P extends { projectId?: ID; projectMilestoneId?: ID }>(
  current: Pick<Task, 'projectId' | 'projectMilestoneId'> | undefined,
  patch: P,
  milestones: ProjectMilestone[],
): P {
  const currentProject = current?.projectId || undefined;
  const projectId = has(patch, 'projectId') ? patch.projectId || undefined : currentProject;

  if (has(patch, 'projectMilestoneId')) {
    const milestoneId = patch.projectMilestoneId || undefined;
    if (!milestoneId) return { ...patch, projectMilestoneId: undefined };
    if (!projectId) throw new ProjectMilestoneError('Choose a project before choosing a milestone.');
    const milestone = milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new ProjectMilestoneError('That milestone no longer exists.');
    if (milestone.projectId !== projectId) throw new ProjectMilestoneError('That milestone belongs to a different project.');
    return patch;
  }

  const projectChanged = projectId !== currentProject;
  if (!projectChanged || !current?.projectMilestoneId) return patch;
  const kept = milestones.find((m) => m.id === current.projectMilestoneId);
  if (kept && projectId !== undefined && kept.projectId === projectId) return patch;
  return { ...patch, projectMilestoneId: undefined };
}

/**
 * Integrity problems that make a payload unsafe to import: a project
 * milestone whose project is not in the payload, or a task whose milestone is
 * missing or belongs to another project. An empty list means consistent.
 *
 * Imports are checked with this *before* anything is replaced, so a bad file
 * is refused with nothing changed (and Supabase is never left half-imported
 * by a foreign-key error).
 */
export function findProjectMilestoneProblems(
  data: Pick<AppData, 'projects' | 'projectMilestones' | 'tasks'>,
): string[] {
  const problems: string[] = [];
  const projectIds = new Set(data.projects.map((p) => p.id));
  const milestones = new Map(data.projectMilestones.map((m) => [m.id, m]));
  for (const m of data.projectMilestones) {
    if (!projectIds.has(m.projectId)) {
      problems.push(`Project milestone “${m.name}” belongs to a project that is not in the file.`);
    }
  }
  for (const t of data.tasks) {
    if (!t.projectMilestoneId) continue;
    const m = milestones.get(t.projectMilestoneId);
    if (!m) problems.push(`Task “${t.title}” refers to a project milestone that is not in the file.`);
    else if (m.projectId !== t.projectId) problems.push(`Task “${t.title}” is not in the same project as its milestone “${m.name}”.`);
  }
  return problems;
}

/** Throw a single readable error if `findProjectMilestoneProblems` finds anything. */
export function assertProjectMilestonesConsistent(data: Pick<AppData, 'projects' | 'projectMilestones' | 'tasks'>): void {
  const problems = findProjectMilestoneProblems(data);
  if (problems.length === 0) return;
  const shown = problems.slice(0, 3).join(' ');
  const more = problems.length > 3 ? ` (and ${problems.length - 3} more)` : '';
  throw new ProjectMilestoneError(`Import refused — nothing was changed. ${shown}${more}`);
}
