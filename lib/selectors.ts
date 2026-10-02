/**
 * Pure derived-state helpers. No side effects — safe to use anywhere.
 */

import { daysBetween, toISODate, todayISO } from './dates';
import type {
  AppData,
  ISODate,
  MonthlyPriority,
  Project,
  Task,
  TaskStatus,
  WellbeingDay,
} from './types';

export const OPEN_STATUSES: TaskStatus[] = ['created', 'planned', 'today', 'in_progress', 'incomplete'];

export function isOpenTask(task: Task): boolean {
  return OPEN_STATUSES.includes(task.status) && !task.archived;
}

export function isCompletedTask(task: Task): boolean {
  return task.status === 'completed';
}

/**
 * Put uncompleted tasks before completed tasks without changing the order of
 * either group. This is for mixed task lists (such as project and goal task
 * lists), where newly created tasks are appended to the source array and must
 * not end up below older completed tasks. Scheduling and manual/insertion
 * order within the active group are preserved.
 */
export function uncompletedTasksFirst(tasks: Task[]): Task[] {
  const uncompleted: Task[] = [];
  const completed: Task[] = [];

  for (const task of tasks) {
    (isCompletedTask(task) ? completed : uncompleted).push(task);
  }

  return [...uncompleted, ...completed];
}

/** Tasks currently planned for a given calendar day (not completed/cancelled). */
export function tasksOnDate(tasks: Task[], date: ISODate): Task[] {
  return tasks.filter((t) => t.scheduledDate === date && isOpenTask(t));
}

/**
 * Focused time (seconds) invested across the given tasks.
 *
 * Reads the task timer's own value — `actualDurationSeconds`, the total of
 * every Start/Pause/Resume segment, finalized by the timer when the task was
 * finished. No second duration field and no second calculation exist.
 */
export function focusedSeconds(tasks: Task[]): number {
  return tasks.reduce((sum, t) => sum + (t.actualDurationSeconds ?? 0), 0);
}

/** Stable ID for the normal Task record that stores a daily priority's timer session. */
export function dailyPriorityTimerTaskId(priorityId: string): string {
  return `daily-priority-timer:${priorityId}`;
}

/** Focused time (seconds) invested in a project's completed tasks. */
export function projectFocusedSeconds(tasks: Task[], projectId: string): number {
  return focusedSeconds(tasks.filter((t) => t.projectId === projectId && t.status === 'completed' && !t.archived));
}

/** Open tasks scheduled before `date`. */
export function overdueTasks(tasks: Task[], date: ISODate = todayISO()): Task[] {
  return tasks.filter(
    (t) => isOpenTask(t) && t.scheduledDate !== undefined && t.scheduledDate < date,
  );
}

/** Open tasks whose deadline is within `days` days (including overdue). */
export function tasksWithApproachingDeadline(tasks: Task[], days = 3, date: ISODate = todayISO()): Task[] {
  return tasks.filter((t) => {
    if (!isOpenTask(t) || !t.dueDate) return false;
    const diff = daysBetween(date, t.dueDate);
    return diff <= days;
  });
}

/**
 * The well-being record for a day, if the user checked anything that day.
 * An absent record is a fresh, untouched day — never an overdue one.
 */
export function wellbeingOnDate(days: WellbeingDay[], date: ISODate = todayISO()): WellbeingDay | undefined {
  return days.find((d) => d.date === date);
}

export interface Progress {
  done: number;
  total: number;
  /** 0..1 */
  ratio: number;
}

export function progress(done: number, total: number): Progress {
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

/** Completion progress for one project. */
export function projectProgress(tasks: Task[], projectId: string): Progress {
  const all = tasks.filter((t) => t.projectId === projectId && !t.archived);
  return progress(all.filter(isCompletedTask).length, all.length);
}

/** Completion progress for one goal (its projects' tasks + direct tasks). */
export function goalProgress(tasks: Task[], projects: Project[], goalId: string): Progress {
  const projectIds = new Set(projects.filter((p) => p.goalId === goalId).map((p) => p.id));
  const all = tasks.filter(
    (t) => !t.archived && (t.goalId === goalId || (t.projectId !== undefined && projectIds.has(t.projectId))),
  );
  return progress(all.filter(isCompletedTask).length, all.length);
}

/** Completion progress for a monthly priority (via linked project/goal). */
export function monthlyPriorityProgress(
  data: AppData,
  priority: MonthlyPriority,
): Progress | null {
  if (priority.projectId) return projectProgress(data.tasks, priority.projectId);
  if (priority.goalId) return goalProgress(data.tasks, data.projects, priority.goalId);
  return null;
}

export interface DailyReviewStats {
  date: ISODate;
  /**
   * Work actually finished on `date`: every non-archived completed task whose
   * `completedAt` falls on that local calendar day, whatever it was scheduled
   * for. Ordered by `completedAt` descending.
   */
  completed: Task[];
  /** Open tasks that were planned for `date` (`scheduledDate`). */
  incomplete: Task[];
  cancelled: Task[];
  postponedCount: number;
  priorityCompleted: boolean | null;
  /** Focused time (seconds) invested in the day's completed tasks. */
  focusedSeconds: number;
}

/**
 * The calendar day a completed task was finished on, in the user's local time
 * zone. `completedAt` is stored as an ISO instant (`new Date().toISOString()`),
 * so it has to go through the same local-day conversion the rest of the app
 * uses — slicing the string would compare UTC dates and push work done in the
 * local evening onto the next day (and pull early-morning work back a day).
 * Returns undefined for anything that is not a completed task with a usable
 * timestamp, so no completion date is ever invented.
 */
function completedOnDate(task: Task): ISODate | undefined {
  if (task.status !== 'completed' || !task.completedAt) return undefined;
  const at = new Date(task.completedAt);
  if (Number.isNaN(at.getTime())) return undefined;
  return toISODate(at);
}

/** Stable comparator: completed_at DESC, null timestamps last, then createdAt DESC. */
function byCompletedDesc(a: { completedAt?: string; createdAt: string }, b: { completedAt?: string; createdAt: string }): number {
  const at = a.completedAt ? Date.parse(a.completedAt) : NaN;
  const bt = b.completedAt ? Date.parse(b.completedAt) : NaN;
  const av = Number.isNaN(at) ? 0 : at;
  const bv = Number.isNaN(bt) ? 0 : bt;
  if (av !== bv) return bv - av;
  return b.createdAt.localeCompare(a.createdAt);
}

export function dailyReviewStats(data: AppData, date: ISODate): DailyReviewStats {
  const live = data.tasks.filter((t) => !t.archived);

  // "What actually happened on this day?" Completion timing comes from
  // completedAt — never from scheduledDate, which only says when the work was
  // *planned*. A task planned yesterday but finished today therefore belongs to
  // today, and one planned today but finished tomorrow belongs to tomorrow.
  // A completed record with no completedAt (legacy/imported data) keeps the
  // old behaviour and is reported on its scheduled day; no completion date is
  // invented for it.
  const completed = live
    .filter((t) => t.status === 'completed' && (completedOnDate(t) ?? t.scheduledDate) === date)
    .sort(byCompletedDesc);

  // Planned-but-unfinished work is still keyed off scheduledDate: that is what
  // "what was planned for this day" means.
  const planned = live.filter((t) => t.scheduledDate === date);
  const cancelled = planned.filter((t) => t.status === 'cancelled');
  const incomplete = planned.filter(isOpenTask);
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);
  const postponedCount = data.taskHistory.filter((h) => {
    if (h.type !== 'postponed') return false;
    const at = new Date(h.at);
    return at >= start && at <= end;
  }).length;
  const priority = data.dailyPriorities.find((p) => p.date === date);
  return {
    date,
    completed,
    incomplete,
    cancelled,
    postponedCount,
    priorityCompleted: priority ? priority.completed : null,
    focusedSeconds: focusedSeconds(completed),
  };
}

