/**
 * Task context → clean Markdown, ready to paste into an AI assistant.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE
 * The Markdown a reader copies is a *rendering* of a task, not the task. Keeping
 * it out of the component means it can be tested without a DOM, and it means the
 * one place that decides what is private is a plain function that a test can
 * call directly.
 *
 * WHAT IS INCLUDED
 * Only what a person would say if they were briefing someone: title,
 * description, project (and milestone, and goal where the task carries one),
 * notes, status, priority, start date, due date, tags, subtasks with their
 * completion, and any links the user already wrote into the task.
 *
 * WHAT IS NEVER INCLUDED
 * Internal ids (`task.id`, `projectId`, `parentTaskId`, goal/milestone ids),
 * timestamps that exist only for the sync engine (`createdAt`, `startedAt`,
 * `pausedAt`, `completedAt` as a raw ISO instant), archive/postponement
 * bookkeeping, `actualDurationSeconds` counters, and every kind of account,
 * authentication or storage detail. A pasted context block must never tell a
 * third party anything about the system it came from — only about the work.
 *
 * EMPTY FIELDS ARE OMITTED, NEVER PRINTED AS AN EMPTY LABEL
 * "Priority:" followed by nothing reads as if the task had no priority rather
 * than as if the field did not apply, so a field that has no value simply does
 * not appear.
 */

import type { Goal, Project, ProjectMilestone, Subtask, Task, TaskPriority, TaskStatus } from './types';

export interface TaskContextInput {
  task: Task;
  /** Checklist subtasks belonging to the task (order is the user's manual order). */
  subtasks?: readonly Subtask[];
  /** Tasks that were broken out of this one (`parentTaskId === task.id`). */
  childTasks?: readonly Task[];
  /** The task's project, when it is still linked to one. */
  project?: Pick<Project, 'name'> | null;
  /** The project milestone, when it is still linked to the task's project. */
  projectMilestone?: Pick<ProjectMilestone, 'name'> | null;
  /** The goal the task points at directly (projects carry their own goal link). */
  goal?: Pick<Goal, 'name'> | null;
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  created: 'Created',
  planned: 'Planned',
  today: 'For today',
  in_progress: 'In progress',
  completed: 'Completed',
  incomplete: 'Incomplete',
  someday: 'Someday',
  cancelled: 'Cancelled',
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The characters CommonMark treats as markup. Escaping them keeps a task called
 * “Fix *all* the `env` flags” from turning the pasted context into italics and
 * a code span, and keeps a project named “[WIP] Redesign” from becoming a link
 * reference.
 */
const INLINE_MARKDOWN_SPECIALS = /[\\`*_{}[\]()#+.!|<>~-]/g;

/** Escape user text used *inside* a line of Markdown (bold value, list item, tag). */
export function escapeInline(value: string): string {
  return value.replace(INLINE_MARKDOWN_SPECIALS, (char) => `\\${char}`);
}

/**
 * Escape a free-text body (description, notes).
 *
 * Line structure is the author's — blank lines, hyphens and indentation are
 * kept, because that is how people write notes — but a line can never open a
 * new heading or a setext underline, so a note beginning "# 42" stays a note
 * rather than becoming an H1 above the task title.
 */
export function escapeBlock(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (/^\s{0,3}#{1,6}(\s|$)/.test(line)) return line.replace(/#/g, '\\#');
      if (/^\s{0,3}(=+|-{3,})\s*$/.test(line)) return `\\${line.trimStart()}`;
      if (/^\s{0,3}>/.test(line)) return line.replace(/>/, '\\>');
      if (/^\s{0,3}```/.test(line)) return line.replace(/`/g, '\\`');
      return line;
    })
    .join('\n')
    .trim();
}

