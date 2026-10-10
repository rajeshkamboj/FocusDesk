/**
 * The Tasks screen's filter rules, as pure functions.
 *
 * These used to live inline in `TasksScreen`'s `useMemo`. They were moved here
 * unchanged so that one implementation answers both questions the screen now
 * asks: "which tasks are in view?" (`filterTasks`) and, for timer navigation,
 * "which of the current filters hide this one task?" (`conflictingTaskFilters`).
 * Sharing the code is what guarantees the two can never disagree.
 *
 * Every dimension is an independent predicate and the list is their
 * conjunction, so a task is in view exactly when it passes all of them — and
 * the filters that hide it are exactly the ones it fails on its own.
 */

import { overdueTasks, repeatedlyPostponedTasks } from './selectors';
import type { ID, ISODate, Project, Task } from './types';

export type TaskFilterId =
  | 'all'
  | 'today'
  | 'upcoming'
  | 'unscheduled'
  | 'someday'
  | 'completed'
  | 'cancelled'
  | 'overdue'
  | 'postponed';

export const TASK_FILTERS: { id: TaskFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'unscheduled', label: 'Unscheduled' },
  { id: 'someday', label: 'Someday' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'postponed', label: 'Postponed 3×+' },
];

/** The Tasks screen's view state that narrows the list (sort is not a filter). */
export interface TaskFilterState {
  filter: TaskFilterId;
  projectFilter: string;
  goalFilter: string;
  query: string;
}

export interface TaskFilterContext {
  today: ISODate;
  projects: Project[];
  /** Tasks the screen never lists (today's priority timer Task has its own card). */
  hiddenTaskIds: ReadonlySet<ID>;
}

/** One independently clearable filter dimension. */
export type TaskFilterKey = 'filter' | 'projectFilter' | 'goalFilter' | 'query';

/** Whether the Tasks screen can list this task at all, under any filters. */
export function isListableTask(task: Task, ctx: TaskFilterContext): boolean {
  return !task.archived && !ctx.hiddenTaskIds.has(task.id);
}

function applyStatusFilter(list: Task[], filter: TaskFilterId, today: ISODate): Task[] {
  if (filter === 'today') return list.filter((t) => t.scheduledDate === today && t.status !== 'completed' && t.status !== 'cancelled');
  if (filter === 'upcoming') return list.filter((t) => t.scheduledDate !== undefined && t.scheduledDate > today && t.status !== 'completed' && t.status !== 'cancelled');
  if (filter === 'unscheduled') return list.filter((t) => t.scheduledDate === undefined && t.status !== 'someday' && t.status !== 'completed' && t.status !== 'cancelled');
  if (filter === 'someday') return list.filter((t) => t.status === 'someday');
  if (filter === 'completed') return list.filter((t) => t.status === 'completed');
  if (filter === 'cancelled') return list.filter((t) => t.status === 'cancelled');
  if (filter === 'overdue') return overdueTasks(list, today);
  if (filter === 'postponed') return repeatedlyPostponedTasks(list);
  // 'all' keeps every status visible.
  return list;
}

function applyProjectFilter(list: Task[], projectFilter: string): Task[] {
  return projectFilter ? list.filter((t) => t.projectId === projectFilter) : list;
}

function applyGoalFilter(list: Task[], goalFilter: string, projects: Project[]): Task[] {
  if (!goalFilter) return list;
  return list.filter(
    (t) => t.goalId === goalFilter || (t.projectId && projects.find((p) => p.id === t.projectId)?.goalId === goalFilter),
  );
}

function applyQuery(list: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (t) => t.title.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
}

/** The tasks in view under `state` — exactly the screen's previous inline logic. */
export function filterTasks(tasks: Task[], state: TaskFilterState, ctx: TaskFilterContext): Task[] {
  let list = tasks.filter((t) => isListableTask(t, ctx));
  list = applyStatusFilter(list, state.filter, ctx.today);
  list = applyProjectFilter(list, state.projectFilter);
  list = applyGoalFilter(list, state.goalFilter, ctx.projects);
  list = applyQuery(list, state.query);
  return list;
}

/**
 * The filter dimensions that, on their own, hide `task` under `state`.
 * Empty when the task is already in view. Only meaningful for a listable task
 * (see `isListableTask`): no filter change can reveal an archived task or
 * today's priority timer Task.
 */
export function conflictingTaskFilters(task: Task, state: TaskFilterState, ctx: TaskFilterContext): TaskFilterKey[] {
  const one = [task];
  const conflicts: TaskFilterKey[] = [];
  if (applyStatusFilter(one, state.filter, ctx.today).length === 0) conflicts.push('filter');
  if (applyProjectFilter(one, state.projectFilter).length === 0) conflicts.push('projectFilter');
  if (applyGoalFilter(one, state.goalFilter, ctx.projects).length === 0) conflicts.push('goalFilter');
  if (applyQuery(one, state.query).length === 0) conflicts.push('query');
  return conflicts;
}

/** The value each dimension is reset to when it has to be cleared. */
export const CLEARED_TASK_FILTERS: TaskFilterState = { filter: 'all', projectFilter: '', goalFilter: '', query: '' };