export interface WeeklyReviewStats {
  completed: Task[];
  cancelled: Task[];
  postponedCount: number;
  completedDailyPriorities: number;
  totalDailyPriorities: number;
  projectsWorkedOn: { project: Project; completed: number; focusedSeconds: number }[];
  /** Focused time (seconds) invested in the week's completed tasks. */
  focusedSeconds: number;
}

export function weeklyReviewStats(data: AppData, from: ISODate, to: ISODate): WeeklyReviewStats {
  const inRange = (d?: string) => d !== undefined && d >= from && d <= to;

  const completed = data.tasks.filter((t) => !t.archived && t.status === 'completed' && inRange(t.scheduledDate ?? t.completedAt?.slice(0, 10))).sort(byCompletedDesc);
  const cancelled = data.tasks.filter((t) => t.status === 'cancelled' && inRange(t.scheduledDate));

  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);
  const postponedCount = data.taskHistory.filter((h) => {
    if (h.type !== 'postponed') return false;
    const at = new Date(h.at);
    return at >= start && at <= end;
  }).length;

  const dayPriorities = data.dailyPriorities.filter((p) => p.date >= from && p.date <= to);

  const byProject = new Map<string, number>();
  const focusedByProject = new Map<string, number>();
  for (const t of completed) {
    if (!t.projectId) continue;
    byProject.set(t.projectId, (byProject.get(t.projectId) ?? 0) + 1);
    focusedByProject.set(t.projectId, (focusedByProject.get(t.projectId) ?? 0) + (t.actualDurationSeconds ?? 0));
  }
  const projectsWorkedOn = data.projects
    .filter((p) => byProject.has(p.id))
    .map((project) => ({
      project,
      completed: byProject.get(project.id) ?? 0,
      focusedSeconds: focusedByProject.get(project.id) ?? 0,
    }));

  return {
    completed,
    cancelled,
    postponedCount,
    completedDailyPriorities: dayPriorities.filter((p) => p.completed).length,
    totalDailyPriorities: dayPriorities.length,
    projectsWorkedOn,
    focusedSeconds: focusedSeconds(completed),
  };
}

export interface MonthlyReviewStats {
  completed: Task[];
  monthlyPriorities: { priority: MonthlyPriority; progress: Progress | null }[];
  projectProgress: { project: Project; progress: Progress }[];
  repeatedlyPostponed: Task[];
  /** Focused time (seconds) invested in the month's completed tasks. */
  focusedSeconds: number;
}

export function monthlyReviewStats(data: AppData, month: string): MonthlyReviewStats {
  const completed = data.tasks
    .filter((t) => !t.archived && t.status === 'completed' && (t.completedAt ?? '').slice(0, 7) === month)
    .sort(byCompletedDesc);

  const monthlyPriorities = data.monthlyPriorities
    .filter((p) => p.month === month)
    .map((priority) => ({ priority, progress: monthlyPriorityProgress(data, priority) }));

  const touchedProjectIds = new Set(completed.map((t) => t.projectId).filter(Boolean) as string[]);
  const projectStats = data.projects
    .filter((p) => touchedProjectIds.has(p.id))
    .map((project) => ({ project, progress: projectProgress(data.tasks, project.id) }));

  const repeatedlyPostponed = data.tasks
    .filter((t) => !t.archived && isOpenTask(t) && t.postponementCount >= 3)
    .sort((a, b) => b.postponementCount - a.postponementCount);

  return {
    completed,
    monthlyPriorities,
    projectProgress: projectStats,
    repeatedlyPostponed,
    focusedSeconds: focusedSeconds(completed),
  };
}
