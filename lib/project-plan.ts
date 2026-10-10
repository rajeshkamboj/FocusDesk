/**
 * FocusDesk project plan — the canonical JSON format for plans written by
 * ChatGPT (or by hand) and imported into the app.
 *
 *   Goal → Project → ProjectMilestone → Task → child Task
 *
 * Pure rules only: this module parses, validates and *resolves* a plan into
 * the records FocusDesk would create. It never touches storage, never talks to
 * Supabase and never writes. Writing is the repository's job
 * (`AppRepository.importProjectPlan`), and the UI reaches it only through
 * DataProvider — exactly like every other write in the app.
 *
 * WHY IT IS ADDITIVE
 * ------------------
 * The existing `importData` replaces the whole database. A project plan does
 * the opposite: it *adds* one goal, its projects, their milestones and their
 * tasks, and leaves everything else — the Learnings included — byte for byte
 * alone. Nothing in this format can express an update or a delete.
 *
 * IDENTITIES
 * ----------
 * A plan may carry `id` values, but they are **import-only temporary ids**
 * used to express relationships (a task pointing at its milestone). They are
 * never primary keys: the repository mints real FocusDesk ids with the app's
 * own generator and rewrites every reference through the map it builds while
 * doing so. A plan therefore cannot choose, collide with or overwrite an
 * existing record's id, and cannot name another user's record.
 *
 * VALIDATION
 * ----------
 * Everything is checked before a single record is written, and any error
 * rejects the *whole* plan — there is no partial import. Warnings are the
 * things a user may legitimately want (a project with no goal, a deadline in
 * the past) and never change data.
 *
 * Not to be confused with Learnings: a project plan contains no learning
 * timeline, and a top-level `milestones` array (the pre-Phase-3 export key,
 * which means Learnings) is rejected rather than guessed at.
 * See docs/focusdesk-project-plan-v1.md.
 */

import { todayISO } from './dates';
import { assertProjectMilestonesConsistent, nextProjectMilestonePosition } from './project-milestones';
import type {
  Goal,
  GoalStatus,
  ID,
  ISODate,
  Project,
  ProjectMilestone,
  ProjectStatus,
  Task,
  TaskPriority,
  TaskStatus,
} from './types';

/* ------------------------------------------------------------------ */
/* The format                                                          */
/* ------------------------------------------------------------------ */

/** The only accepted value of `format`. */
export const PROJECT_PLAN_FORMAT = 'focusdesk-project-plan';

/** The only accepted value of `version`. */
export const PROJECT_PLAN_VERSION = 1;

/**
 * The accepted value of every enum, with the label the UI shows.
 *
 * Typed as `Record<Model, string>` on purpose: if the data model ever gains a
 * status these objects stop compiling, so the importer cannot drift out of
 * step with `lib/types.ts`.
 */
export const PROJECT_PLAN_TASK_STATUSES: Record<TaskStatus, string> = {
  created: 'Created',
  planned: 'Planned',
  today: 'Today',
  in_progress: 'In Progress',
  completed: 'Completed',
  incomplete: 'Incomplete',
  someday: 'Someday',
  cancelled: 'Cancelled',
};

export const PROJECT_PLAN_TASK_PRIORITIES: Record<TaskPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const PROJECT_PLAN_PROJECT_STATUSES: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

export const PROJECT_PLAN_GOAL_STATUSES: Record<GoalStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

export const PROJECT_PLAN_TASK_STATUS_VALUES = Object.keys(PROJECT_PLAN_TASK_STATUSES) as TaskStatus[];
export const PROJECT_PLAN_TASK_PRIORITY_VALUES = Object.keys(PROJECT_PLAN_TASK_PRIORITIES) as TaskPriority[];
export const PROJECT_PLAN_PROJECT_STATUS_VALUES = Object.keys(PROJECT_PLAN_PROJECT_STATUSES) as ProjectStatus[];
export const PROJECT_PLAN_GOAL_STATUS_VALUES = Object.keys(PROJECT_PLAN_GOAL_STATUSES) as GoalStatus[];

/**
 * The fields each record may carry — the schema, in code. Anything outside
 * these lists is reported and ignored, so a plan can never smuggle in a field
 * FocusDesk does not have.
 */
export const PROJECT_PLAN_FIELDS = {
  plan: ['format', 'version', 'name', 'goal', 'projects', 'projectMilestones', 'tasks'],
  goal: ['id', 'name', 'description', 'deadline', 'status'],
  project: ['id', 'name', 'description', 'deadline', 'status', 'milestones', 'tasks'],
  milestone: ['id', 'projectId', 'name', 'description', 'targetDate', 'tasks'],
  task: ['id', 'projectId', 'milestoneId', 'title', 'description', 'status', 'priority', 'scheduledDate', 'dueDate', 'estimatedDuration', 'notes', 'tags', 'subtasks'],
} as const;

/** Sanity ceilings, so one paste can never ask for an unbounded write. */
export const PROJECT_PLAN_LIMITS = {
  projects: 100,
  milestones: 500,
  /** All full tasks, including every descendant. */
  tasks: 2000,
  /** Root task = level 1; at most 19 child edges below it. */
  taskDepth: 20,
  /** UTF-8 size of pasted/uploaded JSON, before parsing. */
  bytes: 5 * 1024 * 1024,
} as const;

/** A plan that cannot be imported. The message is written for the user. */
export class ProjectPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectPlanError';
  }
}

/* ------------------------------------------------------------------ */
/* What a validated plan resolves to                                   */
/* ------------------------------------------------------------------ */

/**
 * A record ready to be written, still carrying its **temporary** id.
 *
 * `tempId` is either the id the plan supplied or one this module made up so
 * every record has a key. The repository replaces all of them with real
 * FocusDesk ids and rewrites `goalTempId` / `projectTempId` /
 * `projectMilestoneTempId` / `parentTaskTempId` through the same map.
 */
export interface PendingGoal {
  tempId: string;
  name: string;
  description?: string;
  deadline?: ISODate;
  status: GoalStatus;
}

export interface PendingProject {
  tempId: string;
  /** The plan's single goal, when it has one. */
  goalTempId?: string;
  name: string;
  description?: string;
  deadline?: ISODate;
  status: ProjectStatus;
}

export interface PendingProjectMilestone {
  tempId: string;
  projectTempId: string;
  name: string;
  description?: string;
  targetDate?: ISODate;
  /** Order within its project: 0, 1, 2… — the JSON order, never a date. */
  position: number;
}

export interface PendingTask {
  tempId: string;
  /** Inferred only from nesting, never an existing task id supplied by JSON. */
  parentTaskTempId?: string;
  projectTempId?: string;
  projectMilestoneTempId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  scheduledDate?: ISODate;
  dueDate?: ISODate;
  estimatedDuration?: number;
  notes?: string;
  tags: string[];
  /**
   * The plan says the task is already done. The repository stamps
   * `completedAt` with the import time, because a completed task without one
   * would never show up as completed work in Review.
   */
  completed?: boolean;
}

/** Everything an import would create — nothing else, and nothing to update. */
export interface ResolvedProjectPlan {
  goals: PendingGoal[];
  projects: PendingProject[];
  projectMilestones: PendingProjectMilestone[];
  tasks: PendingTask[];
}

/** What a repository hands back after a successful import: real records. */
export interface ProjectPlanImportResult {
  goals: Goal[];
  projects: Project[];
  projectMilestones: ProjectMilestone[];
  tasks: Task[];
}

/* ------------------------------------------------------------------ */
/* Issues, counts and the preview                                      */
/* ------------------------------------------------------------------ */

export interface ProjectPlanIssue {
  /** Where in the plan, e.g. `projects[1].milestones[0].tasks[2]`. */
  path: string;
  message: string;
}

export interface ProjectPlanCounts {
  goals: number;
  projects: number;
  projectMilestones: number;
  /** Total full tasks, roots + all descendants. */
  tasks: number;
  /** Tasks without a parent (including roots with no children). */
  parentTasks: number;
  /** Every task below a root, at any depth. */
  subtasks: number;
}

export interface PreviewTask {
  tempId: string;
  title: string;
  description?: string;
  estimatedDuration?: number;
  subtasks: PreviewTask[];
  status: TaskStatus;
  priority: TaskPriority;
  scheduledDate?: ISODate;
  dueDate?: ISODate;
}

export interface PreviewMilestone {
  name: string;
  position: number;
  targetDate?: ISODate;
  tasks: PreviewTask[];
}

export interface PreviewProject {
  name: string;
  status: ProjectStatus;
  deadline?: ISODate;
  milestones: PreviewMilestone[];
  /** This project's tasks that sit in no milestone. */
  tasks: PreviewTask[];
}

export interface ProjectPlanPreview {
  planName?: string;
  goal?: { name: string; status: GoalStatus; deadline?: ISODate };
  projects: PreviewProject[];
  /** Tasks that will have no project at all. */
  tasks: PreviewTask[];
  counts: ProjectPlanCounts;
}

/** The whole answer: valid or not, and exactly what it would create. */
export interface ProjectPlanReview {
  /** True when the plan may be imported as it stands. */
  ok: boolean;
  errors: ProjectPlanIssue[];
  warnings: ProjectPlanIssue[];
  counts: ProjectPlanCounts;
  /** Present only when `ok`. */
  plan?: ResolvedProjectPlan;
  /** Present only when `ok`. */
  preview?: ProjectPlanPreview;
}

export interface ProjectPlanOptions {
  /**
   * Whether the backend can store Project Milestones right now. False on
   * Supabase before migration 008 — a plan containing milestones is then
   * refused, instead of being imported without them.
   */
  projectMilestonesAvailable?: boolean;
  /** Reference day for the "in the past" warnings. Defaults to local today. */
  today?: ISODate;
  /**
   * What the import does with the plan (Phase 5). `create-new-project` (the
   * default) is the Phase 4 behavior: the plan's goal, projects, milestones
   * and tasks are created. `add-to-existing-project` accepts exactly one
   * source project and is resolved against a target project with
   * `resolveExistingProjectImport` — validation only adds the one-project rule.
   */
  mode?: ProjectPlanImportMode;
}

