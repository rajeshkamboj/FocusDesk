/**
 * Core data model for the personal execution system.
 *
 * These types are the single source of truth shared by the UI, the local
 * repository and the future Supabase repository. Nothing here is seeded with
 * user content — the application provides structure, the user provides content.
 */

export type ID = string;

/** Calendar date in local time, formatted YYYY-MM-DD. */
export type ISODate = string;

/** Full ISO-8601 timestamp. */
export type ISODateTime = string;

/** ISO week key, e.g. "2026-W40". */
export type WeekKey = string;

/** Month key, e.g. "2026-09". */
export type MonthKey = string;

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export type TaskStatus =
  | 'created'
  | 'planned'
  | 'today'
  | 'in_progress'
  | 'completed'
  | 'incomplete'
  | 'someday'
  | 'cancelled';

export type TaskPriority = 'high' | 'medium' | 'low';

export interface Task {
  id: ID;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId?: ID;
  goalId?: ID;
  parentTaskId?: ID;
  createdAt: ISODateTime;
  /** When the user plans to work on the task. */
  scheduledDate?: ISODate;
  /** The hard deadline — independent of the scheduled date. */
  dueDate?: ISODate;
  completedAt?: ISODateTime;
  /** Estimated effort in minutes. Never overwritten by the timer. */
  estimatedDuration?: number;
  /** Actual effort in minutes. (Legacy field — the timer uses seconds.) */
  actualDuration?: number;
  /**
   * Actual active working time in seconds, measured by the task timer.
   * While a task is being timed it holds the time accumulated so far (across
   * pauses); on Finish it is finalized. Remains undefined for tasks that were
   * completed without using the timer.
   */
  actualDurationSeconds?: number;
  /** When the current timing segment started (set by Start/Resume). */
  startedAt?: ISODateTime;
  /** When the task was last paused; undefined while the timer runs. */
  pausedAt?: ISODateTime;
  /** When to surface a reminder (ISO timestamp). */
  reminder?: ISODateTime;
  notes?: string;
  tags: string[];
  /** Reserved for future recurrence support. */
  recurrence?: string;
  /** How many times the task has been postponed. */
  postponementCount: number;
  archived: boolean;
}

export type TaskInput = {
  /** Optional stable ID for app-owned task records; ordinary tasks get an ID from the repository. */
  id?: ID;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  projectId?: ID;
  goalId?: ID;
  parentTaskId?: ID;
  scheduledDate?: ISODate;
  dueDate?: ISODate;
  estimatedDuration?: number;
  reminder?: ISODateTime;
  notes?: string;
  tags?: string[];
};

/** A lightweight checklist item owned by a parent Task; never a timed Task. */
export interface Subtask {
  id: ID;
  parentTaskId: ID;
  title: string;
  completed: boolean;
  /** Stable manual order within its parent task. */
  position: number;
  createdAt: ISODateTime;
}

export type SubtaskInput = {
  parentTaskId: ID;
  title: string;
  /** Assigned by DataProvider based on the sibling list. */
  position?: number;
};

/* ------------------------------------------------------------------ */
/* Timer sessions                                                      */
/* ------------------------------------------------------------------ */

/**
 * One continuous run of a task timer — the segment between a Start/Resume and
 * the next Pause/Finish (or, if the app was closed mid-session, the last
 * durable checkpoint, exactly like `interruptedTimerPatch` recovers the task).
 *
 * Sessions exist for ONE reason: attributing focused time to the calendar day
 * on which it was actually spent. `Task.actualDurationSeconds` keeps its
 * meaning unchanged — the task's lifetime total across every day — and the
 * sum of a task's session durations never exceeds it. Paused time is never
 * part of a session, because a pause ends one and a resume starts the next.
 *
 * A session can legitimately span midnight; it is stored as the single run it
 * was and split across local calendar days when read (see
 * `sessionSecondsByDay` in lib/selectors.ts), so nothing is ever double
 * counted and no day inherits another day's time.
 */
export interface TimerSession {
  id: ID;
  taskId: ID;
  /** When this run of the timer began. */
  startedAt: ISODateTime;
  /**
   * When this run stopped. While the timer is still running this is the last
   * durable checkpoint — i.e. the instant through which time is credited.
   */
  endedAt: ISODateTime;
  /** Active seconds credited by this run. Never includes paused time. */
  durationSeconds: number;
}

export type TimerSessionInput = {
  taskId: ID;
  startedAt: ISODateTime;
  endedAt: ISODateTime;
  durationSeconds: number;
};

/* ------------------------------------------------------------------ */
/* Projects & goals                                                    */
/* ------------------------------------------------------------------ */

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';

export interface Project {
  id: ID;
  name: string;
  description?: string;
  goalId?: ID;
  deadline?: ISODate;
  status: ProjectStatus;
  createdAt: ISODateTime;
}

