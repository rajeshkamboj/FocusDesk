'use client';

import { useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { useUI } from '@/components/ui/ui-provider';
import { Button } from '@/components/ui/button';
import { IconCheck, IconFlame, IconPencil, IconPlay } from '@/components/ui/icons';
import { formatFocusedTime, formatStopwatch, todayISO } from '@/lib/dates';
import { dailyPriorityTimerTaskId } from '@/lib/selectors';
import { elapsedActiveSeconds, isTimerPaused, isTimerRunning } from '@/lib/timer';
import { useNow } from '@/components/tasks/use-now';

/**
 * Shared shape of the Priority card's text inputs.
 *
 * Deliberately one single border and one single focus state: the border is
 * 1px at all times and only changes colour on focus. The previous
 * `focus:ring-2` sat on top of that coloured border (and on top of the global
 * `:focus-visible` outline), which read as a doubled green ring — especially
 * on a narrow screen where the field spans the whole card.
 *
 * Sizing is mobile-first and fluid: `w-full` + `box-border` means the field is
 * exactly the card's content width at 320px just as it is at 430px, with no
 * fixed desktop width to overflow out of. `h-12` keeps a comfortable ~48px
 * touch target and `leading-normal` keeps the text optically centred in it.
 */
const PRIORITY_INPUT_CLASS =
  'box-border h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-4 leading-normal text-ink ' +
  'placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent focus:outline-none';

/**
 * 🔥 Today's Priority — the one question that matters in the morning:
 * "What is the ONE thing that matters most today?"
 */
export function PriorityCard() {
  const { data, actions, notify } = useData();
  const { startFocus } = useUI();

  const priority = data.dailyPriorities.find((p) => p.date === todayISO());
  const timerTask = priority
    ? data.tasks.find((t) => t.id === dailyPriorityTimerTaskId(priority.id))
    : undefined;
  const timerRunning = timerTask ? isTimerRunning(timerTask) : false;
  const timerPaused = timerTask ? isTimerPaused(timerTask) : false;
  const now = useNow(timerRunning);
  const elapsed = timerTask ? elapsedActiveSeconds(timerTask, now) : 0;
  const timerLabel = timerRunning
    ? `Working ${formatStopwatch(elapsed)}`
    : timerPaused
      ? `Paused ${formatStopwatch(timerTask?.actualDurationSeconds ?? 0)}`
      : timerTask?.actualDurationSeconds !== undefined
        ? `Focused time: ${formatFocusedTime(timerTask.actualDurationSeconds)}`
        : null;

  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');

  const openPriorityFocus = async () => {
    if (!priority) return;
    try {
      const task = await actions.startDailyPriorityTimer(priority.id);
      if (task) {
        startFocus({
          type: 'daily-priority',
          id: priority.id,
          timerTaskId: task.id,
          title: priority.title,
        });
      }
    } catch (error) {
      console.error('Could not start the priority timer', error);
      notify('Could not start the priority timer — please try again');
    }
  };

  if (!priority) {
    return (
      <div className="animate-rise-in rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="flex items-center gap-2 text-accent">
          <IconFlame width={18} height={18} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Today&apos;s priority</span>
        </div>
        <h2 className="mt-4 text-balance text-xl font-semibold leading-snug tracking-tight text-ink sm:text-2xl">
          What is the ONE thing that matters most today?
        </h2>
        <form
          className="mt-5 flex flex-col gap-2.5 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const title = draft.trim();
            if (!title) return;
            void actions.setDailyPriority(title).then(() => setDraft(''));
          }}
        >
          {/* Mobile first: full card width, one 48px touch target, 16px text
              (so iOS never zooms on focus). `flex-1` is applied from `sm` up
              only — in the stacked column layout it would collapse the height
              instead of growing the width. See PRIORITY_INPUT_CLASS. */}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Enter today's priority"
            className={`${PRIORITY_INPUT_CLASS} text-base sm:flex-1 sm:text-[15px]`}
            autoFocus
          />
          <Button type="submit" variant="primary" size="lg" disabled={!draft.trim()}>
            Set Priority
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="animate-rise-in rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <div className="flex items-center gap-2 text-accent">
        <IconFlame width={18} height={18} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Today&apos;s priority</span>
        {priority.completed ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-ink">
            <IconCheck width={12} height={12} /> Done
          </span>
        ) : null}
      </div>

      {editing ? (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const title = editDraft.trim();
            if (!title) return;
            void actions.updateDailyPriority(priority.id, { title }).then(() => setEditing(false));
          }}
        >
          <input
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            className={`${PRIORITY_INPUT_CLASS} text-lg font-semibold tracking-tight sm:text-xl`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={!editDraft.trim()}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p
            className={`mt-3 text-balance text-2xl font-semibold leading-snug tracking-tight sm:text-[28px] ${
              priority.completed ? 'text-ink-2' : 'text-ink'
            }`}
          >
            {priority.title}
          </p>
          {timerLabel ? <p className="mt-2 text-[12px] font-medium tabular-nums text-ink-3">{timerLabel}</p> : null}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {!priority.completed ? (
              <>
                <Button variant="primary" onClick={() => void actions.toggleDailyPriority(priority.id)}>
                  <IconCheck width={16} height={16} />
                  Mark Complete
                </Button>
                <Button variant="secondary" onClick={() => void openPriorityFocus()}>
                  <IconPlay width={15} height={15} />
                  {timerRunning ? 'Open Focus Mode' : timerPaused ? 'Resume Priority' : '🔥 Start Priority'}
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => void actions.toggleDailyPriority(priority.id)}>
                Reopen priority
              </Button>
            )}
            <Button variant="ghost" onClick={() => {
              setEditDraft(priority.title);
              setEditing(true);
            }}>
              <IconPencil width={15} height={15} />
              Edit
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

