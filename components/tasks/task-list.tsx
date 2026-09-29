'use client';

import type { ReactNode } from 'react';
import type { Task } from '@/lib/types';
import { TaskRow } from './task-row';

export function TaskList({ tasks, showDates = true }: { tasks: Task[]; showDates?: boolean }) {
  return (
    <div className="space-y-0.5">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} showDate={showDates} />
      ))}
    </div>
  );
}

export function TaskSection({
  title,
  hint,
  tasks,
  action,
  showDates = true,
}: {
  title: string;
  hint?: string;
  tasks: Task[];
  action?: ReactNode;
  showDates?: boolean;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">{title}</h2>
          {hint ? <span className="text-[11px] text-ink-3">{hint}</span> : null}
          <span className="text-[11px] tabular-nums text-ink-3">{tasks.length}</span>
        </div>
        {action}
      </div>
      {tasks.length > 0 ? (
        <TaskList tasks={tasks} showDates={showDates} />
      ) : (
        <p className="px-3 py-1.5 text-[13px] text-ink-3">Nothing here.</p>
      )}
    </section>
  );
}
