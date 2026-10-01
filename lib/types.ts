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
  projects: Project[];
  goals: Goal[];
  inbox: InboxItem[];
  ideas: Idea[];
  dailyPriorities: DailyPriority[];
  weeklyPriorities: WeeklyPriority[];
  monthlyPriorities: MonthlyPriority[];
  taskHistory: TaskHistoryEntry[];
  settings: Settings;
}
