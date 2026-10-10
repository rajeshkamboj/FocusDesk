'use client';

import { useData } from '@/components/data/data-provider';
import { useUI } from '@/components/ui/ui-provider';
import { Button } from '@/components/ui/button';
import { IconCheck, IconPause, IconPlay, IconX } from '@/components/ui/icons';
import { formatStopwatch } from '@/lib/dates';
import { elapsedActiveSeconds, isTimerPaused, isTimerRunning } from '@/lib/timer';
import { useNow } from '@/components/tasks/use-now';

/**
 * Focus Mode — a quiet room around one thing.
 * Its clock is the normal persisted Task timer, not a Focus Mode counter.
 */
export function FocusMode() {
  const { focusTarget, stopFocus } = useUI();
  const { actions, data, ready } = useData();
  const timerTaskId = focusTarget
    ? focusTarget.type === 'task'
      ? focusTarget.id
      : focusTarget.timerTaskId
    : undefined;
  const timerTask = timerTaskId ? data.tasks.find((task) => task.id === timerTaskId) : undefined;
  const running = timerTask ? isTimerRunning(timerTask) : false;
  const paused = timerTask ? isTimerPaused(timerTask) : false;
  const now = useNow(running);
  const elapsed = timerTask ? elapsedActiveSeconds(timerTask, now) : 0;

  if (!focusTarget || !ready) return null;

  const toggleTimer = async () => {
    if (!timerTask) return;
    if (running) await actions.pauseTask(timerTask.id);
    else if (paused) await actions.resumeTask(timerTask.id);
    else if (focusTarget.type === 'task') await actions.startTask(timerTask.id);
  };

  const complete = async () => {
    if (focusTarget.type === 'daily-priority') {
      // This action also finalizes the associated Task timer before marking the
      // daily priority complete, preserving the priority's existing timestamp.
      await actions.toggleDailyPriority(focusTarget.id);
    } else {
      await actions.completeTask(focusTarget.id);
    }
    stopFocus();
  };

  const toggleLabel = running ? 'Pause' : paused ? 'Resume' : 'Start';

  return (
    <div className="fixed inset-0 z-[80] flex animate-fade-in flex-col items-center justify-center bg-background print:hidden">
      <button
        onClick={stopFocus}
        aria-label="Exit focus mode"
        className="absolute right-6 top-6 rounded-xl p-2.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <IconX width={22} height={22} />
      </button>

      <div className="flex w-full max-w-xl flex-col items-center px-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
          {focusTarget.type === 'daily-priority' ? "Today's priority" : 'Focusing on'}
        </p>

        <h1 className="mt-6 text-balance text-3xl font-semibold leading-snug tracking-tight text-ink sm:text-4xl">
          {focusTarget.title}
        </h1>

        <div className="mt-10 font-mono text-6xl font-light tabular-nums tracking-tight text-ink-2 sm:text-7xl">
          {formatStopwatch(elapsed)}
        </div>

        <div className="mt-12 flex items-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            disabled={!timerTask || (!running && !paused && focusTarget.type === 'daily-priority')}
            onClick={() => void toggleTimer()}
          >
            {running ? <IconPause width={18} height={18} /> : <IconPlay width={18} height={18} />}
            {toggleLabel}
          </Button>
          <Button variant="primary" size="lg" onClick={() => void complete()}>
            <IconCheck width={18} height={18} />
            Complete
          </Button>
        </div>

        <button
          onClick={stopFocus}
          className="mt-8 text-sm text-ink-3 underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Exit Focus Mode
        </button>
      </div>
    </div>
  );
}