export type ProjectInput = {
  name: string;
  description?: string;
  goalId?: ID;
  deadline?: ISODate;
  status?: ProjectStatus;
};

export type GoalStatus = 'active' | 'completed' | 'archived';

export interface Goal {
  id: ID;
  name: string;
  description?: string;
  deadline?: ISODate;
  status: GoalStatus;
  createdAt: ISODateTime;
}

export type GoalInput = {
  name: string;
  description?: string;
  deadline?: ISODate;
  status?: GoalStatus;
};

/* ------------------------------------------------------------------ */
/* Priorities                                                          */
/* ------------------------------------------------------------------ */

export interface DailyPriority {
  id: ID;
  date: ISODate;
  title: string;
  completed: boolean;
  completedAt?: ISODateTime;
  /** Optional deadline for the priority, separate from its day. */
  dueDate?: ISODate;
  /** How many times the priority has been moved to another day. */
  postponementCount?: number;
}

export interface WeeklyPriority {
  id: ID;
  week: WeekKey;
  title: string;
  primary: boolean;
  completed: boolean;
  completedAt?: ISODateTime;
}

export interface MonthlyPriority {
  id: ID;
  month: MonthKey;
  title: string;
  completed: boolean;
  completedAt?: ISODateTime;
  goalId?: ID;
  projectId?: ID;
}

/* ------------------------------------------------------------------ */
/* Daily well-being                                                    */
/* ------------------------------------------------------------------ */

/**
 * The four daily well-being check-ins: jogging and the three Nitnem
 * check-ins. Deliberately a fixed, tiny set — this is not a habit tracker.
 */
export type WellbeingHabit = 'jogging' | 'nitnemMorning' | 'nitnemEvening' | 'nitnemNight';

/**
 * One day's well-being check-ins, for any calendar day — today or a past day
 * recorded retrospectively. A record only exists once the user has checked
 * something for that day; an absent record means "nothing checked that day"
 * and is shown in history as a real day with 0 of 4 completed — never as a
 * day that does not exist.
 */
export interface WellbeingDay {
  id: ID;
  date: ISODate;
  jogging: boolean;
  nitnemMorning: boolean;
  nitnemEvening: boolean;
  nitnemNight: boolean;
}

export type WellbeingDayInput = {
  date: ISODate;
  jogging?: boolean;
  nitnemMorning?: boolean;
  nitnemEvening?: boolean;
  nitnemNight?: boolean;
};

/* ------------------------------------------------------------------ */
/* Inbox                                                               */
/* ------------------------------------------------------------------ */

/**
 * A captured thought the user has not yet classified.
 * Convertible later into a task, project, goal, idea or "someday" task.
 */
export interface InboxItem {
  id: ID;
  title: string;
  note?: string;
  createdAt: ISODateTime;
}

export type InboxItemInput = {
  title: string;
  note?: string;
};

/* ------------------------------------------------------------------ */
/* Ideas                                                               */
/* ------------------------------------------------------------------ */

export interface Idea {
  id: ID;
  title: string;
  description?: string;
  createdAt: ISODateTime;
  archived: boolean;
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export type TaskHistoryType =
  | 'created'
  | 'scheduled'
  | 'rescheduled'
  | 'completed'
  | 'reopened'
  | 'postponed'
  | 'cancelled'
  | 'deadline_changed'
  | 'project_changed';

export interface TaskHistoryEntry {
  id: ID;
  taskId: ID;
  type: TaskHistoryType;
  at: ISODateTime;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export type ThemePreference = 'light' | 'dark' | 'system';

export interface Settings {
  general: {
    /** Custom display name used for the user greeting. */
    displayName?: string;
    /** Open the app on the Today screen instead of the last visited section. */
    startOnToday: boolean;
    confirmTaskDeletion: boolean;
    /** Move unfinished past tasks to today when the app opens. */
    automaticCarryForward: boolean;
    /** Default estimated duration for new tasks, in minutes. */
    defaultTaskDuration: number;
  };
  notifications: {
    morningPriorityReminder: boolean;
    taskReminders: boolean;
    deadlineReminders: boolean;
    eveningReviewReminder: boolean;
  };
  appearance: {
    theme: ThemePreference;
  };
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                          */
/* ------------------------------------------------------------------ */

export interface AppData {
  tasks: Task[];
  subtasks: Subtask[];
  projects: Project[];
  goals: Goal[];
  inbox: InboxItem[];
  ideas: Idea[];
  dailyPriorities: DailyPriority[];
  weeklyPriorities: WeeklyPriority[];
  monthlyPriorities: MonthlyPriority[];
  taskHistory: TaskHistoryEntry[];
  /** One record per day with at least one check-in; a day without a record still shows as 0 of 4. */
  wellbeingDays: WellbeingDay[];
  /** One record per continuous run of a task timer — the basis of daily focused time. */
  timerSessions: TimerSession[];
  settings: Settings;
}
