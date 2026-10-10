'use client';

import { formatFocusedTime } from '@/lib/dates';
import type { Project } from '@/lib/types';

export interface FocusByProjectDatum {
  project?: Project;
  seconds: number;
}

/**
 * Recorded focused time by project, as horizontal bars.
 *
 * Again plain elements: a label row plus one rounded bar. Bar length is the
 * **share of the period total**, the same number printed beside it — so the
 * length and the text always agree, and the longest bar is never mistaken for
 * "all my time" when it is simply the largest slice.
 *
 * Honesty rules baked into this component:
 *
 *  - Time comes from timer sessions inside the period, never from a completed
 *    task's lifetime `actualDurationSeconds`. A task worked across four weeks
 *    contributes the four chunks it actually recorded, not its whole total
 *    four times over.
 *  - Work with no project is a real row labelled "No project" — never dropped,
 *    never hidden behind a filter. It includes daily-priority timer tasks.
 *  - `orphanedTaskCount` names how many of those tasks point at a project that
 *    has since been deleted. Their seconds are real; only the link is gone, and
 *    the footnote says exactly that rather than inventing a project for them.
 *  - Attribution uses **current** relationships, so re-parenting a task moves
 *    its whole recorded history. That is disclosed in the surrounding copy.
 */
export function FocusByProjectChart({
  rows,
  total,
  orphanedTaskCount = 0,
  className = '',
}: {
  rows: FocusByProjectDatum[];
  total: number;
  orphanedTaskCount?: number;
  className?: string;
}) {
  const visible = rows.filter((row) => row.seconds > 0);
  if (visible.length === 0) return null;

  return (
    <div className={className}>
      <ul data-focus-by-project-chart role="list" className="space-y-2.5">
        {visible.map(({ project, seconds }) => {
          const name = project?.name ?? 'No project';
          const share = total > 0 ? (seconds / total) * 100 : 0;
          return (
            <li key={project?.id ?? 'unassigned'} data-focus-bar={project?.id ?? 'unassigned'}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[12.5px] text-ink-2" title={name}>
                  {name}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-ink">
                  {formatFocusedTime(seconds)}
                  <span className="text-ink-3"> · {Math.round(share)}%</span>
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-3"
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${share}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
        <span className="text-[12px] font-medium text-ink">Total recorded</span>
        <span data-focus-total className="text-[12px] font-semibold tabular-nums text-ink">
          {formatFocusedTime(total)}
        </span>
      </div>

      {orphanedTaskCount > 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
          &ldquo;No project&rdquo; includes {orphanedTaskCount}{' '}
          {orphanedTaskCount === 1 ? 'task' : 'tasks'} whose project no longer exists. The recorded
          time is real — only the link is missing, so it cannot be attributed back.
        </p>
      ) : null}
    </div>
  );
}
