'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/card';
import { IconPlus, IconTasks, IconClock, IconFlag } from '@/components/ui/icons';
import { TaskSection } from '@/components/tasks/task-list';
import { TaskFormModal } from '@/components/tasks/task-form-modal';
import { PriorityCard } from './priority-card';
import { formatDuration, formatLongDate, todayISO, weekdayName, daysBetween } from '@/lib/dates';
import { isOpenTask, tasksWithApproachingDeadline } from '@/lib/selectors';

export function TodayScreen() {
  const { data } = useData();
  const today = todayISO();
  const [addOpen, setAddOpen] = useState(false);

  const todays = useMemo(
    () =>
      data.tasks
        .filter((t) => t.scheduledDate === today && t.status !== 'cancelled')
        .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed')),
    [data.tasks, today],
  );

  const priority = todays.filter((t) => t.priority === 'high');
  const other = todays.filter((t) => t.priority === 'medium');
  const optional = todays.filter((t) => t.priority === 'low');

  const done = todays.filter((t) => t.status === 'completed').length;
  const total = todays.length;
  const open = todays.filter(isOpenTask);
  const totalMinutes = open.reduce((sum, t) => sum + (t.estimatedDuration ?? 0), 0);

  const approaching = tasksWithApproachingDeadline(data.tasks).filter(
    (t) => t.scheduledDate !== today && isOpenTask(t),
  );

  const dayName = weekdayName(today);
  const greeting =
    new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3">{greeting}</p>
            <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-ink">
              Today <span className="font-normal text-ink-3">— {dayName}</span>
            </h1>
            <p className="mt-1 text-sm text-ink-2">{formatLongDate(today)}</p>
          </div>
          <div className="w-full max-w-48">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-3">
              <span>Progress</span>
              <span className="font-medium tabular-nums text-ink-2">
                {done} of {total} done
              </span>
            </div>
            <ProgressBar done={done} total={total} />
            {totalMinutes > 0 ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-ink-3">
                <IconClock width={12} height={12} />
                {formatDuration(totalMinutes)} of work planned
              </p>
            ) : null}
          </div>
        </div>

        {approaching.length > 0 ? (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-warning-soft/60 px-4 py-3">
            <IconFlag width={15} height={15} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              {approaching.length === 1 ? 'A deadline is approaching: ' : `${approaching.length} deadlines are approaching: `}
              {approaching
                .slice(0, 3)
                .map((t) => `“${t.title}” (${daysBetween(today, t.dueDate!) === 0 ? 'today' : `in ${daysBetween(today, t.dueDate!)} days`})`)
                .join(', ')}
            </p>
          </div>
        ) : null}
      </header>

      {/* Priority */}
      <PriorityCard />

      {/* Tasks */}
      <div className="mt-9 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Today&apos;s tasks</h2>
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
            <IconPlus width={15} height={15} />
            Add Task
          </Button>
        </div>

        {todays.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <IconTasks width={22} height={22} className="mx-auto text-ink-3" />
            <p className="mt-3 text-[15px] font-medium text-ink">A clear day</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-ink-3">
              Add a task for today — a title is enough. Everything else is optional.
            </p>
            <Button variant="primary" size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
              <IconPlus width={15} height={15} />
              Add Task
            </Button>
          </div>
        ) : (
          <>
            <TaskSection title="Priority" hint="important" tasks={priority} showDates={false} />
            <TaskSection title="Other tasks" hint="normal" tasks={other} showDates={false} />
            <TaskSection title="Optional" hint="less important" tasks={optional} showDates={false} />
          </>
        )}
      </div>

      {/* End of day */}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-6 py-5 shadow-card">
        <div>
          <p className="text-[15px] font-medium text-ink">End-of-day review</p>
          <p className="mt-0.5 text-[13px] text-ink-2">Did you actually accomplish what mattered?</p>
        </div>
        <Link
          href="/review"
          className="inline-flex h-9.5 items-center rounded-xl border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
        >
          Open Daily Review
        </Link>
      </div>

      <TaskFormModal open={addOpen} onClose={() => setAddOpen(false)} defaults={{ scheduledDate: today }} />
    </div>
  );
}
