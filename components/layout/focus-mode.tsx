'use client';

import { useData } from '@/components/data/data-provider';
import { useUI } from '@/components/ui/ui-provider';
import { Button } from '@/components/ui/button';
import { IconCheck, IconPause, IconPlay, IconX } from '@/components/ui/icons';
import { FocusHourglass } from '@/components/layout/focus-hourglass';
import { CopyTaskContextIconButton } from '@/components/tasks/copy-task-context';
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
  const project = timerTask?.projectId ? data.projects.find((item) => item.id === timerTask.projectId) : undefined;
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
    <div className="fixed inset-0 z-[80] flex animate-fade-in flex-col items-center overflow-hidden bg-background sm:overflow-y-auto sm:px-4 sm:py-8">
      <div className="flex min-h-0 w-full max-w-xl flex-1 flex-col sm:my-auto sm:flex-none">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:flex-none sm:overflow-visible sm:overscroll-auto sm:pb-0 sm:pt-0">
          <header className="relative w-full text-left sm:text-center">
            <div className="flex min-h-11 items-center justify-between gap-3 sm:min-h-0 sm:justify-center">
              <p className="text-base font-semibold tracking-tight text-ink sm:text-[11px] sm:uppercase sm:tracking-[0.22em] sm:text-accent">
                {focusTarget.type === 'daily-priority' ? 'Priority of the day' : 'Focusing on'}
              </p>
              <button
                type="button"
                onClick={stopFocus}
                aria-label="Exit focus mode"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink sm:fixed sm:right-6 sm:top-6 sm:border-transparent"
              >
                <IconX width={22} height={22} />
              </button>
            </div>

            <h1 className="mt-2 break-words text-xl font-semibold leading-snug tracking-tight text-ink sm:mt-6 sm:text-balance sm:text-4xl">
              {focusTarget.title}
            </h1>
          </header>

          {(project || timerTask?.description) ? (
            <div className="mt-4 w-full rounded-2xl border border-accent/50 bg-surface/70 p-3 text-left shadow-[0_0_28px_rgba(59,130,246,0.08)] sm:mt-5 sm:p-4">
              <div className={`grid min-w-0 gap-3 sm:gap-4 ${project ? 'sm:grid-cols-[minmax(150px,0.72fr)_minmax(0,1.6fr)]' : ''}`}>
                {project ? (
                  <div className="flex min-w-0 items-center gap-3 rounded-xl bg-accent-soft/60 px-3 py-3 sm:min-h-[116px] sm:flex-col sm:items-start sm:justify-center sm:gap-0 sm:px-4">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 shrink-0 text-accent sm:mb-3">
                      <path d="m12 3 9 5-9 5-9-5Z" />
                      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Project</p>
                      <p className="mt-1 break-words text-sm font-semibold leading-snug text-ink">{project.name}</p>
                    </div>
                  </div>
                ) : null}
                <div className={`min-w-0 ${project ? 'border-t border-line pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0' : ''}`}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3">Task details</p>
                    {timerTask ? <CopyTaskContextIconButton taskId={timerTask.id} className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0" /> : null}
                  </div>
                  {timerTask?.description ? (
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-2">{timerTask.description}</p>
                  ) : (
                    <p className="text-sm text-ink-3">No task description added.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <section aria-label="Focus timer" className="mt-4 w-full min-w-0 rounded-2xl border border-[#d9a64d]/40 bg-surface/50 px-3 py-4 text-center sm:mt-10 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
            <div className="break-words font-mono text-[clamp(2rem,10vw,3rem)] font-light leading-tight tabular-nums tracking-tight text-ink sm:text-7xl sm:text-ink-2">
              {formatStopwatch(elapsed)}
            </div>
            <FocusHourglass elapsedSeconds={elapsed} isRunning={running} />
          </section>
        </div>

        <footer className="shrink-0 border-t border-line bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:mt-8 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-center">
            <Button
              variant="secondary"
              size="lg"
              className="min-w-0 max-sm:min-h-12 max-sm:px-2"
              disabled={!timerTask || (!running && !paused && focusTarget.type === 'daily-priority')}
              onClick={() => void toggleTimer()}
            >
              {running ? <IconPause width={18} height={18} /> : <IconPlay width={18} height={18} />}
              {toggleLabel}
            </Button>
            <Button variant="primary" size="lg" className="min-w-0 max-sm:min-h-12 max-sm:px-2" onClick={() => void complete()}>
              <IconCheck width={18} height={18} />
              Complete
            </Button>
          </div>

          <button
            onClick={stopFocus}
            className="mx-auto mt-8 hidden text-sm text-ink-3 underline-offset-4 transition-colors hover:text-ink hover:underline sm:block"
          >
            Exit Focus Mode
          </button>
        </footer>
      </div>
    </div>
  );
}
