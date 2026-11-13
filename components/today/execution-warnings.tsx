'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { IconCalendar, IconChevronDown, IconFlag, IconInbox, IconProjects } from '@/components/ui/icons';
import { overdueTasks, stalledProjects } from '@/lib/selectors';
import { daysBetween } from '@/lib/dates';
import type { AppData, ISODate, Task } from '@/lib/types';

const EXPANDED_KEY = 'focusdesk:today-notifications-expanded';
const CHANGE_EVENT = 'focusdesk:today-notifications-change';

function subscribeToPreference(onChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getExpandedSnapshot() {
  try {
    const stored = window.sessionStorage.getItem(EXPANDED_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function getServerExpandedSnapshot() {
  return true;
}

function saveExpandedPreference(expanded: boolean) {
  try {
    window.sessionStorage.setItem(EXPANDED_KEY, String(expanded));
  } catch {
    // The control still works for the current render if storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function deadlineDescription(task: Task, date: ISODate) {
  if (!task.dueDate) return task.title;
  const distance = daysBetween(date, task.dueDate);
  const timing = distance < 0
    ? `${-distance} days overdue`
    : distance === 0
      ? 'due today'
      : `in ${distance} days`;
  return `“${task.title}” (${timing})`;
}

/** One collapsible envelope for deadlines, slipped schedules and inactive projects. */
export function ExecutionWarnings({
  data,
  date,
  approaching,
}: {
  data: AppData;
  date: ISODate;
  approaching: Task[];
}) {
  const onHoldIds = new Set(data.projects.filter((project) => project.status === 'on_hold').map((project) => project.id));
  const overdue = overdueTasks(data.tasks, date).filter((task) => !task.projectId || !onHoldIds.has(task.projectId));
  const stalled = stalledProjects(data, date);

  const categories = [
    approaching.length > 0 ? 'deadlines' : null,
    overdue.length > 0 ? 'overdue schedules' : null,
    stalled.length > 0 ? 'projects to revisit' : null,
  ].filter(Boolean);
  const totalItems = approaching.length + overdue.length + stalled.length;
  const expanded = useSyncExternalStore(subscribeToPreference, getExpandedSnapshot, getServerExpandedSnapshot);

  if (totalItems === 0) return null;

  const toggle = () => saveExpandedPreference(!expanded);

  return (
    <section aria-label="Notifications" className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls="today-notifications-content"
        className="flex w-full min-w-0 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
          <IconInbox width={19} height={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink">
              {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </span>
          </span>
          <span className="mt-0.5 block text-[10px] text-ink-3 sm:hidden">
            {categories.join(' · ')}
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-2 text-[11px] text-ink-2 sm:flex">
          {approaching.length > 0 ? <span>{approaching.length} deadlines</span> : null}
          {approaching.length > 0 && (overdue.length > 0 || stalled.length > 0) ? <span>·</span> : null}
          {overdue.length > 0 ? <span>{overdue.length} overdue</span> : null}
          {overdue.length > 0 && stalled.length > 0 ? <span>·</span> : null}
          {stalled.length > 0 ? <span>{stalled.length} projects</span> : null}
        </span>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
          <IconChevronDown
            width={16}
            height={16}
            className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {expanded ? (
        <div id="today-notifications-content" className="space-y-2 px-3 pb-3 sm:px-4 sm:pb-4">
          {approaching.length > 0 ? (
            <div className="grid min-w-0 gap-2 rounded-xl border border-warning/25 bg-warning-soft/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning">
                  <IconFlag width={17} height={17} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink">Deadlines need attention <span className="ml-1 text-warning">· {approaching.length}</span></p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-2">
                    {approaching.slice(0, 3).map((task) => deadlineDescription(task, date)).join(', ')}
                    {approaching.length > 3 ? ` · +${approaching.length - 3} more` : ''}
                  </p>
                </div>
              </div>
              <Link href="/tasks" className="ml-11 inline-flex h-8 items-center justify-center rounded-lg bg-warning-soft px-3 text-[11px] font-semibold text-warning transition-colors hover:brightness-110 sm:ml-0">
                View deadlines <span className="ml-1" aria-hidden="true">→</span>
              </Link>
            </div>
          ) : null}

          {overdue.length > 0 ? (
            <div className="grid min-w-0 gap-2 rounded-xl border border-danger/20 bg-danger-soft/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-danger-soft/50 text-danger">
                  <IconCalendar width={17} height={17} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink">Overdue schedules <span className="ml-1 text-danger">· {overdue.length}</span></p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-2">
                    {overdue.slice(0, 3).map((task) => `“${task.title}”${task.dueDate && task.dueDate < date ? ' (deadline also overdue)' : ''}`).join(', ')}
                    {overdue.length > 3 ? ` · +${overdue.length - 3} more` : ''}
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-ink-3">Planned before today and still open — a slipped schedule is not necessarily a missed deadline.</p>
                </div>
              </div>
              <Link href="/tasks" className="ml-11 inline-flex h-8 items-center justify-center rounded-lg bg-danger-soft/50 px-3 text-[11px] font-semibold text-danger transition-colors hover:brightness-110 sm:ml-0">
                Review schedules <span className="ml-1" aria-hidden="true">→</span>
              </Link>
            </div>
          ) : null}

          {stalled.length > 0 ? (
            <div className="grid min-w-0 gap-2 rounded-xl border border-accent/20 bg-accent-soft/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  <IconProjects width={17} height={17} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink">Projects to revisit <span className="ml-1 text-accent">· {stalled.length}</span></p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-2">
                    {stalled.slice(0, 3).map(({ project, inactiveDays, hasRecordedActivity }) =>
                      `“${project.name}” (${inactiveDays} days ${hasRecordedActivity ? 'since recorded activity' : 'since creation; no recorded activity'})`,
                    ).join(', ')}
                    {stalled.length > 3 ? ` · +${stalled.length - 3} more` : ''}
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-ink-3">Active projects with open tasks and no recorded completion or focused time for 14+ days. Work outside Focus Desk may not be recorded.</p>
                </div>
              </div>
              <Link href="/projects" className="ml-11 inline-flex h-8 items-center justify-center rounded-lg bg-accent-soft px-3 text-[11px] font-semibold text-accent transition-colors hover:brightness-110 sm:ml-0">
                Review projects <span className="ml-1" aria-hidden="true">→</span>
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