/** `2026-11-05` → `5 November 2026`. Returns null for anything that is not a real date. */
export function formatContextDate(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

const URL_RE = /\bhttps?:\/\/[^\s<>()[\]"']+/gi;

/** Trim trailing punctuation that belongs to the sentence, not to the URL. */
function trimUrl(raw: string): string {
  return raw.replace(/[.,;:!?]+$/, '').replace(/[*_]+$/, '');
}

/**
 * Links the user already wrote into the task. A task has no URL field, so the
 * only honest source is the text itself: URLs in the description and the notes,
 * de-duplicated, in the order they were written.
 */
export function extractLinks(task: Pick<Task, 'description' | 'notes'>): string[] {
  const found: string[] = [];
  for (const block of [task.description, task.notes]) {
    if (!block) continue;
    for (const match of block.match(URL_RE) ?? []) {
      const url = trimUrl(match);
      if (url.length > 'https://'.length && !found.includes(url)) found.push(url);
    }
  }
  return found;
}

function bullet(lines: string[], value: string): void {
  lines.push(`- ${value}`);
}

/**
 * Build the Markdown a reader pastes into ChatGPT, Gemini or any other
 * assistant. Deterministic: the same inputs always produce the same string, so
 * the copied block can be compared in a test.
 */
export function buildTaskContextMarkdown(input: TaskContextInput): string {
  const { task, project, projectMilestone, goal } = input;
  const subtasks = [...(input.subtasks ?? [])];
  const childTasks = [...(input.childTasks ?? [])];
  const blocks: string[] = [];

  const title = task.title.trim();
  blocks.push(`# ${escapeInline(title || 'Untitled task')}`);

  /* ---- Summary lines ------------------------------------------------- */
  const facts: string[] = [];
  const status = TASK_STATUS_LABEL[task.status];
  if (status) facts.push(`**Status:** ${escapeInline(status)}`);
  if (task.priority) facts.push(`**Priority:** ${escapeInline(TASK_PRIORITY_LABEL[task.priority] ?? task.priority)}`);

  const start = formatContextDate(task.scheduledDate);
  const due = formatContextDate(task.dueDate);
  if (start) facts.push(`**Start date:** ${start}`);
  if (due) facts.push(`**Due date:** ${due}`);

  if (facts.length > 0) blocks.push(facts.join(' · '));

  const where: string[] = [];
  const projectName = project?.name?.trim();
  if (projectName) {
    const milestoneName = projectMilestone?.name?.trim();
    where.push(`**Project:** ${escapeInline(projectName)}${milestoneName ? ` · ${escapeInline(milestoneName)}` : ''}`);
  }
  const goalName = goal?.name?.trim();
  if (goalName) where.push(`**Goal:** ${escapeInline(goalName)}`);
  if (where.length > 0) blocks.push(where.join(' · '));

  const tags = task.tags.map((tag) => tag.trim()).filter(Boolean);
  if (tags.length > 0) blocks.push(`**Tags:** ${tags.map((tag) => escapeInline(tag)).join(', ')}`);

  /* ---- Description --------------------------------------------------- */
  const description = task.description?.trim();
  if (description) blocks.push(`## Description\n\n${escapeBlock(description)}`);

  /* ---- Notes --------------------------------------------------------- */
  const notes = task.notes?.trim();
  if (notes) blocks.push(`## Notes and context\n\n${escapeBlock(notes)}`);

  /* ---- Subtasks ------------------------------------------------------ */
  if (subtasks.length > 0) {
    const lines: string[] = ['## Subtasks', ''];
    for (const subtask of subtasks) {
      bullet(lines, `[${subtask.completed ? 'x' : ' '}] ${escapeInline(subtask.title.trim())}`);
    }
    const done = subtasks.filter((subtask) => subtask.completed).length;
    lines.push('', `${done} of ${subtasks.length} complete.`);
    blocks.push(lines.join('\n'));
  }

  /* ---- Tasks broken out of this one ---------------------------------- */
  if (childTasks.length > 0) {
    const lines: string[] = ['## Child tasks', ''];
    for (const child of childTasks) {
      const childState = TASK_STATUS_LABEL[child.status] ?? child.status;
      bullet(lines, `${escapeInline(child.title.trim())} — ${escapeInline(childState)}`);
    }
    blocks.push(lines.join('\n'));
  }

  /* ---- Links --------------------------------------------------------- */
  const links = extractLinks(task);
  if (links.length > 0) {
    const lines: string[] = ['## Links', ''];
    for (const link of links) bullet(lines, link);
    blocks.push(lines.join('\n'));
  }

  return `${blocks.join('\n\n').trim()}\n`;
}
