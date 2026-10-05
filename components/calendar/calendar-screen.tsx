'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { useNow } from '@/components/tasks/use-now';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconCheck, IconChevronLeft, IconChevronRight, IconFlag, IconFlame, IconPlus } from '@/components/ui/icons';
import { PageHeader } from '@/components/layout/page-header';
import { TaskList } from '@/components/tasks/task-list';
import { TaskFormModal } from '@/components/tasks/task-form-modal';
import {
  addDays,
  addMonths,
  calendarGridStart,
  formatFocusedTime,
  formatLongDate,
  monthKey,
  monthName,
  parseISODate,
  todayISO,
} from '@/lib/dates';
import {
  focusedTimeInMonth,
  focusedTimeOnDate,
  monthlyWellbeingTotals,
  wellbeingCompletedCount,
} from '@/lib/selectors';
import { isTimerRunning } from '@/lib/timer';
import type { ISODate, Task, WellbeingDay, WellbeingHabit } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The four daily well-being check-ins as shown on the Calendar: the same
 * records as Today and Review — never a second tracking system.
 */
const WELLBEING_ROWS: { habit: WellbeingHabit; symbol: string; label: string }[] = [
  { habit: 'jogging', symbol: '🏃', label: 'Jogging' },
  { habit: 'nitnemMorning', symbol: '☀', label: 'Nitnem Morning' },
  { habit: 'nitnemEvening', symbol: '◐', label: 'Nitnem Evening' },
  { habit: 'nitnemNight', symbol: '☾', label: 'Nitnem Night' },
];

/**
 * A simple calendar — scheduled tasks, deadlines, priorities and completed
 * work at a glance. Not a Google Calendar replacement; just orientation.
 *
 * Well-being appears quietly at three levels, all read from the same
 * wellbeing_days source: tiny dots on each day, the selected day's four
 * check-ins in the day detail, and the displayed month's totals below.
 */