const EMPTY_COUNTS: ProjectPlanCounts = { goals: 0, projects: 0, projectMilestones: 0, tasks: 0, parentTasks: 0, subtasks: 0 };

/* ------------------------------------------------------------------ */
/* Small readers                                                       */
/* ------------------------------------------------------------------ */

type Rec = Record<string, unknown>;

const isRecord = (value: unknown): value is Rec =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A non-blank string, or undefined. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real calendar day written as `YYYY-MM-DD`.
 *
 * Deliberately strict: a FocusDesk date is the string the user's local
 * calendar means, so `2026-10-10T00:00:00Z` — an instant that is already the
 * previous evening in some time zones — is refused rather than silently
 * shifted. Nothing in this module ever builds a Date out of a plan value.
 */
export function isValidPlanDate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  // Do not use Date.UTC: it treats years 00–99 as 1900–1999.
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= days[m - 1];
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/** Collects issues and owns the plan's temporary-id namespace. */
class PlanReview {
  readonly errors: ProjectPlanIssue[] = [];
  readonly warnings: ProjectPlanIssue[] = [];
  /** temporary id → where it was claimed, so a duplicate can name both. */
  private readonly ids = new Map<string, string>();
  private readonly today: ISODate;
  /** The import mode — decides the mode-specific rules and warnings. */
  readonly mode: ProjectPlanImportMode;

  constructor(private readonly options: ProjectPlanOptions) {
    this.today = options.today ?? todayISO();
    this.mode = options.mode ?? 'create-new-project';
  }

  error(path: string, message: string): void {
    this.errors.push({ path, message });
  }

  warn(path: string, message: string): void {
    this.warnings.push({ path, message });
  }

  /**
   * Claim a temporary id for one record. A missing one is made up; a repeated
   * one is an error, because two records sharing an id make every reference to
   * it ambiguous.
   */
  tempId(path: string, raw: unknown, fallback: string): string | undefined {
    const supplied = text(raw);
    if (supplied === undefined) {
      // Made-up keys start with '#' and are re-generated on a clash, so a plan
      // that itself uses '#p1' cannot be confused with an internal key.
      let generated = `#${fallback}`;
      let n = 0;
      while (this.ids.has(generated)) generated = `#${fallback}-${(n += 1)}`;
      this.ids.set(generated, path);
      return generated;
    }
    if (supplied.length > 64) {
      this.error(path, `The temporary id “${supplied.slice(0, 20)}…” is too long (64 characters at most).`);
      return undefined;
    }
    const seen = this.ids.get(supplied);
    if (seen !== undefined) {
      this.error(path, `The temporary id “${supplied}” is used twice — here and at ${seen}. Ids must be unique across the whole plan.`);
      return undefined;
    }
    this.ids.set(supplied, path);
    return supplied;
  }

  knows(id: string): boolean {
    return this.ids.has(id);
  }

  /** Fields the plan sent that FocusDesk does not have. */
  unknownFields(path: string, record: Rec, allowed: readonly string[], label: string): void {
    const known: readonly string[] = allowed;
    for (const key of Object.keys(record)) {
      if (known.includes(key)) continue;
      if (allowed === PROJECT_PLAN_FIELDS.task && record[key] != null && (key === 'parentTaskId' || key === 'parent_task_id' || key === 'parentTaskTempId')) {
        this.error(path, `“${key}” is not supported in a plan. Put child tasks in “subtasks”; parents must come from this imported hierarchy, never existing records.`);
        continue;
      }
      if (key === 'goalId') {
        this.error(
          path,
          `“goalId” is not supported on ${label}: a plan has at most one goal, at the top level, and every project of the plan belongs to it.`,
        );
        continue;
      }
      if (record[key] === undefined || record[key] === null) continue;
      this.warn(path, `Unsupported field “${key}” on this ${label} will be ignored.`);
    }
  }

  /** A required, non-blank text field. */
  required(path: string, record: Rec, field: string, label: string): string | undefined {
    const raw = record[field];
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      this.error(path, `This ${label} needs “${field}”.`);
      return undefined;
    }
    const value = text(raw);
    if (value === undefined) {
      this.error(path, `“${field}” of this ${label} must be a non-empty string.`);
      return undefined;
    }
    return value;
  }

  optionalText(path: string, record: Rec, field: string, label: string): string | undefined {
    const raw = record[field];
    if (raw === undefined || raw === null) return undefined;
    const value = text(raw);
    if (value === undefined) {
      this.error(path, `“${field}” of this ${label} must be a string.`);
      return undefined;
    }
    return value;
  }

  /** An optional `YYYY-MM-DD` field, plus its "in the past" warning. */
  date(path: string, record: Rec, field: string, label: string): ISODate | undefined {
    const raw = record[field];
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (!isValidPlanDate(raw)) {
      const shown = typeof raw === 'string' ? raw : JSON.stringify(raw);
      this.error(path, `“${field}” of this ${label} is not a date FocusDesk can store: ${shown}. Use a full ISO date, YYYY-MM-DD.`);
      return undefined;
    }
    if (raw < this.today) this.warn(path, `This ${label} has a “${field}” in the past (${raw}).`);
    return raw;
  }

  /** An optional enum, matched case- and separator-insensitively. */
  enumeration<T extends string>(
    path: string,
    record: Rec,
    field: string,
    allowed: Record<T, string>,
    label: string,
    fallback: T,
  ): T {
    const raw = record[field];
    if (raw === undefined || raw === null || raw === '') return fallback;
    if (typeof raw !== 'string') {
      this.error(path, `“${field}” of this ${label} must be a string.`);
      return fallback;
    }
    const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_') as T;
    if (Object.prototype.hasOwnProperty.call(allowed, key)) return key;
    this.error(path, `“${field}” of this ${label} is “${raw}”. Supported values: ${Object.keys(allowed).join(', ')}.`);
    return fallback;
  }

  /** An optional temporary reference that must point inside this plan. */
  reference(path: string, raw: unknown, field: string, label: string, what: string): string | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const value = text(raw);
    if (value === undefined) {
      this.error(path, `“${field}” of this ${label} must be a string.`);
      return undefined;
    }
    if (!this.knows(value)) {
      this.error(path, `This ${label} refers to ${what} “${value}”, which does not exist in this plan.`);
      return undefined;
    }
    return value;
  }

  array(path: string, raw: unknown, field: string): unknown[] {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) {
      this.error(path, `“${field}” must be an array.`);
      return [];
    }
    return raw;
  }
}

/** Where a task was found, which decides its project and milestone. */
interface TaskContext {
  tasks: PendingTask[];
  /** The containing task; children inherit its project and milestone, even when unset. */
  parentTaskTempId?: string;
  /** The project this task sits in, when it sits in one. */
  projectTempId?: string;
  /** The milestone this task sits in, when it sits in one. */
  milestoneTempId?: string;
  /** temporary milestone id → temporary id of the project that owns it. */
  milestoneProjects: Map<string, string>;
  /** True for the plan's top-level `tasks` array. */
  topLevel?: boolean;
}

/** One task, wherever it sits in the plan. */
function readTask(review: PlanReview, raw: unknown, path: string, context: TaskContext): void {
  if (!isRecord(raw)) {
    review.error(path, 'A task must be a JSON object.');
    return;
  }
  review.unknownFields(path, raw, PROJECT_PLAN_FIELDS.task, 'task');
  const title = review.required(path, raw, 'title', 'task');
  const tempId = review.tempId(path, raw.id, `t${context.tasks.length}`);
  const named = title ?? '(untitled task)';

  // Where the task sits decides its project; an explicit `projectId` may only
  // agree with that, never contradict it.
  let projectTempId = context.projectTempId;
  const askedProject = review.reference(path, raw.projectId, 'projectId', 'task', 'a project');
  if (askedProject !== undefined) {
    if (context.parentTaskTempId !== undefined && askedProject !== projectTempId) {
      review.error(path, `Subtask “${named}” must stay in its parent task’s project.`);
    } else if (projectTempId === undefined) projectTempId = askedProject;
    else if (askedProject !== projectTempId) {
      review.error(path, `Task “${named}” sits inside one project but its “projectId” names another.`);
    } else {
      review.warn(path, `Task “${named}” repeats the project it already sits in — “projectId” was ignored.`);
    }
  }

  // Same rule for the milestone: inside a milestone it is that milestone,
  // otherwise `milestoneId` may name one — of the task's own project.
  let milestoneTempId = context.milestoneTempId;
  const askedMilestone = review.reference(path, raw.milestoneId, 'milestoneId', 'task', 'a project milestone');
  if (askedMilestone !== undefined) {
    if (context.parentTaskTempId !== undefined && askedMilestone !== milestoneTempId) {
      review.error(path, `Subtask “${named}” must keep its parent task’s milestone (or no milestone).`);
    } else if (milestoneTempId === undefined) milestoneTempId = askedMilestone;
    else if (askedMilestone !== milestoneTempId) {
      review.error(path, `Task “${named}” sits inside one milestone but its “milestoneId” names another.`);
    } else {
      review.warn(path, `Task “${named}” repeats the milestone it already sits in — “milestoneId” was ignored.`);
    }
  }
  if (milestoneTempId !== undefined) {
    const owner = context.milestoneProjects.get(milestoneTempId);
    if (projectTempId === undefined) {
      review.error(
        path,
        `Task “${named}” refers to milestone “${milestoneTempId}” but has no project. Move the task into that milestone, or give it the milestone’s “projectId”.`,
      );
      milestoneTempId = undefined;
    } else if (owner !== undefined && owner !== projectTempId) {
      review.error(
        path,
        `Task “${named}” is in a different project than milestone “${milestoneTempId}”. A task can only carry a milestone of its own project.`,
      );
      milestoneTempId = undefined;
    }
  }

  const status = review.enumeration<TaskStatus>(path, raw, 'status', PROJECT_PLAN_TASK_STATUSES, 'task', 'created');
  const priority = review.enumeration<TaskPriority>(path, raw, 'priority', PROJECT_PLAN_TASK_PRIORITIES, 'task', 'medium');
  const scheduledDate = review.date(path, raw, 'scheduledDate', 'task');
  const dueDate = review.date(path, raw, 'dueDate', 'task');
  if (scheduledDate && dueDate && scheduledDate > dueDate) {
    review.warn(path, `Task “${named}” is scheduled for ${scheduledDate}, after its ${dueDate} deadline.`);
  }

  let estimatedDuration: number | undefined;
  if (raw.estimatedDuration !== undefined && raw.estimatedDuration !== null && raw.estimatedDuration !== '') {
    const value = raw.estimatedDuration;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      review.error(path, `“estimatedDuration” of task “${named}” must be a whole number of minutes, 1 or more.`);
    } else {
      estimatedDuration = value;
    }
  }

  let tags: string[] = [];
  if (raw.tags !== undefined && raw.tags !== null) {
    if (!Array.isArray(raw.tags)) {
      review.error(path, `“tags” of task “${named}” must be an array of strings.`);
    } else if (raw.tags.some((tag) => text(tag) === undefined)) {
      review.error(path, `“tags” of task “${named}” must contain non-empty strings only.`);
    } else {
      tags = raw.tags.map((tag) => text(tag)!);
    }
  }

  if (title === undefined || tempId === undefined) return;

  if (status === 'completed') {
    review.warn(path, `Task “${title}” is imported as completed, and will be dated the day of the import.`);
  }
  if (projectTempId === undefined && context.topLevel && review.mode === 'create-new-project') {
    // In add-to-existing-project mode a root task becomes a project-level task
    // of the chosen project — see resolveExistingProjectImport.
    review.warn(path, `Task “${title}” has no project — it will sit in Tasks on its own.`);
  }

  context.tasks.push({
    tempId,
    parentTaskTempId: context.parentTaskTempId,
    projectTempId,
    projectMilestoneTempId: milestoneTempId,
    title,
    description: review.optionalText(path, raw, 'description', 'task'),
    status,
    priority,
    scheduledDate,
    dueDate,
    estimatedDuration,
    notes: review.optionalText(path, raw, 'notes', 'task'),
    tags,
    completed: status === 'completed' || undefined,
  });

  // The bounded hierarchy was checked iteratively before this recursive read.
  // Preorder gives each child a claimed parent id and preserves JSON siblings.
  review.array(`${path}.subtasks`, raw.subtasks, 'subtasks').forEach((child, index) => {
    readTask(review, child, `${path}.subtasks[${index}]`, {
      tasks: context.tasks,
      parentTaskTempId: tempId,
      projectTempId,
      milestoneTempId,
      milestoneProjects: context.milestoneProjects,
    });
  });
}

