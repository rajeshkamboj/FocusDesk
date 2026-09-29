'use client';

import { useEffect, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { useUI } from '@/components/ui/ui-provider';
import { Button } from '@/components/ui/button';
import { IconCheck, IconPause, IconPlay, IconX } from '@/components/ui/icons';

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Focus Mode — a quiet room around one thing.
 * Started from "🔥 Start Priority" on Today (or a task). Everything else hides.
 */
export function FocusMode() {
  const { focusTarget, stopFocus } = useUI();
  const { actions, ready } = useData();
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);

  const [trackedTarget, setTrackedTarget] = useState(focusTarget);
  if (trackedTarget !== focusTarget) {
    setTrackedTarget(focusTarget);
    setSeconds(0);
    setRunning(true);
  }

  useEffect(() => {
    if (!focusTarget || !running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [focusTarget, running]);

  if (!focusTarget || !ready) return null;

  const complete = async () => {
    if (focusTarget.type === 'daily-priority') {
      await actions.updateDailyPriority(focusTarget.id, { completed: true, completedAt: new Date().toISOString() });
    } else {
      await actions.completeTask(focusTarget.id);
    }
    stopFocus();
  };

  return (
    <div className="fixed inset-0 z-[80] flex animate-fade-in flex-col items-center justify-center bg-background">
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
          {formatElapsed(seconds)}
        </div>

        <div className="mt-12 flex items-center gap-3">
          <Button variant="secondary" size="lg" onClick={() => setRunning((r) => !r)}>
            {running ? <IconPause width={18} height={18} /> : <IconPlay width={18} height={18} />}
            {running ? 'Pause' : 'Resume'}
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
