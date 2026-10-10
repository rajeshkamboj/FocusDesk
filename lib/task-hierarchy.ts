/** Full child Tasks (tasks.parentTaskId), NOT lightweight checklist Subtasks. */
import type { Task } from './types';

/**
 * Depth-first rows for the tasks already in a view. Never fetches extra tasks
 * or hides a filtered/detached child. Preserve input order among roots and
 * siblings; a valid parent always precedes its children. Old corrupt/cyclic
 * data remains visible once per task instead of hanging or disappearing.
 */
export function taskHierarchyRows(tasks: Task[]): { task: Task; depth: number }[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const children = new Map<string, Task[]>();
  const roots: Task[] = [];
  for (const task of tasks) {
    const parent = task.parentTaskId ? byId.get(task.parentTaskId) : undefined;
    if (!parent || parent.id === task.id || parent.projectId !== task.projectId || parent.projectMilestoneId !== task.projectMilestoneId) {
      roots.push(task);
    } else {
      const siblings = children.get(parent.id) ?? [];
      siblings.push(task);
      children.set(parent.id, siblings);
    }
  }
  const rows: { task: Task; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (root: Task) => {
    const stack = [{ task: root, depth: 0 }];
    while (stack.length > 0) {
      const row = stack.pop()!;
      if (seen.has(row.task.id)) continue;
      seen.add(row.task.id);
      rows.push(row);
      const siblings = children.get(row.task.id) ?? [];
      for (let index = siblings.length - 1; index >= 0; index--) {
        stack.push({ task: siblings[index], depth: row.depth + 1 });
      }
    }
  };
  for (const root of roots) walk(root);
  for (const task of tasks) if (!seen.has(task.id)) walk(task);
  return rows;
}

/**
 * Ordinary edits remain independent (dates, status, timer, milestone, etc.).
 * A project/parent edit may not create a missing, cross-project or cyclic
 * parent chain. This guard is used by DataProvider's authenticated actions;
 * plan imports separately validate the complete pending hierarchy.
 */
export function assertTaskHierarchyChange(current: Task | undefined, patch: Partial<Task>, tasks: Task[]): void {
  const has = (key: keyof Task) => Object.prototype.hasOwnProperty.call(patch, key);
  if (!has('projectId') && !has('parentTaskId')) return;
  const projectId = has('projectId') ? patch.projectId || undefined : current?.projectId;
  const parentTaskId = has('parentTaskId') ? patch.parentTaskId || undefined : current?.parentTaskId;
  // Forms resend associations on ordinary edits. Do not block or "repair"
  // legacy data when neither relationship actually changed.
  if (current && projectId === current.projectId && parentTaskId === current.parentTaskId) return;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (parentTaskId !== undefined) {
    const parent = byId.get(parentTaskId);
    if (!parent) throw new Error('That parent task no longer exists.');
    if (parent.projectId !== projectId) throw new Error('A child task must stay in the same project as its parent.');
    const seen = new Set<string>(current ? [current.id] : []);
    let next: Task | undefined = parent;
    while (next) {
      if (seen.has(next.id)) throw new Error('A task cannot be its own ancestor.');
      seen.add(next.id);
      next = next.parentTaskId ? byId.get(next.parentTaskId) : undefined;
    }
  }
  if (current && tasks.some((task) => task.parentTaskId === current.id && task.projectId !== projectId)) {
    throw new Error('A parent task must stay in the same project as its child tasks.');
  }
}