/** One milestone, nested in a project (`owner`) or flat at the top level. */
function readMilestone(
  review: PlanReview,
  raw: unknown,
  path: string,
  owner: string | undefined,
  ordinal: number,
  milestoneProjects: Map<string, string>,
): PendingProjectMilestone | undefined {
  if (!isRecord(raw)) {
    review.error(path, 'A project milestone must be a JSON object.');
    return undefined;
  }
  review.unknownFields(path, raw, PROJECT_PLAN_FIELDS.milestone, 'project milestone');
  const name = review.required(path, raw, 'name', 'project milestone');
  const tempId = review.tempId(path, raw.id, `m${ordinal}`);
  const named = name ?? '(unnamed milestone)';

  let projectTempId = owner;
  const asked = review.reference(path, raw.projectId, 'projectId', 'project milestone', 'a project');
  if (owner !== undefined) {
    if (asked !== undefined && asked !== owner) {
      review.error(path, `Milestone “${named}” sits inside one project but its “projectId” names another.`);
      return undefined;
    }
    if (asked !== undefined) {
      review.warn(path, `Milestone “${named}” repeats the project it already sits in — “projectId” was ignored.`);
    }
  } else if (asked !== undefined) {
    projectTempId = asked;
  } else {
    review.error(path, 'A milestone in the top-level “projectMilestones” array must say which project it belongs to, with “projectId”.');
    return undefined;
  }
  if (name === undefined || tempId === undefined || projectTempId === undefined) return undefined;

  milestoneProjects.set(tempId, projectTempId);
  return {
    tempId,
    projectTempId,
    name,
    description: review.optionalText(path, raw, 'description', 'project milestone'),
    targetDate: review.date(path, raw, 'targetDate', 'project milestone'),
    // Filled in once every milestone has been read: the order in the JSON.
    position: 0,
  };
}

/** A block of tasks to read once the whole structure is known. */
interface TaskGroup {
  path: string;
  projectTempId?: string;
  milestoneTempId?: string;
  raw: unknown[];
}

/**
 * Bound the entire task tree BEFORE recursive readers/preview builders run.
 * A stack of array cursors also bounds memory on very wide/deep input. JSON
 * cannot contain cycles, but the parsed-object API refuses cyclic/shared task
 * objects as well. Bad fields are still reported by the ordinary task reader.
 */
function checkTaskTreeLimits(review: PlanReview, groups: TaskGroup[]): boolean {
  const seen = new WeakSet<object>();
  let count = 0;
  for (const group of groups) {
    const stack = [{ list: group.raw, index: 0, path: group.path, depth: 1 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.index === frame.list.length) {
        stack.pop();
        continue;
      }
      const index = frame.index++;
      const raw = frame.list[index];
      const path = `${frame.path}[${index}]`;
      if (++count > PROJECT_PLAN_LIMITS.tasks) {
        review.error('plan.tasks', `A plan may contain at most ${PROJECT_PLAN_LIMITS.tasks} tasks, including all subtasks. Split the plan and import it in parts.`);
        return false;
      }
      if (frame.depth > PROJECT_PLAN_LIMITS.taskDepth) {
        review.error(path, `Task nesting may be at most ${PROJECT_PLAN_LIMITS.taskDepth} levels (a top-level task is level 1). Move this subtask higher in the hierarchy.`);
        return false;
      }
      if (!isRecord(raw)) continue;
      if (seen.has(raw)) {
        review.error(path, 'A task object is reused or cyclic. Every subtask must have exactly one parent in the imported hierarchy.');
        return false;
      }
      seen.add(raw);
      if (Array.isArray(raw.subtasks) && raw.subtasks.length > 0) {
        stack.push({ list: raw.subtasks, index: 0, path: `${path}.subtasks`, depth: frame.depth + 1 });
      }
    }
  }
  return true;
}

/**
 * Validate one parsed plan and resolve it into the records FocusDesk would
 * create.
 *
 * Two passes, because a plan may express relationships by temporary id: the
 * first reads the structure (goal → projects → milestones) and claims every
 * id, the second reads the tasks, so a reference always resolves no matter
 * where in the file the record it names appears.
 *
 * `ok: false` means nothing may be written. `ok: true` comes with the resolved
 * plan and a preview of the exact hierarchy it describes.
 */
