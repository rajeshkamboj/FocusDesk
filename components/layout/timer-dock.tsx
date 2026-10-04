'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/components/data/data-provider';
import { IconClock, IconMinus, IconPause, IconPlay, IconPopOut } from '@/components/ui/icons';
import { formatStopwatch } from '@/lib/dates';
import { isDailyPriorityTimerTaskId } from '@/lib/selectors';
import { blockingTimerTask, elapsedActiveSeconds, isTimerPaused, isTimerRunning } from '@/lib/timer';
import { useNow } from '@/components/tasks/use-now';
import { TimerPipView, useTimerPip } from './timer-pip';
import type { Task } from '@/lib/types';

/**
 * Active Timer Dock — a small fixed glanceable list of every task whose timer
 * is currently running or paused, visible on every screen.
 *
 * Purely a presentation layer over the existing authoritative timer state:
 * membership and elapsed time are derived from the persisted task timestamps
 * via the shared `lib/timer` helpers, and re-renders are driven by the shared
 * `useNow` clock. The dock owns no timer state and no interval of its own.
 *
 * Pause/Resume reuse the normal DataProvider actions. Resume applies the same
 * single-running-timer rule as every Start path (`blockingTimerTask`): a
 * running session blocks, a paused one never does.
 *
 * "Pop out" mirrors this same list into a native Document Picture-in-Picture
 * window (see `./timer-pip`) — a second view of the list computed here, not a
 * second timer.
 */

const COLLAPSED_KEY = 'pace.timerDock.collapsed';

function initialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(COLLAPSED_KEY);
    if (stored !== null) return stored === '1';
  } catch {
    /* ignore */
  }
  // No saved preference: start collapsed on small screens so the dock never
  // crowds the content.
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 640px)').matches;
}

export function TimerDock() {
  const { ready, data, actions, notify } = useData();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [busy, setBusy] = useState(false);

  // The authoritative membership rule: a task appears here exactly while its
  // persisted timer is running or paused — never before Start, never after
  // Finish/complete/cancel (those settle the timer fields and leave
  // `in_progress`, which removes the task from this list automatically).
  const activeTasks = useMemo(() => {
    const active = data.tasks.filter((t) => !t.archived && (isTimerRunning(t) || isTimerPaused(t)));
    return active.sort((a, b) => {
      const runA = isTimerRunning(a);
      const runB = isTimerRunning(b);
      if (runA !== runB) return runA ? -1 : 1;
      // Paused sessions: most recently paused first (stable, calm ordering).
      return (b.pausedAt ?? '').localeCompare(a.pausedAt ?? '');
    });
  }, [data.tasks]);

  const anyRunning = activeTasks.some(isTimerRunning);
  const pip = useTimerPip();
  const now = useNow(anyRunning, pip.pipWindow);

  // The dock hides itself when there is nothing to show, but the component
  // stays mounted so an open pop-out window survives the last timer finishing
  // (and keeps surviving route changes, as it always has).
  const showDock = ready && activeTasks.length > 0;

  const setCollapsedPref = (value: boolean) => {
    setCollapsed(value);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  /** Serialize timer actions so rapid clicks can't interleave (as TaskRow does). */
  const runTimerAction = (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };

  const pause = (task: Task) => runTimerAction(() => actions.pauseTask(task.id));

  const resume = (task: Task) => {
    // Same single-timer rule as every Start path: only a RUNNING session
    // blocks; paused sessions never do.
    const other = blockingTimerTask(data.tasks, task.id);
    if (other) {
      notify(`Finish or pause “${other.title}” before resuming another timer`);
      return;
    }
    runTimerAction(() => actions.resumeTask(task.id));
  };

  // A daily priority's timer lives on an app-owned Task shown on Today;
  // ordinary tasks live on the Tasks screen.
  const goToTask = (task: Task) => {
    router.push(isDailyPriorityTimerTaskId(task.id) ? '/today' : '/tasks');
  };

  return (
    <>
      {showDock ? (
        <div className="pointer-events-none fixed right-3 top-3 z-50 sm:right-4 sm:top-4 print:hidden">
          {collapsed ? (
            <button
              onClick={() => setCollapsedPref(false)}
              aria-label={`Expand active timers (${activeTasks.length})`}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-surface/95 px-2.5 py-1 text-[12px] font-medium text-ink-2 shadow-card backdrop-blur-md transition-colors hover:border-line-strong hover:text-ink"
            >
              <IconClock width={13} height={13} className={anyRunning ? 'text-accent' : 'text-ink-3'} />
              <span className="tabular-nums">
                {activeTasks.length} {activeTasks.length === 1 ? 'timer' : 'timers'}
              </span>
            </button>
          ) : (
            <div className="pointer-events-auto w-56 rounded-2xl border border-line bg-surface/95 shadow-pop backdrop-blur-md sm:w-64">
              <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">Active timers</p>
                <div className="flex items-center gap-0.5">
                  {pip.supported ? (
                    <button
                      onClick={pip.open}
                      aria-pressed={pip.pipWindow !== null}
                      aria-label={pip.pipWindow ? 'Timers popped out — focus that window' : 'Pop out timers'}
                      title={pip.pipWindow ? 'Timers popped out' : 'Pop out timers'}
                      className={`rounded-md p-0.5 transition-colors hover:bg-surface-2 hover:text-ink ${
                        pip.pipWindow ? 'text-accent' : 'text-ink-3'
                      }`}
                    >
                      <IconPopOut width={14} height={14} />
                    </button>
                  ) : null}
                  <button
                    onClick={() => setCollapsedPref(true)}
                    aria-label="Collapse active timers"
                    className="rounded-md p-0.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <IconMinus width={14} height={14} />
                  </button>
                </div>
              </div>
              <ul className="max-h-56 overflow-y-auto p-1.5">
                {activeTasks.map((task) => {
                  const running = isTimerRunning(task);
                  // Running: live elapsed time from the shared timestamps + clock.
                  // Paused: the frozen accumulated time (same as TaskRow shows).
                  const seconds = running ? elapsedActiveSeconds(task, now) : (task.actualDurationSeconds ?? 0);
                  return (
                    <li key={task.id} className="flex items-center gap-0.5">
                      <button
                        onClick={() => goToTask(task)}
                        title={task.title}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                      >
                        {running ? (
                          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        ) : (
                          <IconPause width={10} height={10} className="shrink-0 text-ink-3" />
                        )}
                        <span className={`min-w-0 flex-1 truncate text-[13px] ${running ? 'text-ink' : 'text-ink-3'}`}>
                          {task.title}
                        </span>
                        <span
                          className={`shrink-0 font-mono text-[12px] tabular-nums ${running ? 'text-ink-2' : 'text-ink-3'}`}
                        >
                          {formatStopwatch(seconds)}
                          <span className="sr-only">{running ? ' elapsed, running' : ' elapsed, paused'}</span>
                        </span>
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => (running ? pause(task) : resume(task))}
                        aria-label={running ? `Pause timer for ${task.title}` : `Resume timer for ${task.title}`}
                        className="shrink-0 rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-45"
                      >
                        {running ? <IconPause width={12} height={12} /> : <IconPlay width={12} height={12} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {/* The same list, rendered into the Picture-in-Picture window. */}
      {pip.pipWindow ? <TimerPipView pipWindow={pip.pipWindow} tasks={activeTasks} now={now} /> : null}
    </>
  );
}
