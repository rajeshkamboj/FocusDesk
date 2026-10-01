/**
 * Pure derived-state helpers. No side effects — safe to use anywhere.
 */

import { daysBetween, todayISO } from './dates';
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

/** Tasks currently planned for a given calendar day (not completed/cancelled). */
export function tasksOnDate(tasks: Task[], date: ISODate): Task[] {
  return tasks.filter((t) => t.scheduledDate === date && isOpenTask(t));
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
  completed: Task[];
  incomplete: Task[];
  cancelled: Task[];
  postponedCount: number;
  priorityCompleted: boolean | null;
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
  const dayTasks = data.tasks.filter((t) => !t.archived && t.scheduledDate === date);
  const completed = dayTasks.filter((t) => t.status === 'completed').sort(byCompletedDesc);
  const cancelled = dayTasks.filter((t) => t.status === 'cancelled');
  const incomplete = dayTasks.filter((t) => isOpenTask(t));
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
  };
}

export interface WeeklyReviewStats {
  completed: Task[];
  cancelled: Task[];
  postponedCount: number;
  completedDailyPriorities: number;
  totalDailyPriorities: number;
  projectsWorkedOn: { project: Project; completed: number }[];
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
  for (const t of completed) {
    if (t.projectId) byProject.set(t.projectId, (byProject.get(t.projectId) ?? 0) + 1);
  }
  const projectsWorkedOn = data.projects
    .filter((p) => byProject.has(p.id))
    .map((project) => ({ project, completed: byProject.get(project.id) ?? 0 }));

  return {
    completed,
    cancelled,
    postponedCount,
    completedDailyPriorities: dayPriorities.filter((p) => p.completed).length,
    totalDailyPriorities: dayPriorities.length,
    projectsWorkedOn,
  };
}

export interface MonthlyReviewStats {
  completed: Task[];
  monthlyPriorities: { priority: MonthlyPriority; progress: Progress | null }[];
  projectProgress: { project: Project; progress: Progress }[];
  repeatedlyPostponed: Task[];
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

  return { completed, monthlyPriorities, projectProgress: projectStats, repeatedlyPostponed };
}