export function CalendarScreen() {
  const { data } = useData();
  const [anchor, setAnchor] = useState(todayISO());
  const [selected, setSelected] = useState<ISODate>(todayISO());
  const [addOpen, setAddOpen] = useState(false);

  const gridStart = calendarGridStart(anchor);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const today = todayISO();
  const anchorMonth = monthKey(anchor);

  // One record per day (first one wins — records are unique by date, this is
  // just a cheap guard so a day could never be read twice).
  const wellbeingByDay = useMemo(() => {
    const map = new Map<ISODate, WellbeingDay>();
    for (const w of data.wellbeingDays) if (!map.has(w.date)) map.set(w.date, w);
    return map;
  }, [data.wellbeingDays]);

  // The displayed month's totals — derived locally from records already
  // loaded with the app; no per-day fetching.
  const wellbeingSummary = useMemo(
    () => monthlyWellbeingTotals(data.wellbeingDays, anchorMonth),
    [data.wellbeingDays, anchorMonth],
  );
  const selectedWellbeing = wellbeingByDay.get(selected);

  const byDay = useMemo(() => {
    const map = new Map<ISODate, { scheduled: Task[]; deadlines: Task[]; priority: boolean }>();
    const entry = (d: ISODate) => {
      let e = map.get(d);
      if (!e) {
        e = { scheduled: [], deadlines: [], priority: false };
        map.set(d, e);
      }
      return e;
    };
    for (const t of data.tasks) {
      if (t.archived) continue;
      if (t.scheduledDate) entry(t.scheduledDate).scheduled.push(t);
      if (t.dueDate && t.status !== 'completed' && t.status !== 'cancelled') entry(t.dueDate).deadlines.push(t);
    }
    for (const p of data.dailyPriorities) {
      entry(p.date).priority = true;
    }
    return map;
  }, [data.tasks, data.dailyPriorities]);

  /**
   * The selected day's Focused time — how long FocusDesk's task timers
   * actually ran on that day. It is attributed from the recorded runs (not
   * from any task's lifetime total), so a task worked on two days reports
   * each day separately, and a run that crossed midnight is divided between
   * the two days it touched.
   *
   * A running timer contributes its uncheckpointed remainder too, so the
   * number stays truthful live; the clock below only ticks while something is
   * actually running.
   */
  const timerRunning = useMemo(() => data.tasks.some((t) => !t.archived && isTimerRunning(t)), [data.tasks]);
  const now = useNow(timerRunning);
  const focusedDay = useMemo(
    () => focusedTimeOnDate(data, selected, now),
    [data, selected, now],
  );
  // The month summary reads the completed tasks' own timer totals
  // (`actualDurationSeconds`, finalized on Finish) against their `completedAt`
  // local dates — the authoritative task records, not the live clock.
  const focusedMonth = useMemo(
    () => focusedTimeInMonth(data, anchorMonth),
    [data, anchorMonth],
  );

  const selectedDayTasks = data.tasks.filter((t) => t.scheduledDate === selected && !t.archived);
  const selectedDeadlines = data.tasks.filter(
    (t) => t.dueDate === selected && t.status !== 'completed' && t.status !== 'cancelled' && !t.archived,
  );
  const selectedPriority = data.dailyPriorities.find((p) => p.date === selected);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-10 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
      <PageHeader
        title="Calendar"
        subtitle="Scheduled tasks, deadlines and priorities — a calm overview of your days."
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <IconPlus width={16} height={16} />
            Add Task
          </Button>
        }
      />

      {/* Month navigation */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setAnchor(addMonths(anchor, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          aria-label="Previous month"
        >
          <IconChevronLeft width={17} height={17} />
        </button>
        <p className="min-w-0 truncate text-center text-[15px] font-semibold text-ink sm:min-w-36">
          {monthName(anchor)} {anchor.slice(0, 4)}
        </p>
        <button
          onClick={() => setAnchor(addMonths(anchor, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          aria-label="Next month"
        >
          <IconChevronRight width={17} height={17} />
        </button>
        <Button variant="ghost" size="sm" onClick={() => { setAnchor(todayISO()); setSelected(todayISO()); }}>
          Today
        </Button>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="grid grid-cols-7 border-b border-line bg-surface-2/50">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = monthKey(day) === anchorMonth;
            const isToday = day === today;
            const isSelected = day === selected;
            const entry = byDay.get(day);
            const wellbeingDone = wellbeingCompletedCount(wellbeingByDay.get(day));
            return (
              <button
                key={day}
                onClick={() => setSelected(day)}
                className={`relative min-h-[84px] border-b border-r border-line px-1.5 py-1.5 text-left transition-colors last:border-r-0 ${
                  isSelected ? 'bg-accent-soft/50' : 'hover:bg-surface-2/60'
                } ${!inMonth ? 'opacity-40' : ''}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11.5px] font-medium tabular-nums ${
                    isToday ? 'bg-accent text-white' : 'text-ink-2'
                  }`}
                >
                  {parseISODate(day).getDate()}
                </span>

                {entry?.priority ? (
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-accent">
                    <IconFlame width={10} height={10} />
                    <span className="truncate">Priority</span>
                  </div>
                ) : null}

                {(entry?.scheduled ?? []).slice(0, entry?.priority ? 2 : 3).map((t) => (
                  <div
                    key={t.id}
                    className={`mt-0.5 truncate rounded bg-surface-2 px-1 py-px text-[10px] leading-4 ${
                      t.status === 'completed' ? 'text-ink-3 line-through' : 'text-ink-2'
                    }`}
                  >
                    {t.title}
                  </div>
                ))}

                {(entry?.deadlines ?? []).slice(0, 1).map((t) => (
                  <div key={`d-${t.id}`} className="mt-0.5 flex items-center gap-0.5 truncate text-[10px] font-medium text-danger">
                    <IconFlag width={9} height={9} />
                    <span className="truncate">{t.title}</span>
                  </div>
                ))}

                {entry && entry.scheduled.length + entry.deadlines.length > (entry.priority ? 3 : 4) ? (
                  <div className="mt-0.5 text-[9.5px] text-ink-3">
                    +{entry.scheduled.length + entry.deadlines.length - (entry.priority ? 3 : 4)} more
                  </div>
                ) : null}

                {/* Well-being history: one tiny dot per completed check-in —
                    quick visual only, the details live in the day detail. */}
                {wellbeingDone > 0 ? (
                  <span
                    aria-hidden="true"
                    data-wellbeing-count={wellbeingDone}
                    className="absolute bottom-1.5 right-1.5 flex gap-[3px]"
                  >
                    {Array.from({ length: wellbeingDone }, (_, i) => (
                      <span key={i} className="h-[3px] w-[3px] rounded-full bg-ink-3/70" />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Monthly focused time — two plain facts for the displayed month,
          from the tasks completed in it and their recorded timer totals. No
          score, no target, no trend: just how long the timers ran. */}
      <section aria-labelledby="calendar-focused-month-heading" className="mt-5">
        <h2 id="calendar-focused-month-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          {monthName(anchor)} {anchor.slice(0, 4)}
        </h2>
        <div data-focused-month className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-[13px]">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-ink-2">Focused time</span>
            <span className="font-medium tabular-nums text-ink">
              {focusedMonth.seconds > 0 ? formatFocusedTime(focusedMonth.seconds) : '—'}
            </span>
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-ink-2">Days worked</span>
            <span className="font-medium tabular-nums text-ink">{focusedMonth.daysWorked}</span>
          </span>
        </div>
      </section>

      {/* Monthly well-being summary — four calm totals for the displayed
          month, from the same wellbeing_days records as the day dots. */}
      <section aria-labelledby="calendar-wellbeing-summary-heading" className="mt-5">
        <h2 id="calendar-wellbeing-summary-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Well-being — {monthName(anchor)} {anchor.slice(0, 4)}
        </h2>
        {/* One compact row on wide screens; wraps naturally when narrow. */}
        <div data-wellbeing-summary className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
          {WELLBEING_ROWS.map((row) => {
            const count = wellbeingSummary[row.habit];
            return (
              <div key={row.habit} className="inline-flex items-baseline gap-1.5 text-[13px]">
                <span aria-hidden="true" className="shrink-0 text-[11px] leading-none">{row.symbol}</span>
                <span className="text-ink-2">{row.label}</span>
                <span className="tabular-nums text-ink-3">
                  {count} {count === 1 ? 'day' : 'days'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Day detail */}
      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-ink">{formatLongDate(selected)}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {selected === today ? <Badge tone="accent">Today</Badge> : null}
              {selectedPriority ? <Badge tone="accent">🔥 {selectedPriority.completed ? 'Priority done' : 'Priority set'}</Badge> : null}
              {selectedDayTasks.length > 0 ? <Badge tone="neutral">{selectedDayTasks.length} task{selectedDayTasks.length === 1 ? '' : 's'}</Badge> : null}
              {selectedDeadlines.length > 0 ? <Badge tone="danger">{selectedDeadlines.length} deadline{selectedDeadlines.length === 1 ? '' : 's'}</Badge> : null}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
            <IconPlus width={15} height={15} />
            Add task on this day
          </Button>
        </div>

        {selectedPriority ? (
          <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
            <IconFlame width={15} height={15} className="shrink-0 text-accent" />
            <p className={`text-[13.5px] font-medium ${selectedPriority.completed ? 'text-ink-3 line-through' : 'text-ink'}`}>
              {selectedPriority.title}
            </p>
            <Badge tone="muted">Daily priority</Badge>
          </div>
        ) : null}

        {/* Focused time for the selected day — the headline, then which
            tasks it came from. Hidden entirely on a day with no recorded
            runs, so the Calendar stays the Calendar. */}
        {focusedDay.seconds > 0 ? (
          <div data-focused-day className="mb-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Focused time</span>
              <span className="text-[19px] font-semibold tabular-nums leading-tight text-ink">
                {formatFocusedTime(focusedDay.seconds)}
              </span>
            </div>
            {focusedDay.byTask.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {focusedDay.byTask.map((entry) => (
                  <li key={entry.task.id} className="flex items-baseline justify-between gap-4 text-[12.5px]">
                    <span className="truncate text-ink-2">{entry.task.title}</span>
                    <span className="shrink-0 tabular-nums text-ink-3">{formatFocusedTime(entry.seconds)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-[11px] text-ink-3">Time recorded by FocusDesk task timers.</p>
          </div>
        ) : null}

        {/* Well-being — the selected day's four check-ins, exactly as recorded
            on Today/Review. Every day counts as a real day, even 0 of 4. */}
        <div data-wellbeing-day className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Well-being</span>
          {WELLBEING_ROWS.map((row) => {
            const done = selectedWellbeing?.[row.habit] ?? false;
            return (
              <span
                key={row.habit}
                className={`inline-flex items-center gap-1.5 text-[12.5px] ${done ? 'text-ink-2' : 'text-ink-3/50'}`}
              >
                <span aria-hidden="true" className="text-[11px] leading-none">{row.symbol}</span>
                {row.label}
                {done ? <IconCheck width={11} height={11} className="text-accent" /> : null}
              </span>
            );
          })}
          <span className="ml-auto text-[11px] tabular-nums text-ink-3">
            {wellbeingCompletedCount(selectedWellbeing)} of {WELLBEING_ROWS.length} completed
          </span>
        </div>

        {selectedDayTasks.length > 0 ? <TaskList tasks={selectedDayTasks} showDates={false} /> : null}

        {selectedDeadlines.filter((t) => t.scheduledDate !== selected).length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Deadlines on this day</p>
            <TaskList tasks={selectedDeadlines.filter((t) => t.scheduledDate !== selected)} />
          </div>
        ) : null}

        {!selectedPriority && selectedDayTasks.length === 0 && selectedDeadlines.length === 0 && focusedDay.seconds === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-[13px] text-ink-3">
            Nothing planned for this day. A clear day is allowed.
          </p>
        ) : null}
      </section>

      <TaskFormModal open={addOpen} onClose={() => setAddOpen(false)} defaults={{ scheduledDate: selected }} />
    </div>
  );
}