export function reviewProjectPlan(input: unknown, options: ProjectPlanOptions = {}): ProjectPlanReview {
  const review = new PlanReview(options);
  const fail = (): ProjectPlanReview => ({
    ok: false,
    errors: review.errors,
    warnings: review.warnings,
    counts: EMPTY_COUNTS,
  });

  if (!isRecord(input)) {
    review.error('plan', 'A project plan must be a JSON object.');
    return fail();
  }

  /* -- envelope ---------------------------------------------------- */
  const format = input.format;
  if (format !== PROJECT_PLAN_FORMAT) {
    const looksLikeExport =
      Array.isArray(input.tasks) || Array.isArray(input.projects) || Array.isArray(input.learnings) || Array.isArray(input.milestones);
    if (looksLikeExport && typeof format !== 'string') {
      review.error(
        'plan.format',
        'That looks like a FocusDesk data export, not a project plan. A backup is restored with Settings → Data → Import (JSON); this importer takes a “focusdesk-project-plan”.',
      );
    } else {
      review.error(
        'plan.format',
        `“format” must be “${PROJECT_PLAN_FORMAT}” (found ${format === undefined ? 'nothing' : JSON.stringify(format)}).`,
      );
    }
    return fail();
  }
  if (input.version !== PROJECT_PLAN_VERSION) {
    review.error(
      'plan.version',
      `“version” must be the number ${PROJECT_PLAN_VERSION} (found ${input.version === undefined ? 'nothing' : JSON.stringify(input.version)}). This FocusDesk understands version ${PROJECT_PLAN_VERSION} only.`,
    );
    return fail();
  }
  review.unknownFields('plan', input, PROJECT_PLAN_FIELDS.plan, 'plan');
  if (input.milestones !== undefined && input.milestones !== null) {
    review.error(
      'plan.milestones',
      'A top-level “milestones” array is not part of a project plan — that key belongs to FocusDesk exports, where it means Learnings (a different feature). Milestones go inside a project (“projects[].milestones”) or in the top-level “projectMilestones” array.',
    );
  }
  const planName = review.optionalText('plan', input, 'name', 'plan');

  // Reject oversized structural arrays before allocating records for them.
  const rawProjects = review.array('plan.projects', input.projects, 'projects');
  const rawMilestones = review.array('plan.projectMilestones', input.projectMilestones, 'projectMilestones');
  if (rawProjects.length > PROJECT_PLAN_LIMITS.projects) {
    review.error('plan.projects', `A plan may contain at most ${PROJECT_PLAN_LIMITS.projects} projects (this one has ${rawProjects.length}).`);
    return fail();
  }
  const milestoneCount = rawProjects.reduce<number>((count, raw) =>
    count + (isRecord(raw) && Array.isArray(raw.milestones) ? raw.milestones.length : 0), rawMilestones.length);
  if (milestoneCount > PROJECT_PLAN_LIMITS.milestones) {
    review.error('plan.projectMilestones', `A plan may contain at most ${PROJECT_PLAN_LIMITS.milestones} project milestones (this one has ${milestoneCount}).`);
    return fail();
  }

  /* -- goal -------------------------------------------------------- */
  const goals: PendingGoal[] = [];
  let goalTempId: string | undefined;
  if (input.goal !== undefined && input.goal !== null) {
    const goal = input.goal;
    if (!isRecord(goal)) {
      review.error('plan.goal', '“goal” must be a JSON object.');
    } else {
      review.unknownFields('plan.goal', goal, PROJECT_PLAN_FIELDS.goal, 'goal');
      const name = review.required('plan.goal', goal, 'name', 'goal');
      const tempId = review.tempId('plan.goal', goal.id, 'goal');
      if (name !== undefined && tempId !== undefined) {
        goalTempId = tempId;
        goals.push({
          tempId,
          name,
          description: review.optionalText('plan.goal', goal, 'description', 'goal'),
          deadline: review.date('plan.goal', goal, 'deadline', 'goal'),
          status: review.enumeration<GoalStatus>('plan.goal', goal, 'status', PROJECT_PLAN_GOAL_STATUSES, 'goal', 'active'),
        });
      }
    }
  }

  /* -- pass 1a: the projects, claiming every project id first ------- */
  const projects: PendingProject[] = [];
  const milestones: PendingProjectMilestone[] = [];
  /** temporary milestone id → temporary id of the project that owns it. */
  const milestoneProjects = new Map<string, string>();
  /** Task blocks in document order, read in pass 2. */
  const groups: TaskGroup[] = [];
  /** The projects again, with their raw JSON, for pass 1b. */
  const projectDrafts: { path: string; raw: Rec; tempId: string }[] = [];

  for (const [index, raw] of rawProjects.entries()) {
    const path = `projects[${index}]`;
    if (!isRecord(raw)) {
      review.error(path, 'A project must be a JSON object.');
      continue;
    }
    review.unknownFields(path, raw, PROJECT_PLAN_FIELDS.project, 'project');
    const name = review.required(path, raw, 'name', 'project');
    const tempId = review.tempId(path, raw.id, `p${index}`);
    if (name === undefined || tempId === undefined) continue;

    projects.push({
      tempId,
      goalTempId,
      name,
      description: review.optionalText(path, raw, 'description', 'project'),
      deadline: review.date(path, raw, 'deadline', 'project'),
      status: review.enumeration<ProjectStatus>(path, raw, 'status', PROJECT_PLAN_PROJECT_STATUSES, 'project', 'active'),
    });
    projectDrafts.push({ path, raw, tempId });
  }

  /* -- pass 1b: every milestone, now that every project id is known -- */
  // A milestone may name a project that appears later in the file, so all the
  // project ids are claimed before any reference is resolved.
  for (const draft of projectDrafts) {
    for (const [mIndex, rawMilestone] of review.array(`${draft.path}.milestones`, draft.raw.milestones, 'milestones').entries()) {
      const mPath = `${draft.path}.milestones[${mIndex}]`;
      const milestone = readMilestone(review, rawMilestone, mPath, draft.tempId, milestones.length, milestoneProjects);
      if (!milestone) continue;
      milestones.push(milestone);
      groups.push({
        path: `${mPath}.tasks`,
        projectTempId: draft.tempId,
        milestoneTempId: milestone.tempId,
        raw: review.array(`${mPath}.tasks`, isRecord(rawMilestone) ? rawMilestone.tasks : undefined, 'tasks'),
      });
    }
    groups.push({
      path: `${draft.path}.tasks`,
      projectTempId: draft.tempId,
      raw: review.array(`${draft.path}.tasks`, draft.raw.tasks, 'tasks'),
    });
  }

  for (const [index, raw] of rawMilestones.entries()) {
    const path = `projectMilestones[${index}]`;
    const milestone = readMilestone(review, raw, path, undefined, milestones.length, milestoneProjects);
    if (!milestone) continue;
    milestones.push(milestone);
    groups.push({
      path: `${path}.tasks`,
      projectTempId: milestone.projectTempId,
      milestoneTempId: milestone.tempId,
      raw: review.array(`${path}.tasks`, isRecord(raw) ? raw.tasks : undefined, 'tasks'),
    });
  }

  /* -- positions: the JSON order, and nothing else ------------------ */
  const nextPosition = new Map<string, number>();
  for (const milestone of milestones) {
    const position = nextPosition.get(milestone.projectTempId) ?? 0;
    nextPosition.set(milestone.projectTempId, position + 1);
    milestone.position = position;
  }

  /* -- pass 2: tasks, now that every structural id is known --------- */
  const rootGroup = { path: 'tasks', raw: review.array('plan.tasks', input.tasks, 'tasks') };
  if (!checkTaskTreeLimits(review, [...groups, rootGroup])) return fail();
  const tasks: PendingTask[] = [];
  for (const group of groups) {
    group.raw.forEach((rawTask, index) => {
      readTask(review, rawTask, `${group.path}[${index}]`, {
        tasks,
        projectTempId: group.projectTempId,
        milestoneTempId: group.milestoneTempId,
        milestoneProjects,
      });
    });
  }
  rootGroup.raw.forEach((rawTask, index) => {
    readTask(review, rawTask, `tasks[${index}]`, { tasks, milestoneProjects, topLevel: true });
  });

  /* -- checks that need the whole tree ------------------------------ */
  for (const milestone of milestones) {
    if (!projects.some((p) => p.tempId === milestone.projectTempId)) {
      review.error(
        `projectMilestones “${milestone.name}”`,
        `Project milestone “${milestone.name}” belongs to project “${milestone.projectTempId}”, which is not in this plan.`,
      );
    }
  }
  for (const task of tasks) {
    if (task.projectTempId !== undefined && !projects.some((p) => p.tempId === task.projectTempId)) {
      review.error(`tasks “${task.title}”`, `Task “${task.title}” belongs to project “${task.projectTempId}”, which is not in this plan.`);
    }
  }

  if (projects.length > PROJECT_PLAN_LIMITS.projects) {
    review.error('plan.projects', `A plan may contain at most ${PROJECT_PLAN_LIMITS.projects} projects (this one has ${projects.length}).`);
  }
  if (milestones.length > PROJECT_PLAN_LIMITS.milestones) {
    review.error('plan.projectMilestones', `A plan may contain at most ${PROJECT_PLAN_LIMITS.milestones} project milestones (this one has ${milestones.length}).`);
  }
  if (tasks.length > PROJECT_PLAN_LIMITS.tasks) {
    review.error('plan.tasks', `A plan may contain at most ${PROJECT_PLAN_LIMITS.tasks} tasks (this one has ${tasks.length}). Split the plan and import it in parts.`);
  }
  if (projects.length === 0 && goals.length === 0 && milestones.length === 0 && tasks.length === 0) {
    review.error('plan', 'This plan would create nothing. Add a goal, a project or a task.');
  }
  if (options.mode === 'add-to-existing-project') {
    // Adding to an existing project accepts exactly one source project, so the
    // mapping from the plan to the target project is unambiguous.
    if (projects.length === 0) {
      review.error(
        'plan.projects',
        'Adding to an existing project needs exactly one project in the plan — this one has none. Everything in the plan is added to the project you choose.',
      );
    } else if (projects.length > 1) {
      review.error(
        'plan.projects',
        `Adding to an existing project accepts exactly one project in the plan — this one has ${projects.length}. Split the plan and import each project separately, or import it with “Create New Project”.`,
      );
    }
  }
  if (milestones.length > 0 && options.projectMilestonesAvailable === false) {
    review.error(
      'plan.projectMilestones',
      'This plan contains project milestones, but this database cannot store them yet: the migration supabase/migrations/008_project_milestones.sql has not been applied. Nothing was imported.',
    );
  }

  /* -- warnings ---------------------------------------------------- */
  const seenNames = new Map<string, number>();
  for (const project of projects) {
    const key = project.name.trim().toLowerCase();
    seenNames.set(key, (seenNames.get(key) ?? 0) + 1);
  }
  for (const [key, times] of seenNames) {
    if (times < 2) continue;
    const name = projects.find((p) => p.name.trim().toLowerCase() === key)?.name.trim() ?? key;
    review.warn('plan.projects', `“${name}” appears ${times} times — ${times} separate projects will be created.`);
  }
  // In add-to-existing-project mode the plan's goal is source metadata only
  // (the target project's goal is preserved), so this warning would mislead.
  if (projects.length > 0 && goals.length === 0 && options.mode !== 'add-to-existing-project') {
    review.warn('plan.goal', 'This plan has no goal — its projects will be created without one.');
  }
  if (projects.some((p) => !tasks.some((t) => t.projectTempId === p.tempId) && !milestones.some((m) => m.projectTempId === p.tempId))) {
    review.warn('plan.projects', 'A project in this plan has no milestones and no tasks.');
  }
  if (tasks.some((t) => t.projectTempId !== undefined && t.projectMilestoneTempId === undefined)) {
    review.warn('plan.tasks', 'Some tasks sit directly in their project, with no milestone.');
  }

  if (review.errors.length > 0) return fail();

  const plan: ResolvedProjectPlan = { goals, projects, projectMilestones: milestones, tasks };
  for (const problem of findProjectPlanProblems(plan)) review.error('plan', problem);
  if (review.errors.length > 0) return fail();
  return {
    ok: true,
    errors: [],
    warnings: review.warnings,
    counts: {
      goals: goals.length,
      projects: projects.length,
      projectMilestones: milestones.length,
      tasks: tasks.length,
      ...pendingTaskCounts(tasks),
    },
    plan,
    preview: previewOf(plan, planName),
  };
}

/* ------------------------------------------------------------------ */
/* Parsing text                                                        */
/* ------------------------------------------------------------------ */

