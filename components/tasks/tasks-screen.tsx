'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { IconPlus, IconTasks } from '@/components/ui/icons';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/page-header';
import { TaskRow } from './task-row';
import { TaskFormModal } from './task-form-modal';
import { relativeDay, todayISO, addDays, isoWeekKey } from '@/lib/dates';
import { dailyPriorityTimerTaskId } from '@/lib/selectors';
import type { Task } from '@/lib/types';

type FilterId = 'all' | 'today' | 'upcoming' | 'unscheduled' | 'someday' | 'completed' | 'cancelled';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'unscheduled', label: 'Unscheduled' },
  { id: 'someday', label: 'Someday' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

export function TasksScreen() {
  const { data } = useData();
  const [filter, setFilter] = useState<FilterId>('all');
  const [projectFilter, setProjectFilter] = useState('');
  const [goalFilter, setGoalFilter] = useState('');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const today = todayISO();
  const tomorrow = addDays(today, 1);

  const filtered = useMemo(() => {
    // Today's priority already has its own card. Older priority timer Tasks are
    // left visible here so an unfinished session can still be resumed later.
    const priorityTimerTaskIds = new Set(
      data.dailyPriorities.filter((p) => p.date === today).map((p) => dailyPriorityTimerTaskId(p.id)),
    );
    let list = data.tasks.filter((t) => !t.archived && !priorityTimerTaskIds.has(t.id));

    if (filter === 'today') list = list.filter((t) => t.scheduledDate === today && t.status !== 'completed' && t.status !== 'cancelled');
    else if (filter === 'upcoming') list = list.filter((t) => t.scheduledDate !== undefined && t.scheduledDate > today && t.status !== 'completed' && t.status !== 'cancelled');
    else if (filter === 'unscheduled') list = list.filter((t) => t.scheduledDate === undefined && t.status !== 'someday' && t.status !== 'completed' && t.status !== 'cancelled');
    else if (filter === 'someday') list = list.filter((t) => t.status === 'someday');
    else if (filter === 'completed') list = list.filter((t) => t.status === 'completed');
    else if (filter === 'cancelled') list = list.filter((t) => t.status === 'cancelled');
    // 'all' keeps every status visible.

    if (projectFilter) list = list.filter((t) => t.projectId === projectFilter);
    if (goalFilter) list = list.filter((t) => t.goalId === goalFilter || (t.projectId && data.projects.find((p) => p.id === t.projectId)?.goalId === goalFilter));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [data.tasks, data.dailyPriorities, data.projects, filter, projectFilter, goalFilter, query, today]);

  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of filtered) {
      // Completed tasks collect under a dedicated "__completed__" bucket that
      // is ordered most-recent-first. Pending tasks keep their existing date /
      // priority grouping.
      const key =
        task.status === 'completed'
          ? '__completed__'
          : task.scheduledDate ?? (task.status === 'someday' ? 'someday' : 'none');
      const arr = map.get(key) ?? [];
      arr.push(task);
      map.set(key, arr);
    }
    const order = [...map.entries()].sort(([a], [b]) => {
      if (a === '__completed__') return 1;
      if (b === '__completed__') return -1;
      if (a === 'someday') return 1;
      if (b === 'someday') return -1;
      if (a === 'none') return 1;
      if (b === 'none') return -1;
      return a < b ? -1 : 1;
    });

    const byCompletedDesc = (x: Task, y: Task): number => {
      const xt = x.completedAt ? Date.parse(x.completedAt) : NaN;
      const yt = y.completedAt ? Date.parse(y.completedAt) : NaN;
      const xv = Number.isNaN(xt) ? 0 : xt;
      const yv = Number.isNaN(yt) ? 0 : yt;
      if (xv !== yv) return yv - xv; // newest first; null timestamps go last (0)
      return y.createdAt.localeCompare(x.createdAt); // stable tiebreak
    };

    const activeSort = (x: Task, y: Task): number => {
      const w = { high: 0, medium: 1, low: 2 } as const;
      return w[x.priority] - w[y.priority];
    };

    return order.map(([key, tasks]) => ({
      key,
      label:
        key === '__completed__'
          ? 'Completed'
          : key === 'someday'
            ? 'Someday'
            : key === 'none'
              ? 'Unscheduled'
              : relativeDay(key),
      tasks:
        key === '__completed__'
          ? [...tasks].sort(byCompletedDesc)
          : [...tasks].sort(activeSort),
    }));
  }, [filtered]);

  const activeProjects = data.projects.filter((p) => p.status !== 'archived');
  const activeGoals = data.goals.filter((g) => g.status !== 'archived');

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
      <PageHeader
        title="Tasks"
        subtitle="Everything you have committed to — planned, in progress, waiting or done."
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <IconPlus width={16} height={16} />
            Add Task
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <Tabs items={FILTERS} active={filter} onChange={(id) => setFilter(id as FilterId)} />
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="h-10 w-44 sm:w-52"
          />
          <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="h-10 w-40">
            <option value="">All projects</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)} className="h-10 w-40">
            <option value="">All goals</option>
            {activeGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<IconTasks width={24} height={24} />}
          title="No tasks here"
          hint="Tasks you create will show up in this list. A title is all you need — dates, projects and deadlines are optional."
          action={
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <IconPlus width={15} height={15} />
              Add Task
            </Button>
          }
        />
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-1 flex items-baseline justify-between px-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">{group.label}</h2>
                <span className="text-[11px] tabular-nums text-ink-3">{group.tasks.length}</span>
              </div>
              <div className="space-y-0.5">
                {group.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-[11px] text-ink-3">
        Week {isoWeekKey(today).split('-W')[1]} · {filtered.length} task{filtered.length === 1 ? '' : 's'} in view ·{' '}
        {data.tasks.filter((t) => t.scheduledDate === tomorrow && t.status !== 'completed').length} planned for tomorrow
      </p>

      <TaskFormModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
