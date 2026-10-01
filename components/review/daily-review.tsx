'use client';

import { useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { DateModal } from '@/components/ui/date-modal';
import { Field, Textarea } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { IconCheck, IconChevronLeft, IconChevronRight, IconClock } from '@/components/ui/icons';
import { TaskList } from '@/components/tasks/task-list';
import { addDays, daysBetween, formatFocusedTime, formatLongDate, formatTime, todayISO, weekdayName } from '@/lib/dates';
import { dailyPriorityTimerTaskId, dailyReviewStats } from '@/lib/selectors';
import type { DailyPriority, ISODate } from '@/lib/types';

/**
 * End-of-day review: the factual picture of one day, plus one honest question —
 * "Did you complete today's priority?" The app never judges the answer.
 */
export function DailyReview({ date, onDateChange }: { date: ISODate; onDateChange: (date: ISODate) => void }) {
  const { data, actions, notify } = useData();
  const isToday = date === todayISO();
  const stats = dailyReviewStats(data, date);
  const priority = data.dailyPriorities.find((p) => p.date === date);
  const priorityTimerTask = priority
    ? data.tasks.find((t) => t.id === dailyPriorityTimerTaskId(priority.id))
    : undefined;
  const priorityFocusedTime = priority?.completed
    ? formatFocusedTime(priorityTimerTask?.actualDurationSeconds)
    : '';

  const [noAnswered, setNoAnswered] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const movePriority = (patch: Partial<DailyPriority>, message: string) => {
    if (!priority) return;
    void actions
      .updateDailyPriority(priority.id, {
        ...patch,
        postponementCount: (priority.postponementCount ?? 0) + (patch.date !== undefined && patch.date !== priority.date ? 1 : 0),
      })
      .then(() => {
        notify(message);
        setNoAnswered(false);
      });
  };

  return (
    <div className="space-y-6">
      {/* Day navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onDateChange(addDays(date, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          aria-label="Previous day"
        >
          <IconChevronLeft width={17} height={17} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[15px] font-semibold text-ink">
            {isToday ? 'Today' : daysBetween(todayISO(), date) === -1 ? 'Yesterday' : weekdayName(date)}
          </p>
          <p className="text-[12px] text-ink-3">{formatLongDate(date)}</p>
        </div>
        <button
          onClick={() => onDateChange(addDays(date, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          aria-label="Next day"
        >
          <IconChevronRight width={17} height={17} />
        </button>
      </div>

      {/* The question */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3">Daily review</h2>

        {!priority ? (
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            {isToday
              ? 'No priority was set today. That is okay — you can still review what moved forward.'
              : 'No priority was set on this day.'}
          </p>
        ) : (
          <>
            <div className="mt-3 flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  priority.completed ? 'border-accent bg-accent text-white' : 'border-line-strong'
                }`}
              >
                {priority.completed ? <IconCheck width={12} height={12} /> : null}
              </div>
              <div className="min-w-0">
                <p className={`text-[17px] font-semibold leading-snug ${priority.completed ? 'text-ink-3 line-through' : 'text-ink'}`}>
                  {priority.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                  <span>Priority for {formatLongDate(priority.date)}</span>
                  {priority.dueDate ? <Badge tone="warning">Deadline {priority.dueDate}</Badge> : null}
                  {(priority.postponementCount ?? 0) >= 1 ? (
                    <Badge tone="muted">Moved {priority.postponementCount}×</Badge>
                  ) : null}
                  {priority.completedAt ? <span>done at {formatTime(priority.completedAt)}</span> : null}
                  {priorityFocusedTime ? (
                    <span className="inline-flex items-center gap-1 tabular-nums" title="Focused time">
                      <IconClock width={12} height={12} />
                      Focused time: {priorityFocusedTime}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {isToday && !priority.completed && !noAnswered ? (
              <div className="mt-5">
                <p className="text-[15px] font-medium text-ink">Did you complete today&apos;s priority?</p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <Button variant="primary" size="lg" onClick={() => void actions.toggleDailyPriority(priority.id)}>
                    YES — DONE
                  </Button>
                  <Button variant="secondary" size="lg" onClick={() => setNoAnswered(true)}>
                    NO — NOT YET
                  </Button>
                </div>
              </div>
            ) : null}

            {isToday && !priority.completed && noAnswered ? (
              <div className="mt-5">
                {(priority.postponementCount ?? 0) >= 3 ? (
                  <p className="mb-3 rounded-xl bg-warning-soft/70 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
                    This has been postponed several times. That happens — what would you like to do?
                  </p>
                ) : (
                  <p className="mb-3 text-[15px] font-medium text-ink">What should happen?</p>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="secondary" onClick={() => movePriority({ date: addDays(date, 1) }, 'Priority moved to tomorrow')}>
                    Move to tomorrow
                  </Button>
                  <Button variant="secondary" onClick={() => setRescheduleOpen(true)}>
                    Choose another date
                  </Button>
                  <Button variant="secondary" onClick={() => setDeadlineOpen(true)}>
                    Set a deadline
                  </Button>
                  <Button variant="secondary" onClick={() => setBreakdownOpen(true)}>
                    Break into smaller tasks
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void actions.addTask({ title: priority.title, status: 'someday', description: 'Moved from daily priority' });
                      void actions.deleteDailyPriority(priority.id);
                      notify('Moved to Someday as a task');
                      setNoAnswered(false);
                    }}
                  >
                    Move to Someday
                  </Button>
                  <Button variant="danger" onClick={() => setCancelOpen(true)}>
                    Cancel
                  </Button>
                </div>
                <button
                  onClick={() => setNoAnswered(false)}
                  className="mt-3 text-[12px] text-ink-3 underline-offset-4 hover:text-ink-2 hover:underline"
                >
                  Back to the question
                </button>
              </div>
            ) : null}

            {priority.completed && isToday ? (
              <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent-soft px-4 py-2.5 text-[13px] font-medium text-accent-ink">
                <IconCheck width={15} height={15} /> Priority done. Whatever else happened, the one thing moved.
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* Factual stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Tasks completed" value={stats.completed.length} />
        <StatBox label="Tasks postponed" value={stats.postponedCount} />
        <StatBox label="Tasks cancelled" value={stats.cancelled.length} />
        <StatBox
          label="Priority"
          value={stats.priorityCompleted === null ? '—' : stats.priorityCompleted ? 'Done' : 'Not yet'}
        />
      </div>

      {/* Tasks */}
      {stats.completed.length > 0 ? (
        <section>
          <h3 className="mb-1.5 flex items-baseline gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            <span>Completed · {stats.completed.length}</span>
            {stats.focusedSeconds > 0 ? (
              <span className="font-normal normal-case tracking-normal tabular-nums">
                {formatFocusedTime(stats.focusedSeconds)} focused
              </span>
            ) : null}
          </h3>
          <TaskList tasks={stats.completed} showDates={false} />
        </section>
      ) : null}

      {stats.incomplete.length > 0 ? (
        <section>
          <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            Not completed · {stats.incomplete.length}
          </h3>
          <TaskList tasks={stats.incomplete} showDates={false} />
          <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-ink-3">
            Unfinished tasks are never dropped. Use the ⋯ menu on any task to move, reschedule, break down or park it.
          </p>
        </section>
      ) : null}

      {stats.cancelled.length > 0 ? (
        <section>
          <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            Cancelled · {stats.cancelled.length}
          </h3>
          <TaskList tasks={stats.cancelled} showDates={false} />
        </section>
      ) : null}

      {stats.completed.length === 0 && stats.incomplete.length === 0 && stats.cancelled.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-[13px] text-ink-3">
          No tasks were planned for this day.
        </p>
      ) : null}

      {/* Priority helper dialogs */}
      <DateModal
        open={rescheduleOpen}
        title="Choose another date"
        label="Move this priority to"
        confirmLabel="Move priority"
        initialDate={addDays(date, 1)}
        onClose={() => setRescheduleOpen(false)}
        onSubmit={(newDate) => {
          setRescheduleOpen(false);
          if (newDate) movePriority({ date: newDate }, `Priority moved to ${newDate}`);
        }}
      />

      <DateModal
        open={deadlineOpen}
        title="Set a deadline"
        label="This priority must be completed by"
        confirmLabel="Save deadline"
        clearable={Boolean(priority?.dueDate)}
        initialDate={priority?.dueDate}
        onClose={() => setDeadlineOpen(false)}
        onSubmit={(dueDate) => {
          setDeadlineOpen(false);
          if (priority) void actions.updateDailyPriority(priority.id, { dueDate }).then(() => notify(dueDate ? `Deadline set for ${dueDate}` : 'Deadline removed'));
        }}
      />

      <PriorityBreakDownModal
        open={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        priority={priority}
        date={date}
      />

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this priority?"
        message={`“${priority?.title ?? ''}” will be removed from ${formatLongDate(date)}. Unfinished tasks are not affected.`}
        confirmLabel="Cancel priority"
        danger
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => {
          setCancelOpen(false);
          if (priority) void actions.deleteDailyPriority(priority.id);
          notify('Priority cancelled');
        }}
      />

      {/* Focus shortcut for the day */}
      {isToday && priority && !priority.completed ? (
        <p className="pb-2 text-center text-[12px] text-ink-3">
          Tip: start <span className="font-medium text-ink-2">🔥 Focus Mode</span> on the Today screen to work on this
          without distractions. <IconClock width={12} height={12} className="inline align-[-1px]" />
        </p>
      ) : null}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function PriorityBreakDownModal({
  open,
  onClose,
  priority,
  date,
}: {
  open: boolean;
  onClose: () => void;
  priority?: DailyPriority;
  date: ISODate;
}) {
  const { actions, notify } = useData();
  const [titles, setTitles] = useState('');

  const parts = titles
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Break into smaller tasks"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={parts.length === 0 || !priority}
            onClick={() => {
              if (!priority) return;
              void (async () => {
                for (const title of parts) {
                  await actions.addTask({ title, scheduledDate: addDays(date, 1), status: 'planned' });
                }
                await actions.updateDailyPriority(priority.id, {
                  date: addDays(date, 1),
                  postponementCount: (priority.postponementCount ?? 0) + 1,
                });
                notify('Smaller tasks created for tomorrow');
                setTitles('');
                onClose();
              })();
            }}
          >
            Create tasks & move priority to tomorrow
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-2">
          Split <span className="font-medium text-ink">“{priority?.title ?? ''}”</span> into concrete steps. The smaller
          tasks will be planned for tomorrow, and the priority moves with them — nothing is duplicated.
        </p>
        <Field label="One smaller task per line">
          <Textarea
            value={titles}
            onChange={(e) => setTitles(e.target.value)}
            placeholder={'Book the venue\nSend the invitations'}
            className="min-h-28"
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}
