/**
 * Pure derived-state helpers. No side effects — safe to use anywhere.
 */

import { addDays, daysBetween, monthKey, parseISODate, toISODate, todayISO } from './dates';
import { isTimerRunning } from './timer';
import type {
  AppData,
  ISODate,
  MonthKey,
  MonthlyPriority,
  Project,
  Subtask,
  Task,
  TaskStatus,
  TimerSession,
  WellbeingDay,
} from './types';

export const OPEN_STATUSES: TaskStatus[] = ['created', 'planned', 'today', 'in_progress', 'incomplete'];

export type DateSortDirection = 'asc' | 'desc';
export type TaskSort = 'deadline-asc' | 'deadline-desc' | 'scheduled-asc' | 'scheduled-desc' | 'priority-asc' | 'priority-desc' | 'created-desc' | 'created-asc';
export type EntityDateSort = 'deadline-asc' | 'deadline-desc' | 'created-desc' | 'created-asc';

const priorityRank: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 };

function compareOptionalDate(a: string | undefined, b: string | undefined, direction: DateSortDirection): number {
  const aMissing = !a;
  const bMissing = !b;
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  const result = a.localeCompare(b);
  return direction === 'asc' ? result : -result;
}

function compareCreated(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }, direction: DateSortDirection): number {
  const result = a.createdAt.localeCompare(b.createdAt);
  return result !== 0 ? (direction === 'asc' ? result : -result) : a.id.localeCompare(b.id);
}

export function compareTasks(a: Task, b: Task, sort: TaskSort): number {
  const deadline = compareOptionalDate(a.dueDate, b.dueDate, sort.endsWith('asc') ? 'asc' : 'desc');
  const scheduled = compareOptionalDate(a.scheduledDate, b.scheduledDate, sort.endsWith('asc') ? 'asc' : 'desc');
  const priority = priorityRank[a.priority] - priorityRank[b.priority];
  const created = compareCreated(a, b, sort.endsWith('asc') ? 'asc' : 'desc');

  if (sort === 'deadline-asc' || sort === 'deadline-desc') {
    return deadline || compareOptionalDate(a.scheduledDate, b.scheduledDate, 'asc') || priority || compareCreated(a, b, 'desc');
  }
  if (sort === 'scheduled-asc' || sort === 'scheduled-desc') {
    return scheduled || compareOptionalDate(a.dueDate, b.dueDate, 'asc') || priority || compareCreated(a, b, 'desc');
  }
  if (sort === 'priority-asc' || sort === 'priority-desc') {
    const priorityResult = sort === 'priority-asc' ? priority : -priority;
    return priorityResult || compareOptionalDate(a.dueDate, b.dueDate, 'asc') || compareOptionalDate(a.scheduledDate, b.scheduledDate, 'asc') || compareCreated(a, b, 'desc');
  }
  return created;
}

export function compareDatedEntities(
  a: { deadline?: string; createdAt: string; id: string },
  b: { deadline?: string; createdAt: string; id: string },
  sort: EntityDateSort,
): number {
  // The selected sort is always the primary ordering. Status may be supplied
  // by callers as contextual information, but must not override it.
  if (sort === 'deadline-asc' || sort === 'deadline-desc') {
    return compareOptionalDate(a.deadline, b.deadline, sort === 'deadline-asc' ? 'asc' : 'desc') || compareCreated(a, b, 'desc');
  }
  return compareCreated(a, b, sort === 'created-asc' ? 'asc' : 'desc');
}

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

