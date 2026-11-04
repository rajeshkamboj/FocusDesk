'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/components/ui/menu';
import { IconCheck, IconCopy } from '@/components/ui/icons';
import { copyTextToClipboard } from '@/lib/clipboard';
import { buildTaskContextMarkdown, type TaskContextInput } from '@/lib/task-context';
import type { AppData } from '@/lib/types';

/**
 * Resolve everything a task's context block needs from the live data the row
 * already holds. Only linked records that still resolve are returned, so a
 * dangling id never becomes a label.
 */
export function taskContextInputFrom(data: AppData, taskId: string): TaskContextInput | null {
  const task = data.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return null;
  const project = task.projectId ? data.projects.find((p) => p.id === task.projectId) ?? null : null;
  const projectMilestone = project && task.projectMilestoneId
    ? data.projectMilestones.find((m) => m.id === task.projectMilestoneId && m.projectId === project.id) ?? null
    : null;
  const goal = task.goalId ? data.goals.find((g) => g.id === task.goalId) ?? null : null;
  return {
    task,
    subtasks: data.subtasks.filter((subtask) => subtask.parentTaskId === task.id),
    childTasks: data.tasks.filter((candidate) => candidate.parentTaskId === task.id),
    project,
    projectMilestone,
    goal,
  };
}

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * One copy attempt: assemble, write, then report the real outcome.
 *
 * Copying is a read-only action. Nothing here writes to the task, and the only
 * data it reads is the task the user is already looking at. The resolved
 * Markdown is returned on success so a test can assert what reached the
 * clipboard.
 */
export async function copyTaskContext(
  data: AppData,
  taskId: string,
): Promise<{ ok: true; markdown: string } | { ok: false; reason: 'missing-task' | 'clipboard' | 'build' }> {
  const input = taskContextInputFrom(data, taskId);
  if (!input) return { ok: false, reason: 'missing-task' };
  let markdown: string;
  try {
    markdown = buildTaskContextMarkdown(input);
  } catch {
    return { ok: false, reason: 'build' };
  }
  try {
    await copyTextToClipboard(markdown);
  } catch {
    return { ok: false, reason: 'clipboard' };
  }
  return { ok: true, markdown };
}

const FAILURE_MESSAGE: Record<Exclude<Extract<Awaited<ReturnType<typeof copyTaskContext>>, { ok: false }>['reason'], 'build'>, string> = {
  'missing-task': 'Could not copy — this task is no longer available',
  clipboard: 'Could not copy — your browser blocked clipboard access',
};

/** Shared state machine for both presentations of the action. */
function useCopyAction(taskId: string, onDone?: () => void) {
  const { data, notify } = useData();
  const [state, setState] = useState<CopyState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const settle = useCallback((next: CopyState) => {
    setState(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState('idle'), 2500);
  }, []);

  const run = useCallback(async () => {
    const result = await copyTaskContext(data, taskId);
    if (result.ok) {
      settle('copied');
      notify('Task context copied as Markdown');
    } else {
      settle('failed');
      notify(result.reason === 'build' ? 'Could not build the task context — nothing was copied' : FAILURE_MESSAGE[result.reason]);
    }
    onDone?.();
  }, [data, taskId, notify, settle, onDone]);

  return { state, run };
}

function LiveStatus({ state }: { state: CopyState }) {
  return (
    <span aria-live="polite" className="sr-only">
      {state === 'copied'
        ? 'Task context copied to the clipboard as Markdown.'
        : state === 'failed'
          ? 'Copying the task context failed.'
          : ''}
    </span>
  );
}

/**
 * The action inside the row's `⋯` menu.
 *
 * A `MenuItem` is a real `<button>`, so it is reachable by Tab, activated by
 * Enter or Space, and closed by Escape — the keyboard path is the dropdown's
 * existing one, and on a phone it is a normal tap. The live region announces the
 * outcome to a screen reader while the toast reports it visually.
 */
export function CopyTaskContextItem({ taskId, onDone }: { taskId: string; onDone?: () => void }) {
  const { state, run } = useCopyAction(taskId, onDone);
  return (
    <>
      <MenuItem onClick={() => void run()}>
        {state === 'copied' ? <IconCheck width={14} height={14} /> : <IconCopy width={14} height={14} />}
        {state === 'copied' ? 'Copied' : 'Copy context for AI…'}
      </MenuItem>
      <LiveStatus state={state} />
    </>
  );
}

/** The same action as a plain button, for the task details modal footer. */
export function CopyTaskContextButton({
  taskId,
  className = '',
}: {
  taskId: string;
  className?: string;
}) {
  const { state, run } = useCopyAction(taskId);
  return (
    <span className={className}>
      <Button variant="secondary" size="sm" onClick={() => void run()}>
        {state === 'copied' ? <IconCheck width={14} height={14} /> : <IconCopy width={14} height={14} />}
        {state === 'copied' ? 'Copied' : 'Copy context for AI'}
      </Button>
      <LiveStatus state={state} />
    </span>
  );
}
