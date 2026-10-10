'use client';

import type { ReactNode } from 'react';
import type { Task } from '@/lib/types';
import { uncompletedTasksFirst } from '@/lib/selectors';
import { taskHierarchyRows } from '@/lib/task-hierarchy';
import { TaskRow } from './task-row';

export function TaskList({ tasks, showDates = true, hierarchical = false }: { tasks: Task[]; showDates?: boolean; hierarchical?: boolean }) {
  const orderedTasks = uncompletedTasksFirst(tasks);
  if (hierarchical) {
    return (
      <div aria-label="Task hierarchy" className="space-y-0.5">
        {taskHierarchyRows(orderedTasks).map(({ task, depth }) => (
          <div key={task.id} data-task-depth={depth} style={{ paddingLeft: `min(${depth * 12}px, 20%)` }}>
            {/* Keep deep trees usable on a phone without clipping task menus.
                The level and immediate-parent label disambiguate capped indentation. */}
            {depth >= 5 ? <p className="px-3 text-[10px] text-ink-3">Task level {depth + 1}</p> : null}
            <div className={depth > 0 ? 'border-l border-line' : undefined}>
              <TaskRow task={task} showDate={showDates} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {orderedTasks.map((task) => (
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
