'use client';

import Link from 'next/link';
import { ProgressSegments } from './progress-segments';
import { useLocalDate } from '@/lib/use-local-date';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { useData } from '@/components/data/data-provider';
import { Button } from '@/components/ui/button';
import { IconChevronDown, IconPlus, IconTasks, IconClock, IconFlag } from '@/components/ui/icons';
import { TaskSection, TaskList } from '@/components/tasks/task-list';
import { TaskFormModal } from '@/components/tasks/task-form-modal';
import { ExecutionWarnings } from './execution-warnings';
import { PriorityCard } from './priority-card';
import { WellbeingCard } from './wellbeing-card';
import { formatDuration, formatLongDate, todayISO, weekdayName, daysBetween } from '@/lib/dates';
import { isOpenTask, overdueTasks, tasksWithApproachingDeadline } from '@/lib/selectors';
import { getUserDisplayName } from '@/lib/auth/display-name';

export function TodayScreen() {
  const { user } = useAuth();
  const { data } = useData();
  const today = useLocalDate(todayISO());
  const [addOpen, setAddOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  // Defer any client-only, time-dependent rendering until after mount so SSR
  // and the first client paint produce identical markup (no hydration mismatch).
  // useSyncExternalStore is used for the mounted flag to satisfy the React
  // "no setState in effects" lint rule — the server snapshot is false, and the
  // client subscribes and immediately returns true.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const displayName = getUserDisplayName(user, data.settings.general.displayName);
  const greeting = mounted
    ? (() => {
        const h = new Date().getHours();
        return h < 12
          ? `Good morning, ${displayName}`
          : h < 18
            ? `Good afternoon, ${displayName}`
            : `Good evening, ${displayName}`;
      })()
    : 'Welcome back';

  const todays = useMemo(
    () => data.tasks.filter((t) => t.scheduledDate === today && t.status !== 'cancelled'),
    [data.tasks, today],
  );

  const openTasks = todays.filter(isOpenTask);
  const completedTasks = useMemo(() => {
    const list = todays.filter((t) => t.status === 'completed');
    return list.sort((a, b) => {
      const at = a.completedAt ? Date.parse(a.completedAt) : NaN;
      const bt = b.completedAt ? Date.parse(b.completedAt) : NaN;
      const av = Number.isNaN(at) ? 0 : at;
      const bv = Number.isNaN(bt) ? 0 : bt;
      if (av !== bv) return bv - av;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [todays]);

  const priority = openTasks.filter((t) => t.priority === 'high');
  const other = openTasks.filter((t) => t.priority === 'medium');
  const optional = openTasks.filter((t) => t.priority === 'low');

  const done = completedTasks.length;
  const total = todays.length;
  const totalMinutes = openTasks.reduce((sum, t) => sum + (t.estimatedDuration ?? 0), 0);

  // A slipped task appears once: in ExecutionWarnings, with an explicit
  // "deadline also overdue" note if both dates slipped. Deadline-only
  // warnings stay here. On-hold projects and Someday tasks are not nudged.
  const overdueScheduleIds = new Set(overdueTasks(data.tasks, today).map((task) => task.id));
  const onHoldProjectIds = new Set(data.projects.filter((project) => project.status === 'on_hold').map((project) => project.id));
  const approaching = tasksWithApproachingDeadline(data.tasks, 3, today).filter(
    (task) => task.scheduledDate !== today && !overdueScheduleIds.has(task.id)
      && (!task.projectId || !onHoldProjectIds.has(task.projectId)),
  );

  const dayName = weekdayName(today);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-10 pt-8 sm:px-8 sm:pb-16 sm:pt-10 xl:max-w-6xl">
      {/* Header */}
      <header className="mb-8">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_290px] sm:items-start sm:gap-x-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3 [overflow-wrap:anywhere]">{greeting}</p>
            <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-ink">
              Today <span className="font-normal text-ink-3">— {dayName}</span>
            </h1>
            <p className="mt-1 text-sm text-ink-2">{formatLongDate(today)}</p>
          </div>
          <div className="w-full min-w-0 sm:justify-self-end">
            <ProgressSegments done={done} total={total} />
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
              {approaching.length === 1 ? 'A deadline needs attention: ' : `${approaching.length} deadlines need attention: `}
              {approaching
                .slice(0, 3)
                .map((t) => `“${t.title}” (${daysBetween(today, t.dueDate!) < 0 ? `${-daysBetween(today, t.dueDate!)} days overdue` : daysBetween(today, t.dueDate!) === 0 ? 'due today' : `in ${daysBetween(today, t.dueDate!)} days`})`)
                .join(', ')}
            </p>
          </div>
        ) : null}
        <ExecutionWarnings data={data} date={today} />
      </header>

      {/* Priority, well-being, tasks and review all sit on the same master grid.
          On smaller screens the two columns collapse into the natural document flow. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_290px] xl:items-start xl:gap-x-8">
        {/* Priority */}
        <div className="xl:col-start-1 xl:row-start-1">
          <PriorityCard />
        </div>

        {/* Daily well-being — quiet and secondary, never a task list */}
        <aside className="mt-9 xl:col-start-2 xl:row-start-1 xl:mt-0">
          <WellbeingCard />
        </aside>

        {/* Tasks */}
        <div className="mt-9 space-y-6 xl:col-start-1 xl:row-start-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Today&apos;s tasks</h2>
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
              <IconPlus width={15} height={15} />
              Add Task
            </Button>
          </div>

          {openTasks.length === 0 && completedTasks.length === 0 ? (
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
              {priority.length > 0 ? <TaskSection title="Priority" hint="important" tasks={priority} showDates={false} /> : null}
              {other.length > 0 ? <TaskSection title="Other tasks" hint="normal" tasks={other} showDates={false} /> : null}
              {optional.length > 0 ? <TaskSection title="Optional" hint="less important" tasks={optional} showDates={false} /> : null}
              {completedTasks.length > 0 ? (
                <section>
                  <button
                    type="button"
                    onClick={() => setShowCompleted((v) => !v)}
                    className="mb-1.5 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left transition-colors hover:text-ink-2"
                    aria-expanded={showCompleted}
                  >
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                        Completed today
                      </h2>
                      <span className="text-[11px] tabular-nums text-ink-3">{completedTasks.length}</span>
                    </div>
                    <IconChevronDown
                      width={14}
                      height={14}
                      className={`text-ink-3 transition-transform duration-150 ${showCompleted ? 'rotate-0' : '-rotate-90'}`}
                    />
                  </button>
                  {showCompleted ? <TaskList tasks={completedTasks} showDates={false} /> : null}
                </section>
              ) : null}
            </>
          )}
        </div>

        {/* End of day */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-6 py-5 shadow-card xl:col-start-1 xl:row-start-3">
          <div>
            <p className="text-[15px] font-medium text-ink">End-of-day review</p>
            <p className="mt-0.5 text-[13px] text-ink-2">Did you actually accomplish what mattered?</p>
          </div>
          <Link
            href="/review"
            className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
          >
            Open Daily Review
          </Link>
        </div>
      </div>

      <TaskFormModal open={addOpen} onClose={() => setAddOpen(false)} defaults={{ scheduledDate: today }} />
    </div>
  );
}
