'use client';

/**
 * Focus Widget link (headless).
 *
 * Bridges the live FocusDesk state to the optional Windows companion. It renders
 * nothing and touches no UI: it publishes the currently timed task and applies
 * the widget's Pause / Resume / Finish requests through the *existing*
 * `useData()` actions, so the timer, task history and persistence behave exactly
 * as they do when the buttons inside the app are used.
 *
 * If the companion is not running this component does nothing at all.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useData } from '@/components/data/data-provider';
import { elapsedActiveSeconds, isTimerPaused, isTimerRunning } from '@/lib/timer';
import { FocusWidgetBridge } from '@/lib/focus-widget/bridge';
import {
  FOCUS_WIDGET_PROTOCOL_VERSION,
  type FocusWidgetCommand,
  type FocusWidgetSession,
} from '@/lib/focus-widget/protocol';
import type { AppData, Task } from '@/lib/types';

/**
 * The task that is being timed. Mirrors the guard the task row uses
 * (`status === 'in_progress'` plus a live timer marker), so the widget can only
 * ever show the one task FocusDesk itself considers active.
 */
function activeTimedTask(data: AppData): Task | undefined {
  const candidates = data.tasks.filter(
    (task) =>
      task.status === 'in_progress' &&
      !task.archived &&
      (task.startedAt !== undefined || task.pausedAt !== undefined),
  );
  return candidates.find(isTimerRunning) ?? candidates[0];
}

/** Identity of the active session — any change means "tell the widget now". */
function sessionRevision(data: AppData, ready: boolean): string {
  const task = activeTimedTask(data);
  if (!task) return ready ? 'none' : 'loading';
  return [
    task.id,
    task.status,
    task.startedAt ?? '',
    task.pausedAt ?? '',
    task.actualDurationSeconds ?? 0,
    task.title,
    task.projectId ?? '',
    task.estimatedDuration ?? 0,
  ].join('|');
}

function buildSession(data: AppData, nowMs: number): FocusWidgetSession | null {
  const task = activeTimedTask(data);
  if (!task) return null;
  const running = isTimerRunning(task);
  const elapsed = elapsedActiveSeconds(task, nowMs);
  return {
    protocol: FOCUS_WIDGET_PROTOCOL_VERSION,
    sessionId: task.id,
    taskId: task.id,
    title: task.title,
    projectName: data.projects.find((project) => project.id === task.projectId)?.name,
    state: running ? 'running' : 'paused',
    startedAt: task.startedAt,
    pausedAt: task.pausedAt,
    accumulatedSeconds: task.actualDurationSeconds ?? 0,
    elapsedSeconds: Math.round(elapsed * 10) / 10,
    estimatedMinutes: task.estimatedDuration,
    sentAt: new Date(nowMs).toISOString(),
  };
}

export function FocusWidgetLink() {
  const { ready, data, actions } = useData();
  const bridgeRef = useRef<FocusWidgetBridge | null>(null);
  const latest = useRef({ data, actions });

  useEffect(() => {
    latest.current = { data, actions };
  }, [data, actions]);

  /** Apply a widget request through the regular FocusDesk actions. */
  const applyCommand = useCallback((command: FocusWidgetCommand) => {
    const { data: current, actions: act } = latest.current;
    const task = current.tasks.find((item) => item.id === command.taskId);
    if (!task || task.status !== 'in_progress') return;
    if (command.type === 'pause' && isTimerRunning(task)) return act.pauseTask(task.id);
    if (command.type === 'resume' && isTimerPaused(task)) return act.resumeTask(task.id);
    if (command.type === 'finish') return act.finishTask(task.id);
    return undefined;
  }, []);

  useEffect(() => {
    const bridge = new FocusWidgetBridge();
    bridgeRef.current = bridge;
    bridge.setCommandHandler(applyCommand);
    bridge.setSource(() => buildSession(latest.current.data, Date.now()));
    bridge.start();
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, [applyCommand]);

  const revision = useMemo(() => sessionRevision(data, ready), [data, ready]);

  useEffect(() => {
    bridgeRef.current?.push(true);
  }, [revision]);

  return null;
}