/** Remove a ```json … ``` wrapper, if the plan arrived in one. */
export function stripCodeFence(input: string): string {
  const trimmed = input.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Parse pasted or uploaded JSON and review it in one step.
 *
 * A JSON syntax error is reported with its position, and a plan wrapped in
 * Markdown fences (which ChatGPT adds despite being told not to) is unwrapped
 * first — that is a formatting accident, not an ambiguous plan.
 */
export function reviewProjectPlanText(rawText: string, options: ProjectPlanOptions = {}): ProjectPlanReview {
  if (rawText.length > PROJECT_PLAN_LIMITS.bytes || new TextEncoder().encode(rawText).byteLength > PROJECT_PLAN_LIMITS.bytes) {
    return {
      ok: false,
      errors: [{ path: 'plan', message: 'A project plan may be at most 5 MiB of UTF-8 JSON. Split the plan and import it in parts.' }],
      warnings: [],
      counts: EMPTY_COUNTS,
    };
  }
  const source = stripCodeFence(rawText);
  if (source === '') {
    return { ok: false, errors: [{ path: 'plan', message: 'Paste a project plan first.' }], warnings: [], counts: EMPTY_COUNTS };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return {
      ok: false,
      errors: [{ path: 'plan', message: `That is not valid JSON — ${error instanceof Error ? error.message : 'it could not be parsed'}.` }],
      warnings: [],
      counts: EMPTY_COUNTS,
    };
  }
  return reviewProjectPlan(parsed, options);
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */

const previewTask = (task: PendingTask): PreviewTask => ({
  tempId: task.tempId,
  title: task.title,
  description: task.description,
  estimatedDuration: task.estimatedDuration,
  subtasks: [],
  status: task.status,
  priority: task.priority,
  scheduledDate: task.scheduledDate,
  dueDate: task.dueDate,
});

/** Roots and descendants are counted separately; `tasks` remains the total. */
function pendingTaskCounts(tasks: PendingTask[]): { parentTasks: number; subtasks: number } {
  const subtasks = tasks.filter((t) => t.parentTaskTempId !== undefined).length;
  return { parentTasks: tasks.length - subtasks, subtasks };
}

/** Reconstitute the preview tree from the same parent references we persist. */
function previewTaskMap(tasks: PendingTask[]): Map<string, PreviewTask> {
  const nodes = new Map(tasks.map((task) => [task.tempId, previewTask(task)]));
  for (const task of tasks) {
    if (task.parentTaskTempId !== undefined) {
      nodes.get(task.parentTaskTempId)?.subtasks.push(nodes.get(task.tempId)!);
    }
  }
  return nodes;
}

/** Total full tasks in preview branches, not just the immediate roots. */
export function countPreviewTasks(tasks: PreviewTask[]): number {
  return tasks.reduce((total, task) => total + 1 + countPreviewTasks(task.subtasks), 0);
}

/**
 * The hierarchy exactly as it will be created — built from the *resolved*
 * plan, not from the raw JSON, so the preview cannot disagree with the write.
 */
export function previewOf(plan: ResolvedProjectPlan, planName?: string): ProjectPlanPreview {
  const goal = plan.goals[0];
  const taskNodes = previewTaskMap(plan.tasks);
  const roots = plan.tasks.filter((task) => task.parentTaskTempId === undefined);
  const node = (task: PendingTask) => taskNodes.get(task.tempId)!;
  const projects = plan.projects.map((project) => {
    const own = plan.projectMilestones.filter((m) => m.projectTempId === project.tempId).sort((a, b) => a.position - b.position);
    const ownIds = new Set(own.map((m) => m.tempId));
    return {
      name: project.name,
      status: project.status,
      deadline: project.deadline,
      milestones: own.map((milestone) => ({
        name: milestone.name,
        position: milestone.position,
        targetDate: milestone.targetDate,
        tasks: roots.filter((t) => t.projectMilestoneTempId === milestone.tempId).map(node),
      })),
      tasks: roots
        .filter((t) => t.projectTempId === project.tempId && (t.projectMilestoneTempId === undefined || !ownIds.has(t.projectMilestoneTempId)))
        .map(node),
    };
  });
  return {
    planName,
    goal: goal ? { name: goal.name, status: goal.status, deadline: goal.deadline } : undefined,
    projects,
    tasks: roots.filter((t) => t.projectTempId === undefined).map(node),
    counts: {
      goals: plan.goals.length,
      projects: plan.projects.length,
      projectMilestones: plan.projectMilestones.length,
      tasks: plan.tasks.length,
      ...pendingTaskCounts(plan.tasks),
    },
  };
}

interface TreeNode {
  label: string;
  children: TreeNode[];
}

function renderTreeNodes(nodes: TreeNode[], depth: number, prefix: string, lines: string[]): void {
  nodes.forEach((node, index) => {
    const last = index === nodes.length - 1;
    // The outermost level is a list, not a branch — no connector there.
    const connector = depth === 0 ? '' : last ? '└── ' : '├── ';
    lines.push(`${prefix}${connector}${node.label}`);
    renderTreeNodes(node.children, depth + 1, depth === 0 ? '' : `${prefix}${last ? '    ' : '│   '}`, lines);
  });
}

/**
 * The hierarchy as an indented text tree — the shape the documentation quotes
 * and a compact way to see a large plan at once.
 */
export function projectPlanTreeLines(preview: ProjectPlanPreview): string[] {
  const taskLabel = (task: PreviewTask) =>
    `${task.title}${task.dueDate ? ` · due ${task.dueDate}` : task.scheduledDate ? ` · scheduled ${task.scheduledDate}` : ''}`;

  const taskNode = (task: PreviewTask): TreeNode => ({ label: taskLabel(task), children: task.subtasks.map(taskNode) });
  const projectNode = (project: PreviewProject): TreeNode => ({
    label: `${project.name}${project.deadline ? ` · deadline ${project.deadline}` : ''}`,
    children: [
      ...project.milestones.map((milestone) => ({
        label: `${milestone.name}${milestone.targetDate ? ` · target ${milestone.targetDate}` : ''} — ${countPreviewTasks(milestone.tasks)} ${countPreviewTasks(milestone.tasks) === 1 ? 'task' : 'tasks'}`,
        children: milestone.tasks.map(taskNode),
      })),
      ...project.tasks.map(taskNode),
    ],
  });

  const lines: string[] = [];
  const projects = preview.projects.map(projectNode);
  if (preview.goal) {
    lines.push(`Goal: ${preview.goal.name}${preview.goal.deadline ? ` · deadline ${preview.goal.deadline}` : ''}`);
    renderTreeNodes(projects, 1, '', lines);
  } else {
    renderTreeNodes(projects, 0, '', lines);
  }
  if (preview.tasks.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Tasks without a project');
    renderTreeNodes(preview.tasks.map(taskNode), 1, '', lines);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Duplicates                                                          */
/* ------------------------------------------------------------------ */

export interface ProjectPlanNameClash {
  name: string;
  /** The id of the project that already exists — an import never touches it. */
  existingId: ID;
}

/**
 * Projects of the plan whose name (trimmed, case-insensitive) already exists.
 *
 * Reported so the user can decide; the importer never merges, renames or
 * updates the existing project. Phase 4 always imports as new.
 */
export function findProjectPlanNameClashes(plan: ResolvedProjectPlan, existing: Pick<Project, 'id' | 'name'>[]): ProjectPlanNameClash[] {
  const byName = new Map(existing.map((project) => [project.name.trim().toLowerCase(), project.id]));
  const clashes: ProjectPlanNameClash[] = [];
  for (const project of plan.projects) {
    // Compared the way the record will be stored: trimmed, case-insensitive.
    const name = project.name.trim();
    const existingId = byName.get(name.toLowerCase());
    if (existingId !== undefined && !clashes.some((c) => c.name === name)) {
      clashes.push({ name, existingId });
    }
  }
  return clashes;
}

/* ------------------------------------------------------------------ */
/* Integrity                                                           */
/* ------------------------------------------------------------------ */

/** Validate task fields AND parent chains again at the repository boundary. */
function findPendingTaskProblems(tasks: PendingTask[]): string[] {
  const problems: string[] = [];
  if (tasks.length > PROJECT_PLAN_LIMITS.tasks) {
    problems.push(`A plan may contain at most ${PROJECT_PLAN_LIMITS.tasks} tasks, including all subtasks.`);
  }
  const byId = new Map(tasks.map((task) => [task.tempId, task]));
  for (const task of tasks) {
    if (!text(task.tempId) || task.tempId.length > 64) problems.push('Every task needs a temporary id of 1–64 characters.');
    if (!text(task.title)) problems.push('Every task and subtask needs a non-blank title.');
    if (!Object.prototype.hasOwnProperty.call(PROJECT_PLAN_TASK_STATUSES, task.status)) {
      problems.push(`Task “${task.title}” has an unsupported status.`);
    }
    if (!Object.prototype.hasOwnProperty.call(PROJECT_PLAN_TASK_PRIORITIES, task.priority)) {
      problems.push(`Task “${task.title}” has an unsupported priority.`);
    }
    for (const field of ['scheduledDate', 'dueDate'] as const) {
      if (task[field] !== undefined && !isValidPlanDate(task[field])) problems.push(`Task “${task.title}” has an invalid ${field}; use a real YYYY-MM-DD calendar date.`);
    }
    for (const field of ['description', 'notes'] as const) {
      if (task[field] !== undefined && !text(task[field])) problems.push(`“${field}” of task “${task.title}” must be a non-empty string.`);
    }
    if (task.estimatedDuration !== undefined && (!Number.isInteger(task.estimatedDuration) || task.estimatedDuration < 1)) {
      problems.push(`“estimatedDuration” of task “${task.title}” must be a whole number of minutes, 1 or more.`);
    }
    if (!Array.isArray(task.tags) || task.tags.some((tag) => !text(tag))) problems.push(`Task “${task.title}” needs an array of non-empty string tags.`);
    if (task.parentTaskTempId === undefined) continue;
    const parent = byId.get(task.parentTaskTempId);
    if (!parent) {
      problems.push(`Subtask “${task.title}” refers to a parent task that is not in this imported hierarchy.`);
      continue;
    }
    if (parent.projectTempId !== task.projectTempId) problems.push(`Subtask “${task.title}” is not in the same project as its parent task.`);
    if (parent.projectMilestoneTempId !== task.projectMilestoneTempId) problems.push(`Subtask “${task.title}” does not keep its parent task’s milestone.`);
    const chain = new Set<string>();
    let current: PendingTask | undefined = task;
    while (current) {
      if (chain.has(current.tempId)) {
        problems.push(`Task “${task.title}” has a cyclic parent chain.`);
        break;
      }
      chain.add(current.tempId);
      if (chain.size > PROJECT_PLAN_LIMITS.taskDepth) {
        problems.push(`Task nesting may be at most ${PROJECT_PLAN_LIMITS.taskDepth} levels (a top-level task is level 1).`);
        break;
      }
      current = current.parentTaskTempId === undefined ? undefined : byId.get(current.parentTaskTempId);
    }
  }
  return problems;
}

/** Stable preorder, including for a valid but unordered hand-built resolved plan. */
function parentFirstTasks(tasks: PendingTask[]): PendingTask[] {
  const children = new Map<string, PendingTask[]>();
  for (const task of tasks) {
    if (task.parentTaskTempId === undefined) continue;
    const siblings = children.get(task.parentTaskTempId) ?? [];
    siblings.push(task);
    children.set(task.parentTaskTempId, siblings);
  }
  const ordered: PendingTask[] = [];
  const walk = (task: PendingTask) => {
    ordered.push(task);
    for (const child of children.get(task.tempId) ?? []) walk(child);
  };
  for (const task of tasks) if (task.parentTaskTempId === undefined) walk(task);
  return ordered;
}

/**
 * The consistency the repository guarantees for an export, checked on a
 * resolved plan: every milestone has its project, every task's milestone
 * belongs to the task's own project, and no two records share a temporary id.
 *
 * `reviewProjectPlan` cannot produce a plan that fails this. It exists so a
 * repository refuses a plan handed to it directly, and so the guarantee is
 * proved rather than assumed.
 */
export function findProjectPlanProblems(plan: ResolvedProjectPlan): string[] {
  const problems = findPendingTaskProblems(plan.tasks);
  if (plan.projects.length > PROJECT_PLAN_LIMITS.projects) problems.push(`A plan may contain at most ${PROJECT_PLAN_LIMITS.projects} projects.`);
  if (plan.projectMilestones.length > PROJECT_PLAN_LIMITS.milestones) problems.push(`A plan may contain at most ${PROJECT_PLAN_LIMITS.milestones} project milestones.`);
  const goalIds = new Set(plan.goals.map((g) => g.tempId));
  for (const project of plan.projects) {
    if (project.goalTempId !== undefined && !goalIds.has(project.goalTempId)) problems.push(`Project “${project.name}” refers to a goal that is not in the plan.`);
  }
  const projectIds = new Set(plan.projects.map((p) => p.tempId));
  const milestones = new Map(plan.projectMilestones.map((m) => [m.tempId, m]));
  for (const milestone of plan.projectMilestones) {
    if (!projectIds.has(milestone.projectTempId)) {
      problems.push(`Project milestone “${milestone.name}” belongs to a project that is not in the plan.`);
    }
  }
  for (const task of plan.tasks) {
    if (task.projectTempId !== undefined && !projectIds.has(task.projectTempId)) {
      problems.push(`Task “${task.title}” belongs to a project that is not in the plan.`);
    }
    if (task.projectMilestoneTempId === undefined) continue;
    const milestone = milestones.get(task.projectMilestoneTempId);
    if (!milestone) problems.push(`Task “${task.title}” refers to a project milestone that is not in the plan.`);
    else if (milestone.projectTempId !== task.projectTempId) {
      problems.push(`Task “${task.title}” is not in the same project as its milestone “${milestone.name}”.`);
    }
  }
  const seen = new Set<string>();
  for (const record of [...plan.goals, ...plan.projects, ...plan.projectMilestones, ...plan.tasks]) {
    if (seen.has(record.tempId)) problems.push(`Two records share the temporary id “${record.tempId}”.`);
    seen.add(record.tempId);
  }
  return problems;
}

/** Throw one readable error if a resolved plan is inconsistent. */
export function assertProjectPlanConsistent(plan: ResolvedProjectPlan): void {
  const problems = findProjectPlanProblems(plan);
  if (problems.length === 0) return;
  const shown = problems.slice(0, 3).join(' ');
  const more = problems.length > 3 ? ` (and ${problems.length - 3} more)` : '';
  throw new ProjectPlanError(`Import refused — nothing was created. ${shown}${more}`);
}

/* ------------------------------------------------------------------ */
/* Turning a resolved plan into records                                */
/* ------------------------------------------------------------------ */

/**
 * Where the real ids come from. Both repositories pass their own generator
 * (`createId` for local storage, `uuid` for Supabase), so an imported record
 * gets its id exactly the way a record created through the UI does — a plan
 * can never choose one.
 */
export interface ProjectPlanIdSource {
  newId: () => string;
  /** One timestamp for the whole import, so its records share a creation time. */
  now: () => string;
}

export interface BuiltProjectPlan extends ProjectPlanImportResult {
  /** temporary id → the real FocusDesk id that replaced it. */
  idOf: Map<string, ID>;
}

/**
 * Build the records an import would create — complete, with real ids and every
 * reference rewritten through the temporary-id map.
 *
 * The two repositories share this so a plan produces byte-identical records on
 * either backend: the same trimming, the same defaults (`created` / `medium` /
 * active), `postponementCount: 0`, `archived: false`, and `completedAt` only
 * for a task the plan already marked completed.
 *
 * Pure: it writes nothing. The caller decides how the records reach storage.
 */
export function buildProjectPlanRecords(plan: ResolvedProjectPlan, ids: ProjectPlanIdSource): BuiltProjectPlan {
  assertProjectPlanConsistent(plan);

  const idOf = new Map<string, ID>();
  const real = (tempId: string): ID => {
    const existing = idOf.get(tempId);
    if (existing !== undefined) return existing;
    const id = ids.newId();
    idOf.set(tempId, id);
    return id;
  };
  const createdAt = ids.now();

  const goals: Goal[] = plan.goals.map((goal) => ({
    id: real(goal.tempId),
    name: goal.name.trim(),
    description: goal.description?.trim() || undefined,
    deadline: goal.deadline,
    status: goal.status,
    createdAt,
  }));

  const projects: Project[] = plan.projects.map((project) => ({
    id: real(project.tempId),
    name: project.name.trim(),
    description: project.description?.trim() || undefined,
    goalId: project.goalTempId ? real(project.goalTempId) : undefined,
    deadline: project.deadline,
    status: project.status,
    createdAt,
  }));

  const projectMilestones: ProjectMilestone[] = plan.projectMilestones.map((milestone) => ({
    id: real(milestone.tempId),
    projectId: real(milestone.projectTempId),
    name: milestone.name.trim(),
    description: milestone.description?.trim() || undefined,
    targetDate: milestone.targetDate,
    position: milestone.position,
    createdAt,
  }));

  const tasks: Task[] = parentFirstTasks(plan.tasks).map((task) => ({
    id: real(task.tempId),
    title: task.title.trim(),
    description: task.description?.trim() || undefined,
    status: task.status,
    priority: task.priority,
    projectId: task.projectTempId ? real(task.projectTempId) : undefined,
    projectMilestoneId: task.projectMilestoneTempId ? real(task.projectMilestoneTempId) : undefined,
    goalId: undefined,
    parentTaskId: task.parentTaskTempId ? real(task.parentTaskTempId) : undefined,
    createdAt,
    scheduledDate: task.scheduledDate,
    dueDate: task.dueDate,
    completedAt: task.status === 'completed' ? createdAt : undefined,
    estimatedDuration: task.estimatedDuration,
    reminder: undefined,
    notes: task.notes?.trim() || undefined,
    tags: [...task.tags],
    postponementCount: 0,
    archived: false,
  }));

  // The same invariant the rest of the app enforces, on the records that are
  // about to be written: a task's milestone belongs to the task's project.
  assertProjectMilestonesConsistent({ projects, projectMilestones, tasks });

  return { goals, projects, projectMilestones, tasks, idOf };
}

/* ------------------------------------------------------------------ */
/* Telling a plan from a backup                                        */
/* ------------------------------------------------------------------ */

/**
 * Is this parsed JSON a project plan (rather than a FocusDesk data export)?
 *
 * Both are JSON with projects and tasks in them, and they do opposite things:
 * a plan *adds* records, an export *replaces* the database. Feeding one to the
 * other is the only genuinely destructive mistake this feature could invite,
 * so each entry point recognises the other's payload and refuses it with a
 * message that says where to go instead.
 */
export function isProjectPlanPayload(value: unknown): boolean {
  return isRecord(value) && value.format === PROJECT_PLAN_FORMAT;
}

/* ------------------------------------------------------------------ */
/* Phase 5 — adding a plan to an existing project                      */
/* ------------------------------------------------------------------ */

/**
 * What an import does with a plan.
 *
 *  - `create-new-project` — the Phase 4 behavior: the plan's goal, projects,
 *    project milestones and tasks are created. Unchanged by Phase 5.
 *  - `add-to-existing-project` — the plan adds new project milestones and new
 *    tasks to ONE project that already exists. The target project, its goal
 *    relationship, its existing milestones and every existing task are never
 *    modified; the plan's goal and project are source metadata only and are
 *    never created.
 */
export type ProjectPlanImportMode = 'create-new-project' | 'add-to-existing-project';

/** What happens to one imported milestone. */
export type ProjectMilestoneMappingDecision = 'use-existing' | 'create-new';

/**
 * The user's choice for one imported milestone: the id of an existing
 * milestone of the target project to reuse, or `'create-new'`.
 */
export type ProjectMilestoneMappingChoice = ID | 'create-new';

/**
 * Normalization for milestone matching — deliberately conservative and
 * deterministic: trim, collapse runs of whitespace to one space, lowercase.
 * `"SEO"`, `" seo "` and `"Seo"` match; `"SEO"` and `"SEO Optimization"` never
 * do. There is no fuzzy, semantic or AI matching anywhere in the importer.
 */
export function normalizeProjectMilestoneName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** One imported milestone and what will happen to it. */
export interface ProjectMilestoneMapping {
  /** The imported milestone's temporary id. */
  tempId: string;
  name: string;
  /** The normalized name matching runs against (never shown). */
  normalizedName: string;
  description?: string;
  targetDate?: ISODate;
  /** Order within the plan's milestones (the JSON order). */
  position: number;
  /** Existing milestones of the target project with the same normalized name, in position order. */
  matches: Pick<ProjectMilestone, 'id' | 'name' | 'position'>[];
  /** The existing milestone that will be reused — set when the decision is use-existing. */
  existingMilestoneId?: ID;
  decision: ProjectMilestoneMappingDecision;
  /** Imported tasks nested under this milestone. */
  taskCount: number;
}

/**
 * Match every imported milestone of the plan's single source project against
 * the milestones that already belong to the target project.
 *
 * The default decision is deterministic: an exact normalized-name match
 * recommends `use-existing` (the first match in position order when several
 * existing milestones share a name); anything else is `create-new`. The user
 * can override every row — see `resolveExistingProjectImport`. Matching never
 * modifies an existing milestone; at most its id is reused as the parent of
 * newly imported tasks.
 */
export function planProjectMilestoneMappings(
  plan: ResolvedProjectPlan,
  targetProjectId: ID,
  existingMilestones: Pick<ProjectMilestone, 'id' | 'projectId' | 'name' | 'position'>[],
): ProjectMilestoneMapping[] {
  const source = plan.projects[0];
  const own = existingMilestones
    .filter((m) => m.projectId === targetProjectId)
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byName = new Map<string, Pick<ProjectMilestone, 'id' | 'name' | 'position'>[]>();
  for (const milestone of own) {
    const key = normalizeProjectMilestoneName(milestone.name);
    const list = byName.get(key) ?? [];
    list.push(milestone);
    byName.set(key, list);
  }
  const imported = plan.projectMilestones
    .filter((m) => source === undefined || m.projectTempId === source.tempId)
    .sort((a, b) => a.position - b.position);
  return imported.map((milestone) => {
    const key = normalizeProjectMilestoneName(milestone.name);
    const matches = byName.get(key) ?? [];
    return {
      tempId: milestone.tempId,
      name: milestone.name,
      normalizedName: key,
      description: milestone.description,
      targetDate: milestone.targetDate,
      position: milestone.position,
      matches,
      existingMilestoneId: matches.length > 0 ? matches[0].id : undefined,
      decision: (matches.length > 0 ? 'use-existing' : 'create-new') as ProjectMilestoneMappingDecision,
      taskCount: plan.tasks.filter((t) => t.projectMilestoneTempId === milestone.tempId).length,
    };
  });
}

/** Counts the preview and the result screen show. */
export interface ExistingProjectImportCounts {
  /** Milestones that will be created. */
  newMilestones: number;
  /** Existing milestones that will be reused (never modified). */
  reusedMilestones: number;
  /** All new tasks under a milestone, including descendants. */
  milestoneTasks: number;
  /** All tasks in the source project's milestone-free branches, including descendants. */
  projectLevelTasks: number;
  /** All tasks in standalone source branches, including descendants; they join the target project. */
  rootTasks: number;
  /** All new tasks. */
  newTasks: number;
  parentTasks: number;
  subtasks: number;
}

/**
 * A validated plan resolved against one existing project — the Phase 5 write
 * input. Built by `resolveExistingProjectImport`, written by
 * `AppRepository.importProjectPlanIntoExistingProject`.
 *
 * `targetProject` is the project the plan is added to. `sourceProject` and
 * `sourceGoal` are the plan's own records, kept as metadata for the preview —
 * neither is ever created or applied.
 */
export interface ResolvedExistingProjectImport {
  mode: 'add-to-existing-project';
  targetProject: Project;
  sourceProject: PendingProject;
  sourceGoal?: PendingGoal;
  planName?: string;
  mappings: ProjectMilestoneMapping[];
  /**
   * Every imported task, exactly as the plan placed it. The builder binds them
   * all to the target project: a task under a milestone keeps that milestone
   * (through its mapping), everything else becomes a project-level task
   * (projectId set, projectMilestoneId null) — including the plan's top-level
   * tasks.
   */
  tasks: PendingTask[];
  /** First position after the target project's existing milestones (at preview time). */
  positionBase: number;
  counts: ExistingProjectImportCounts;
  /** How much already exists in the target project — shown as "unchanged". */
  existing: { milestones: number; tasks: number };
}

/** What a repository hands back after a successful add-to-existing import. */
export interface ExistingProjectPlanImportResult {
  projectMilestones: ProjectMilestone[];
  tasks: Task[];
}

/**
 * Resolve a validated plan against the target project — the step between
 * validation and the write. Pure: it reads nothing and writes nothing.
 *
 * `choices` overrides the default mapping decisions, keyed by the imported
 * milestone's temporary id: the id of an existing milestone to reuse (it must
 * be one of that milestone's normalized-name matches) or `'create-new'`.
 * Anything else is refused — a mapping can never point outside the target
 * project.
 */
export function resolveExistingProjectImport(
  review: ProjectPlanReview,
  targetProject: Project,
  existingMilestones: ProjectMilestone[],
  existingTasks: Pick<Task, 'id' | 'projectId'>[],
  choices: Readonly<Record<string, ProjectMilestoneMappingChoice>> = {},
): ResolvedExistingProjectImport {
  if (!review.ok || !review.plan) {
    throw new ProjectPlanError('The plan is not valid — nothing can be added to a project.');
  }
  const plan = review.plan;
  if (plan.projects.length !== 1) {
    throw new ProjectPlanError('Adding to an existing project accepts exactly one project in the plan.');
  }
  assertProjectPlanConsistent(plan);
  const sourceProject = plan.projects[0];
  const mappings = planProjectMilestoneMappings(plan, targetProject.id, existingMilestones);
  for (const mapping of mappings) {
    const choice = choices[mapping.tempId];
    if (choice === undefined) continue; // keep the default
    if (choice === 'create-new') {
      mapping.decision = 'create-new';
      mapping.existingMilestoneId = undefined;
    } else if (mapping.matches.some((m) => m.id === choice)) {
      mapping.decision = 'use-existing';
      mapping.existingMilestoneId = choice;
    } else {
      throw new ProjectPlanError(
        `Milestone “${mapping.name}” cannot be mapped to that existing milestone — it is not a name match in project “${targetProject.name}”.`,
      );
    }
  }

  const milestoneTasks = plan.tasks.filter((t) => t.projectMilestoneTempId !== undefined);
  const rootTasks = plan.tasks.filter((t) => t.projectTempId === undefined);
  const projectLevelTasks = plan.tasks.filter((t) => t.projectTempId !== undefined && t.projectMilestoneTempId === undefined);
  const ownExisting = existingMilestones.filter((m) => m.projectId === targetProject.id);

  return {
    mode: 'add-to-existing-project',
    targetProject,
    sourceProject,
    sourceGoal: plan.goals[0],
    planName: review.preview?.planName,
    mappings,
    tasks: plan.tasks,
    positionBase: nextProjectMilestonePosition(existingMilestones, targetProject.id),
    counts: {
      newMilestones: mappings.filter((m) => m.decision === 'create-new').length,
      reusedMilestones: mappings.filter((m) => m.decision === 'use-existing').length,
      milestoneTasks: milestoneTasks.length,
      projectLevelTasks: projectLevelTasks.length,
      rootTasks: rootTasks.length,
      newTasks: plan.tasks.length,
      ...pendingTaskCounts(plan.tasks),
    },
    existing: {
      milestones: ownExisting.length,
      tasks: existingTasks.filter((t) => t.projectId === targetProject.id).length,
    },
  };
}

/**
 * Non-fatal things the preview should say about a resolved add-to-existing
 * import. Deterministic observations only — never a reason to write less or
 * more than the user confirmed.
 */
export function findExistingProjectImportWarnings(resolved: ResolvedExistingProjectImport): string[] {
  const warnings: string[] = [];
  const chosen = new Map<ID, { name: string; existingName?: string }[]>();
  for (const mapping of resolved.mappings) {
    if (mapping.decision !== 'use-existing' || mapping.existingMilestoneId === undefined) continue;
    const list = chosen.get(mapping.existingMilestoneId) ?? [];
    list.push({ name: mapping.name, existingName: mapping.matches.find((m) => m.id === mapping.existingMilestoneId)?.name });
    chosen.set(mapping.existingMilestoneId, list);
  }
  for (const [id, list] of chosen) {
    if (list.length < 2) continue;
    warnings.push(
      `The imported milestones ${list.map((m) => `“${m.name}”`).join(' and ')} both use the existing milestone “${
        list[0].existingName ?? id
      }” — their tasks will share it. Choose “Create new milestone” for one of them if that is not what you want.`,
    );
  }
  return warnings;
}

/**
 * Integrity problems that make a resolved add-to-existing import unsafe to
 * write. `reviewProjectPlan` + `resolveExistingProjectImport` cannot produce
 * one that fails this; it exists so a repository refuses a hand-built import,
 * exactly like `findProjectPlanProblems` does for Phase 4.
 */
export function findExistingProjectImportProblems(
  resolved: ResolvedExistingProjectImport,
  existingMilestones: Pick<ProjectMilestone, 'id' | 'projectId' | 'name' | 'position'>[],
): string[] {
  const problems = findPendingTaskProblems(resolved.tasks);
  if (resolved.mappings.length > PROJECT_PLAN_LIMITS.milestones) problems.push(`A plan may contain at most ${PROJECT_PLAN_LIMITS.milestones} project milestones.`);
  const ownExisting = new Map(existingMilestones.filter((m) => m.projectId === resolved.targetProject.id).map((m) => [m.id, m]));
  const recordIds = new Set([resolved.sourceProject.tempId]);
  if (resolved.sourceGoal) {
    if (recordIds.has(resolved.sourceGoal.tempId)) problems.push('The source goal shares a temporary id with the source project.');
    recordIds.add(resolved.sourceGoal.tempId);
  }
  const mappingIds = new Set<string>();
  for (const mapping of resolved.mappings) {
    if (recordIds.has(mapping.tempId)) problems.push(`Two imported records share the temporary id “${mapping.tempId}”.`);
    recordIds.add(mapping.tempId);
    mappingIds.add(mapping.tempId);
    if (mapping.decision !== 'use-existing' && mapping.decision !== 'create-new') problems.push(`Milestone “${mapping.name}” has an unsupported mapping decision.`);
    if (mapping.decision === 'use-existing') {
      if (mapping.existingMilestoneId === undefined) {
        problems.push(`The imported milestone “${mapping.name}” is mapped to an existing milestone but names none.`);
      } else if (!ownExisting.has(mapping.existingMilestoneId)) {
        problems.push(
          `The imported milestone “${mapping.name}” is mapped to milestone “${mapping.existingMilestoneId}”, which does not belong to project “${resolved.targetProject.name}”.`,
        );
      } else if (normalizeProjectMilestoneName(ownExisting.get(mapping.existingMilestoneId)!.name) !== normalizeProjectMilestoneName(mapping.name)) {
        problems.push(`Milestone “${mapping.name}” is no longer an exact normalized-name match in the target project. Review the mapping again.`);
      }
    } else if (mapping.existingMilestoneId !== undefined) {
      problems.push(`The imported milestone “${mapping.name}” will be created new but still names an existing milestone.`);
    }
  }
  for (const task of resolved.tasks) {
    if (recordIds.has(task.tempId)) problems.push(`Two imported records share the temporary id “${task.tempId}”.`);
    recordIds.add(task.tempId);
    if (task.projectTempId !== undefined && task.projectTempId !== resolved.sourceProject.tempId) {
      problems.push(`Task “${task.title}” belongs to a project that is not in the source plan.`);
    }
    if (task.projectMilestoneTempId !== undefined && task.projectTempId !== resolved.sourceProject.tempId) {
      problems.push(`Task “${task.title}” needs the source project for its milestone.`);
    }
    if (task.projectMilestoneTempId !== undefined && !mappingIds.has(task.projectMilestoneTempId)) {
      problems.push(`Task “${task.title}” refers to a project milestone that is not in the plan.`);
    }
  }
  return problems;
}

/** Throw one readable error if a resolved add-to-existing import is inconsistent. */
export function assertExistingProjectImportConsistent(
  resolved: ResolvedExistingProjectImport,
  existingMilestones: Pick<ProjectMilestone, 'id' | 'projectId' | 'name' | 'position'>[],
): void {
  const problems = findExistingProjectImportProblems(resolved, existingMilestones);
  if (problems.length === 0) return;
  const shown = problems.slice(0, 3).join(' ');
  const more = problems.length > 3 ? ` (and ${problems.length - 3} more)` : '';
  throw new ProjectPlanError(`Import refused — nothing was created. ${shown}${more}`);
}

export interface BuiltExistingProjectPlan extends ExistingProjectPlanImportResult {
  /** temporary id → the real FocusDesk id that replaced it. */
  idOf: Map<string, ID>;
}

/**
 * Build the records an add-to-existing import creates — new project milestones
 * and new tasks, and nothing else. Pure: it writes nothing.
 *
 * The temporary-id map is seeded before anything is minted: the source
 * project's temporary id maps to the TARGET project's real id (the plan's
 * project is never created), and every milestone mapped to an existing one
 * maps to that milestone's real id. New milestones get fresh ids and positions
 * after the target project's existing milestones, in the imported order —
 * existing milestones are never renumbered. Every task is bound to the target
 * project; the plan's top-level tasks included.
 */
export function buildExistingProjectPlanRecords(
  resolved: ResolvedExistingProjectImport,
  ids: ProjectPlanIdSource,
  existingMilestones: ProjectMilestone[],
): BuiltExistingProjectPlan {
  assertExistingProjectImportConsistent(resolved, existingMilestones);

  const idOf = new Map<string, ID>();
  idOf.set(resolved.sourceProject.tempId, resolved.targetProject.id);
  for (const mapping of resolved.mappings) {
    if (mapping.decision === 'use-existing' && mapping.existingMilestoneId !== undefined) {
      idOf.set(mapping.tempId, mapping.existingMilestoneId);
    }
  }
  const real = (tempId: string): ID => {
    const existing = idOf.get(tempId);
    if (existing !== undefined) return existing;
    const id = ids.newId();
    idOf.set(tempId, id);
    return id;
  };
  const createdAt = ids.now();

  // Recomputed from the milestones that exist NOW, so a milestone added by
  // another tab between preview and import cannot cause a position clash.
  const base = nextProjectMilestonePosition(existingMilestones, resolved.targetProject.id);
  const projectMilestones: ProjectMilestone[] = [];
  let nextPosition = base;
  for (const mapping of resolved.mappings) {
    if (mapping.decision !== 'create-new') continue;
    projectMilestones.push({
      id: real(mapping.tempId),
      projectId: resolved.targetProject.id,
      name: mapping.name.trim(),
      description: mapping.description?.trim() || undefined,
      targetDate: mapping.targetDate,
      position: nextPosition,
      createdAt,
    });
    nextPosition += 1;
  }

  const tasks: Task[] = parentFirstTasks(resolved.tasks).map((task) => ({
    id: real(task.tempId),
    title: task.title.trim(),
    description: task.description?.trim() || undefined,
    status: task.status,
    priority: task.priority,
    // Every imported task belongs to the target project, whatever the plan's
    // structure said — the plan's top-level tasks included.
    projectId: resolved.targetProject.id,
    projectMilestoneId: task.projectMilestoneTempId ? real(task.projectMilestoneTempId) : undefined,
    goalId: undefined,
    parentTaskId: task.parentTaskTempId ? real(task.parentTaskTempId) : undefined,
    createdAt,
    scheduledDate: task.scheduledDate,
    dueDate: task.dueDate,
    completedAt: task.status === 'completed' ? createdAt : undefined,
    estimatedDuration: task.estimatedDuration,
    reminder: undefined,
    notes: task.notes?.trim() || undefined,
    tags: [...task.tags],
    postponementCount: 0,
    archived: false,
  }));

  // The invariant the rest of the app enforces, on the records that are about
  // to be written: every new task's milestone belongs to the target project.
  const ownExisting = existingMilestones.filter((m) => m.projectId === resolved.targetProject.id);
  assertProjectMilestonesConsistent({
    projects: [resolved.targetProject],
    projectMilestones: [...ownExisting, ...projectMilestones],
    tasks,
  });

  return { projectMilestones, tasks, idOf };
}

/** One imported milestone with its decision and the tasks that will land in it. */
export interface ExistingProjectImportPreviewMilestone {
  mapping: ProjectMilestoneMapping;
  tasks: PreviewTask[];
}

/** The add-to-existing preview: a diff between the target project and the plan. */
export interface ExistingProjectImportPreview {
  planName?: string;
  targetProject: Pick<Project, 'id' | 'name' | 'goalId'>;
  /** The plan's project — source information only, never written. */
  sourceProject: { name: string; description?: string; deadline?: ISODate; status: ProjectStatus };
  /** The plan's goal — source information only, never created. */
  sourceGoal?: { name: string; status: GoalStatus; deadline?: ISODate };
  milestones: ExistingProjectImportPreviewMilestone[];
  /** New tasks from the project's own `tasks` array — project-level, no milestone. */
  projectLevelTasks: PreviewTask[];
  /** New tasks from the plan's top-level `tasks` — they become project-level tasks. */
  rootTasks: PreviewTask[];
  counts: ExistingProjectImportCounts;
  /** What already exists in the target project — and will not change. */
  existing: { milestones: number; tasks: number };
  warnings: string[];
}

/**
 * The preview of an add-to-existing import, built from the resolved import —
 * the same object the repository writes, so the preview cannot disagree with
 * the write.
 */
export function existingProjectImportPreview(resolved: ResolvedExistingProjectImport): ExistingProjectImportPreview {
  const byMilestone = new Map<string, PreviewTask[]>();
  for (const mapping of resolved.mappings) byMilestone.set(mapping.tempId, []);
  const projectLevelTasks: PreviewTask[] = [];
  const rootTasks: PreviewTask[] = [];
  const nodes = previewTaskMap(resolved.tasks);
  for (const task of resolved.tasks) {
    if (task.parentTaskTempId !== undefined) continue;
    const node = nodes.get(task.tempId)!;
    if (task.projectMilestoneTempId !== undefined) {
      byMilestone.get(task.projectMilestoneTempId)?.push(node);
    } else if (task.projectTempId === undefined) {
      rootTasks.push(node);
    } else {
      projectLevelTasks.push(node);
    }
  }
  return {
    planName: resolved.planName,
    targetProject: { id: resolved.targetProject.id, name: resolved.targetProject.name, goalId: resolved.targetProject.goalId },
    sourceProject: {
      name: resolved.sourceProject.name,
      description: resolved.sourceProject.description,
      deadline: resolved.sourceProject.deadline,
      status: resolved.sourceProject.status,
    },
    sourceGoal: resolved.sourceGoal
      ? { name: resolved.sourceGoal.name, status: resolved.sourceGoal.status, deadline: resolved.sourceGoal.deadline }
      : undefined,
    milestones: resolved.mappings.map((mapping) => ({
      mapping,
      tasks: byMilestone.get(mapping.tempId) ?? [],
    })),
    projectLevelTasks,
    rootTasks,
    counts: resolved.counts,
    existing: resolved.existing,
    warnings: findExistingProjectImportWarnings(resolved),
  };
}
