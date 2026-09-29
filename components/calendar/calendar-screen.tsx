'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconChevronLeft, IconChevronRight, IconFlag, IconFlame, IconPlus } from '@/components/ui/icons';
import { PageHeader } from '@/components/layout/page-header';
import { TaskList } from '@/components/tasks/task-list';
import { TaskFormModal } from '@/components/tasks/task-form-modal';
import {
  addDays,
  addMonths,
  calendarGridStart,
  formatLongDate,
  monthKey,
  monthName,
  parseISODate,
  todayISO,
} from '@/lib/dates';
import type { ISODate, Task } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * A simple calendar — scheduled tasks, deadlines, priorities and completed
 * work at a glance. Not a Google Calendar replacement; just orientation.
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

  const selectedDayTasks = data.tasks.filter((t) => t.scheduledDate === selected && !t.archived);
  const selectedDeadlines = data.tasks.filter(
    (t) => t.dueDate === selected && t.status !== 'completed' && t.status !== 'cancelled' && !t.archived,
  );
  const selectedPriority = data.dailyPriorities.find((p) => p.date === selected);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
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
        <p className="min-w-36 text-center text-[15px] font-semibold text-ink">
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
              </button>
            );
          })}
        </div>
      </div>

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

        {selectedDayTasks.length > 0 ? <TaskList tasks={selectedDayTasks} showDates={false} /> : null}

        {selectedDeadlines.filter((t) => t.scheduledDate !== selected).length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Deadlines on this day</p>
            <TaskList tasks={selectedDeadlines.filter((t) => t.scheduledDate !== selected)} />
          </div>
        ) : null}

        {!selectedPriority && selectedDayTasks.length === 0 && selectedDeadlines.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-[13px] text-ink-3">
            Nothing planned for this day. A clear day is allowed.
          </p>
        ) : null}
      </section>

      <TaskFormModal open={addOpen} onClose={() => setAddOpen(false)} defaults={{ scheduledDate: selected }} />
    </div>
  );
}
