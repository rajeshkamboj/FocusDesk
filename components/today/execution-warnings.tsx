import Link from 'next/link';
import { overdueTasks, stalledProjects } from '@/lib/selectors';
import type { AppData, ISODate } from '@/lib/types';

/** Compact prompts to review slipped schedules and inactive projects, not scores. */
export function ExecutionWarnings({ data, date }: { data: AppData; date: ISODate }) {
  const onHoldIds = new Set(data.projects.filter((project) => project.status === 'on_hold').map((project) => project.id));
  const overdue = overdueTasks(data.tasks, date).filter((task) => !task.projectId || !onHoldIds.has(task.projectId));
  const stalled = stalledProjects(data, date);
  if (overdue.length === 0 && stalled.length === 0) return null;

  return (
    <section aria-label="Execution warnings" className="mt-4 space-y-2 break-words text-xs leading-relaxed text-ink-2">
      {overdue.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-line bg-warning-soft/60 px-4 py-3">
          <p className="font-medium text-ink">Overdue schedules · {overdue.length}</p>
          <p className="mt-1">
            {overdue.slice(0, 3).map((task) => `“${task.title}”${task.dueDate && task.dueDate < date ? ' (deadline also overdue)' : ''}`).join(', ')}
            {overdue.length > 3 ? ` · +${overdue.length - 3} more` : ''}
          </p>
          <p className="mt-1 text-ink-3">Planned before today and still open — a slipped schedule is not necessarily a missed deadline.</p>
          <Link href="/tasks" className="mt-1 inline-block rounded py-1 font-medium text-accent-ink underline underline-offset-2">Review tasks → Overdue filter</Link>
        </div>
      ) : null}
      {stalled.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-line bg-warning-soft/60 px-4 py-3">
          <p className="font-medium text-ink">Projects to revisit · {stalled.length}</p>
          <p className="mt-1">
            {stalled.slice(0, 3).map(({ project, inactiveDays, hasRecordedActivity }) =>
              `“${project.name}” (${inactiveDays} days ${hasRecordedActivity ? 'since recorded activity' : 'since creation; no recorded activity'})`,
            ).join(', ')}
            {stalled.length > 3 ? ` · +${stalled.length - 3} more` : ''}
          </p>
          <p className="mt-1 text-ink-3">Active projects with open tasks and no recorded completion or focused time for 14+ days. Work outside FocusDesk may not be recorded.</p>
          <Link href="/projects" className="mt-1 inline-block rounded py-1 font-medium text-accent-ink underline underline-offset-2">Review projects</Link>
        </div>
      ) : null}
    </section>
  );
}