/** Subtasks belonging to one task, in stable creation/manual order. */
export function subtasksForTask(subtasks: Subtask[], parentTaskId: string): Subtask[] {
  return subtasks
    .filter((subtask) => subtask.parentTaskId === parentTaskId)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
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

/* ------------------------------------------------------------------ */
/* Focused time — daily attribution of recorded timer sessions         */
/* ------------------------------------------------------------------ */

/**
 * Focused time is the time FocusDesk's own task timers recorded. It is not a
 * claim about every minute worked, and the per-day attribution below is
 * deliberately never derived by summing `Task.actualDurationSeconds`: that
 * field is a task's lifetime total, so a task worked on Monday and Tuesday
 * would otherwise report its whole total on both days. Days are attributed
 * from timer sessions — the individual runs between Start/Resume and
 * Pause/Finish. (The month summary, `focusedTimeInMonth`, is separate: it
 * sums each completed task's total exactly once, in the month the task was
 * completed.)
 */

/** Milliseconds of `[fromMs, toMs)` that fall inside the local calendar day `day`. */
function overlapWithDay(day: ISODate, fromMs: number, toMs: number): number {
  const dayStart = parseISODate(day).getTime();
  const dayEnd = parseISODate(addDays(day, 1)).getTime();
  return Math.max(0, Math.min(toMs, dayEnd) - Math.max(fromMs, dayStart));
}

/**
 * Split one recorded run across the local calendar days it actually spans and
 * add the result into `into`.
 *
 * A run that starts at 23:40 and ends at 00:20 contributes 20 minutes to each
 * of the two days — the whole point of storing runs instead of per-task
 * totals. Day boundaries come from `parseISODate`, i.e. local midnight, so
 * DST-shortened and DST-lengthened days are handled by the calendar itself.
 *
 * `durationSeconds` is authoritative (it is the credited active time); the
 * wall-clock span only decides *how* it is distributed. The last slice
 * absorbs the rounding remainder, so the split always sums back to exactly
 * `durationSeconds` and a day can never gain or lose a second.
 */
export function sessionSecondsByDay(
  session: Pick<TimerSession, 'startedAt' | 'endedAt' | 'durationSeconds'>,
  into: Map<ISODate, number> = new Map(),
): Map<ISODate, number> {
  const duration = Math.max(0, Math.floor(session.durationSeconds));
  if (duration <= 0) return into;

  const startMs = Date.parse(session.startedAt);
  if (Number.isNaN(startMs)) return into;
  const parsedEnd = Date.parse(session.endedAt);
  const endMs = Number.isNaN(parsedEnd) || parsedEnd <= startMs ? startMs + duration * 1000 : parsedEnd;

  const add = (day: ISODate, seconds: number) => {
    if (seconds > 0) into.set(day, (into.get(day) ?? 0) + seconds);
  };

  const spanMs = endMs - startMs;
  if (spanMs <= 0) {
    add(toISODate(new Date(startMs)), duration);
    return into;
  }

  // Walk the local days the run touches. Guarded against a non-advancing
  // cursor so a pathological timestamp can never spin here.
  const slices: { day: ISODate; ms: number }[] = [];
  let cursor = startMs;
  while (cursor < endMs && slices.length < 400) {
    const day = toISODate(new Date(cursor));
    const ms = overlapWithDay(day, cursor, endMs);
    const next = cursor + Math.max(ms, 1);
    slices.push({ day, ms });
    cursor = next;
  }
  if (slices.length === 0) {
    add(toISODate(new Date(startMs)), duration);
    return into;
  }

  let assigned = 0;
  slices.forEach((slice, index) => {
    const seconds =
      index === slices.length - 1 ? duration - assigned : Math.round((slice.ms / spanMs) * duration);
    assigned += seconds;
    add(slice.day, seconds);
  });
  return into;
}

/**
 * Seconds a *running* timer has accumulated since its last durable
 * checkpoint — the part not yet written to any session row.
 *
 * `checkpointTimingPatch` advances `startedAt` by exactly the seconds it
 * credits, so `[startedAt, now]` is precisely the uncredited remainder. The
 * stored session covers everything before it. Adding the two therefore shows
 * a live total without ever counting the same second twice.
 */
export function liveSessionSecondsByDay(
  tasks: Task[],
  nowMs: number,
  into: Map<ISODate, number> = new Map(),
): Map<ISODate, number> {
  for (const task of tasks) {
    if (task.archived || !isTimerRunning(task) || !task.startedAt) continue;
    const startedMs = Date.parse(task.startedAt);
    if (Number.isNaN(startedMs) || nowMs <= startedMs) continue;
    sessionSecondsByDay(
      {
        startedAt: task.startedAt,
        endedAt: new Date(nowMs).toISOString(),
        durationSeconds: Math.floor((nowMs - startedMs) / 1000),
      },
      into,
    );
  }
  return into;
}

/** Recorded focused seconds per local calendar day, across all given sessions. */
export function focusedSecondsByDay(
  sessions: TimerSession[],
  taskIds?: Set<string>,
): Map<ISODate, number> {
  const byDay = new Map<ISODate, number>();
  for (const session of sessions) {
    if (taskIds && !taskIds.has(session.taskId)) continue;
    sessionSecondsByDay(session, byDay);
  }
  return byDay;
}

export interface FocusedTimeEntry {
  task: Task;
  seconds: number;
}

export interface FocusedTimeDay {
  date: ISODate;
  /** Focused seconds recorded by FocusDesk's task timers on this day. */
  seconds: number;
  /** Per-task breakdown for the day, largest first. */
  byTask: FocusedTimeEntry[];
}

/** Live-task set used for attribution: archived tasks are left out everywhere. */
function liveTaskMap(tasks: Task[]): Map<string, Task> {
  const map = new Map<string, Task>();
  for (const task of tasks) if (!task.archived) map.set(task.id, task);
  return map;
}

/**
 * One day's focused time and its per-task breakdown.
 *
 * Includes the running timer's uncheckpointed remainder so the number is
 * truthful while a session is in progress; pass a fixed `nowMs` for a stable
 * snapshot.
 */
export function focusedTimeOnDate(
  data: Pick<AppData, 'tasks' | 'timerSessions'>,
  date: ISODate,
  nowMs: number = Date.now(),
): FocusedTimeDay {
  const tasks = liveTaskMap(data.tasks);
  const byTask = new Map<string, number>();

  const credit = (taskId: string, seconds: number) => {
    if (seconds <= 0 || !tasks.has(taskId)) return;
    byTask.set(taskId, (byTask.get(taskId) ?? 0) + seconds);
  };

  // Only runs that actually overlap this local day can contribute, so most
  // of the history is skipped without being split.
  const dayStartMs = parseISODate(date).getTime();
  const dayEndMs = parseISODate(addDays(date, 1)).getTime();
  const touchesDay = (startedAt: string, endedAt: string, durationSeconds: number) => {
    const startMs = Date.parse(startedAt);
    if (Number.isNaN(startMs)) return false;
    const parsedEnd = Date.parse(endedAt);
    const endMs = Number.isNaN(parsedEnd) || parsedEnd <= startMs ? startMs + durationSeconds * 1000 : parsedEnd;
    return startMs < dayEndMs && endMs > dayStartMs;
  };

  for (const session of data.timerSessions) {
    if (!tasks.has(session.taskId)) continue;
    if (!touchesDay(session.startedAt, session.endedAt, session.durationSeconds)) continue;
    credit(session.taskId, sessionSecondsByDay(session).get(date) ?? 0);
  }
  for (const task of tasks.values()) {
    if (!isTimerRunning(task)) continue;
    credit(task.id, liveSessionSecondsByDay([task], nowMs).get(date) ?? 0);
  }

  const entries: FocusedTimeEntry[] = [...byTask.entries()]
    .map(([taskId, seconds]) => ({ task: tasks.get(taskId)!, seconds }))
    .filter((entry) => entry.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds || a.task.title.localeCompare(b.task.title));

  return {
    date,
    seconds: entries.reduce((sum, entry) => sum + entry.seconds, 0),
    byTask: entries,
  };
}

export interface FocusedTimeMonth {
  month: MonthKey;
  /** Sum of the completed tasks' `actualDurationSeconds` for the month. */
  seconds: number;
  /** Distinct local dates in the month on which a task was completed. */
  daysWorked: number;
}

/**
 * One month's focused time, from the authoritative task-completion data.
 *
 * A month's focused time is the timer time of the work *completed* in it:
 * every non-archived completed task whose `completedAt` falls on a local date
 * inside the month contributes its timer's own accumulated total
 * (`actualDurationSeconds` — the sum of every Start/Pause/Resume segment,
 * finalized on Finish). That task field is the single source of truth, so no
 * second duration is calculated and completions recorded before
 * `timer_sessions` existed count exactly like any other. Planned/estimated
 * durations are never read.
 *
 * Days worked counts the distinct local `completedAt` dates — five completions
 * on one day are one worked day, completions on three different days are
 * three. The date comes from `completedAt` (never `scheduledDate`) and is the
 * user's local calendar date (`toISODate`), never a UTC slice of the
 * timestamp.
 */
export function focusedTimeInMonth(
  data: Pick<AppData, 'tasks'>,
  month: MonthKey,
): FocusedTimeMonth {
  const daysWorkedOn = new Set<ISODate>();
  let seconds = 0;
  for (const task of data.tasks) {
    if (task.archived) continue;
    const day = completedOnDate(task);
    if (day === undefined || monthKey(day) !== month) continue;
    seconds += task.actualDurationSeconds ?? 0;
    daysWorkedOn.add(day);
  }
  return { month, seconds, daysWorked: daysWorkedOn.size };
}

/** Stable ID for the normal Task record that stores a daily priority's timer session. */
export function dailyPriorityTimerTaskId(priorityId: string): string {
  return `daily-priority-timer:${priorityId}`;
}

/** Whether a task ID belongs to a daily priority's app-owned timer Task. */
export function isDailyPriorityTimerTaskId(taskId: string): boolean {
  return taskId.startsWith('daily-priority-timer:');
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
 * An absent record is a fresh, untouched day — never an overdue one; in
 * history it still represents a real day with 0 of 4 completed.
 */
export function wellbeingOnDate(days: WellbeingDay[], date: ISODate = todayISO()): WellbeingDay | undefined {
  return days.find((d) => d.date === date);
}

/**
 * How many of the four daily check-ins are done on a day. A missing record is
 * a real day with nothing checked — it counts as 0, never "no day".
 */
export function wellbeingCompletedCount(day?: WellbeingDay): number {
  if (!day) return 0;
  return (
    (day.jogging ? 1 : 0) +
    (day.nitnemMorning ? 1 : 0) +
    (day.nitnemEvening ? 1 : 0) +
    (day.nitnemNight ? 1 : 0)
  );
}

export interface WellbeingMonthTotals {
  jogging: number;
  nitnemMorning: number;
  nitnemEvening: number;
  nitnemNight: number;
}

/**
 * Distinct days on which each of the four check-ins was completed within one
 * calendar month (MonthKey, e.g. "2026-10"), derived locally from the same
 * wellbeing_days records the rest of the app uses. Both the wording — a day
 * either happened or it did not — and the counting are deliberately plain:
 * a date is counted once no matter how many writes its row received.
 */
export function monthlyWellbeingTotals(days: WellbeingDay[], month: MonthKey): WellbeingMonthTotals {
  const seen = new Set<ISODate>();
  const totals: WellbeingMonthTotals = { jogging: 0, nitnemMorning: 0, nitnemEvening: 0, nitnemNight: 0 };
  for (const day of days) {
    if (monthKey(day.date) !== month || seen.has(day.date)) continue;
    seen.add(day.date);
    if (day.jogging) totals.jogging += 1;
    if (day.nitnemMorning) totals.nitnemMorning += 1;
    if (day.nitnemEvening) totals.nitnemEvening += 1;
    if (day.nitnemNight) totals.nitnemNight += 1;
  }
  return totals;
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
