'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { ProgressBar } from '@/components/ui/card';
import { IconCheck, IconChevronLeft, IconChevronRight, IconFlame, IconPlus, IconTrash } from '@/components/ui/icons';
import { addDays, endOfWeek, formatFocusedTime, formatShortDate, isoWeekKey, startOfWeek, todayISO } from '@/lib/dates';
import { weeklyReviewStats } from '@/lib/selectors';
import type { WeeklyPriority } from '@/lib/types';

/**
 * "This week" — one primary priority, optional secondary priorities, and an
 * honest look at what actually happened. Nothing is auto-generated.
 */
export function WeeklyReview() {
  const { data, actions } = useData();
  const [anchor, setAnchor] = useState(todayISO());
  const [primaryDraft, setPrimaryDraft] = useState('');
  const [otherDraft, setOtherDraft] = useState('');
  const [deleting, setDeleting] = useState<WeeklyPriority | undefined>(undefined);

  const weekStart = startOfWeek(anchor);
  const weekEnd = endOfWeek(anchor);
  const weekKey = isoWeekKey(anchor);
  const isCurrentWeek = weekKey === isoWeekKey(todayISO());
  const isFutureWeek = weekStart > todayISO();

  const priorities = data.weeklyPriorities.filter((p) => p.week === weekKey);
  const primary = priorities.find((p) => p.primary);
  const others = priorities.filter((p) => !p.primary);

  const stats = useMemo(() => weeklyReviewStats(data, weekStart, weekEnd), [data, weekStart, weekEnd]);

  return (
    <div className="space-y-6">
      {/* Week navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setAnchor(addDays(anchor, -7))}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          aria-label="Previous week"
        >
          <IconChevronLeft width={17} height={17} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[15px] font-semibold text-ink">
            {isCurrentWeek ? 'This Week' : isFutureWeek ? 'Upcoming Week' : 'Past Week'}
          </p>
          <p className="text-[12px] text-ink-3">
            {formatShortDate(weekStart)} – {formatShortDate(weekEnd)} · Week {weekKey.split('-W')[1]}
          </p>
        </div>
        <button
          onClick={() => setAnchor(addDays(anchor, 7))}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          aria-label="Next week"
        >
          <IconChevronRight width={17} height={17} />
        </button>
        {!isCurrentWeek ? (
          <Button variant="ghost" size="sm" onClick={() => setAnchor(todayISO())}>
            Today
          </Button>
        ) : null}
      </div>

      {/* Primary weekly priority */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center gap-2 text-accent">
          <IconFlame width={16} height={16} />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em]">Primary weekly priority</h2>
        </div>

        {!primary ? (
          <form
            className="mt-4 flex flex-col gap-2.5 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              const title = primaryDraft.trim();
              if (!title) return;
              void actions.addWeeklyPriority({ week: weekKey, title, primary: true }).then(() => setPrimaryDraft(''));
            }}
          >
            <input
              value={primaryDraft}
              onChange={(e) => setPrimaryDraft(e.target.value)}
              placeholder="What is the one thing that matters most this week?"
              className="h-11 flex-1 rounded-xl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <Button type="submit" variant="primary" disabled={!primaryDraft.trim()}>
              Set Priority
            </Button>
          </form>
        ) : (
          <WeeklyPriorityRow priority={primary} onDelete={() => setDeleting(primary)} />
        )}
      </section>

      {/* Other priorities */}
      <section>
        <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Other weekly priorities
        </h3>
        {others.length > 0 ? (
          <div className="space-y-2">
            {others.map((p) => (
              <WeeklyPriorityRow key={p.id} priority={p} onDelete={() => setDeleting(p)} />
            ))}
          </div>
        ) : (
          <p className="px-1 text-[13px] text-ink-3">Add as many as you like — or keep the week to its one priority.</p>
        )}
        <form
          className="mt-2.5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const title = otherDraft.trim();
            if (!title) return;
            void actions.addWeeklyPriority({ week: weekKey, title }).then(() => setOtherDraft(''));
          }}
        >
          <input
            value={otherDraft}
            onChange={(e) => setOtherDraft(e.target.value)}
            placeholder="Another priority for this week…"
            className="h-10 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <Button type="submit" variant="secondary" disabled={!otherDraft.trim()}>
            <IconPlus width={15} height={15} />
            Add
          </Button>
        </form>
      </section>

      {/* Week in review */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3">
          {isFutureWeek ? 'Looking ahead' : 'Week in review'}
        </h2>

        {!isFutureWeek ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Tasks completed" value={stats.completed.length} />
              <Stat label="Tasks postponed" value={stats.postponedCount} />
              <Stat label="Tasks cancelled" value={stats.cancelled.length} />
              <Stat label="Daily priorities done" value={`${stats.completedDailyPriorities}/${stats.totalDailyPriorities}`} />
            </div>

            {stats.completed.length > 0 ? (
              <div className="mt-5">
                <p className="text-[13px] font-medium text-ink">
                  Completed work
                  {stats.focusedSeconds > 0 ? (
                    <span className="ml-2 text-[11.5px] font-normal tabular-nums text-ink-3">
                      {formatFocusedTime(stats.focusedSeconds)} focused
                    </span>
                  ) : null}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {stats.completed.slice(0, 8).map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-[13px] text-ink-2">
                      <IconCheck width={13} height={13} className="shrink-0 text-accent" />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {t.actualDurationSeconds != null ? (
                        <span className="shrink-0 tabular-nums text-[11.5px] text-ink-3" title="Focused time">
                          {formatFocusedTime(t.actualDurationSeconds)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {stats.completed.length > 8 ? (
                  <p className="mt-1.5 text-[11px] text-ink-3">+{stats.completed.length - 8} more</p>
                ) : null}
              </div>
            ) : null}

            {stats.projectsWorkedOn.length > 0 ? (
              <div className="mt-5">
                <p className="text-[13px] font-medium text-ink">Projects worked on</p>
                <div className="mt-2 space-y-2">
                  {stats.projectsWorkedOn.map(({ project, completed, focusedSeconds }) => (
                    <div key={project.id} className="flex items-center gap-3">
                      <span className="w-40 truncate text-[13px] text-ink-2">{project.name}</span>
                      <ProgressBar
                        done={completed}
                        total={Math.max(completed, data.tasks.filter((t) => t.projectId === project.id).length)}
                        className="max-w-40"
                      />
                      <span className="text-[11px] tabular-nums text-ink-3">
                        {completed} done
                        {focusedSeconds > 0 ? ` · ${formatFocusedTime(focusedSeconds)}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
            Set what matters above — the review will fill in once this week has happened. Nothing is generated for you.
          </p>
        )}
      </section>

      <ConfirmDialog
        open={deleting !== undefined}
        title="Remove priority?"
        message={`“${deleting?.title ?? ''}” will be removed from week ${weekKey.split('-W')[1]}.`}
        confirmLabel="Remove"
        danger
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => {
          if (deleting) void actions.deleteWeeklyPriority(deleting.id);
          setDeleting(undefined);
        }}
      />
    </div>
  );
}

function WeeklyPriorityRow({ priority, onDelete }: { priority: WeeklyPriority; onDelete: () => void }) {
  const { actions } = useData();
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <button
        onClick={() => void actions.toggleWeeklyPriority(priority.id)}
        aria-label={priority.completed ? 'Reopen priority' : 'Complete priority'}
        className={`mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border transition-all duration-150 ${
          priority.completed ? 'border-accent bg-accent text-white' : 'border-line-strong hover:border-accent hover:bg-accent-soft'
        }`}
      >
        {priority.completed ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 5 5L20 7" />
          </svg>
        ) : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] leading-snug ${priority.completed ? 'text-ink-3 line-through' : 'text-ink'}`}>{priority.title}</p>
        {priority.primary && !priority.completed ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent">
            <IconFlame width={11} height={11} /> The one thing
          </p>
        ) : null}
      </div>
      <button
        onClick={onDelete}
        aria-label="Remove priority"
        className="rounded-lg p-1.5 text-ink-3 opacity-0 transition-all hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <IconTrash width={15} height={15} />
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
