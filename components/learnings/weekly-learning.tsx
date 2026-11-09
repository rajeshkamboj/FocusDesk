'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { IconLearnings, IconCheck, IconLink } from '@/components/ui/icons';
import { WEEKLY_DIFFICULTY_LABELS } from '@/lib/learnings-weekly';
import type { WeeklyLearningRecord, WeeklyLearningStatus } from '@/lib/types';
import { WEEKLY_LEARNING_STATUSES, WEEKLY_LEARNING_STATUS_LABELS } from '@/lib/types';
import {
  savedAssignments,
  selectWeeklyAssignment,
  weekDays,
} from '@/lib/learnings-weekly';

/**
 * This Week's Learning.
 *
 * One assignment, chosen by the week rather than by the visit, tied to one of the
 * reader's own projects, ending in a checkable outcome. Four progress states and one
 * save flag; both are stored as settings, so they survive a reload, a device change
 * and a week boundary.
 *
 * The card is deliberately opinionated about what it does *not* do: it does not
 * offer "another suggestion" (that would break the weekly promise), it does not
 * hide a completed assignment (finishing something is worth seeing), and it does not
 * scold. A reader who marks this week "not relevant" gets a different assignment
 * next week, not a warning today.
 */
export function WeeklyLearningCard({
  records,
  onDecision,
  today = new Date(),
}: {
  records: Readonly<Record<string, WeeklyLearningRecord>>;
  onDecision: (id: string, patch: { status?: WeeklyLearningStatus; savedForLater?: boolean }) => void;
  /** Injectable for tests and for a reader whose clock is ahead. */
  today?: Date;
}) {
  const selection = useMemo(() => selectWeeklyAssignment({ date: today, records }), [today, records]);
  const { assignment } = selection;
  const record = records[assignment.id];
  const status: WeeklyLearningStatus = record?.status ?? 'not-started';
  const saved = record?.savedForLater ?? false;
  const savedLater = useMemo(() => savedAssignments(records), [records]);

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="weekly-learning-heading"
        className="rounded-2xl border border-line bg-surface px-5 py-5 shadow-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <IconLearnings width={17} height={17} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">This week’s learning</p>
              <h2 id="weekly-learning-heading" className="mt-1 text-[16px] font-semibold leading-snug text-ink">
                {assignment.title}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone="accent">{assignment.projectLabel}</Badge>
                <Badge tone="neutral">{WEEKLY_DIFFICULTY_LABELS[assignment.difficulty]}</Badge>
                <span className="text-[11px] text-ink-3">about {assignment.minutes} min</span>
                <span className="text-[11px] text-ink-3">
                  · week of {formatWeek(selection.weekStart)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onDecision(assignment.id, { savedForLater: !saved })}
            aria-pressed={saved}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
              saved
                ? 'border-accent/40 bg-accent-soft text-accent-ink'
                : 'border-line bg-surface-2/60 text-ink-2 hover:text-ink'
            }`}
          >
            {saved ? 'Saved for later' : 'Save for later'}
          </button>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{assignment.why}</p>

        <div className="mt-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-3">Do this</p>
          <ol className="mt-2 space-y-2">
            {assignment.steps.map((step, index) => (
              <li key={step} className="flex min-w-0 gap-2.5">
                <span className="mt-px inline-flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-md bg-surface-2 text-[10.5px] font-semibold text-ink-2">
                  {index + 1}
                </span>
                <p className="min-w-0 break-words text-[12.5px] leading-relaxed text-ink-2">{step}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-4 rounded-xl border border-accent/30 bg-accent-soft/25 px-3.5 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent-ink">Done when</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink">{assignment.outcome}</p>
        </div>

        {assignment.resources?.length ? (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {assignment.resources.map((resource) => (
              <li key={resource.url}>
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accent hover:underline"
                >
                  <IconLink width={12} height={12} />
                  {resource.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 border-t border-line pt-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-3">Progress</p>
          <div role="group" aria-label="Progress on this week's learning" className="mt-2 flex flex-wrap gap-1.5">
            {WEEKLY_LEARNING_STATUSES.map((option) => {
              const selected = status === option;
              const done = option === 'completed';
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onDecision(assignment.id, { status: option })}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                    selected
                      ? done
                        ? 'border-accent bg-accent-soft text-accent-ink'
                        : 'border-accent/40 bg-accent-soft text-accent-ink'
                      : 'border-line bg-surface-2/50 text-ink-2 hover:text-ink'
                  }`}
                >
                  {done && selected ? <IconCheck width={12} height={12} /> : null}
                  {WEEKLY_LEARNING_STATUS_LABELS[option]}
                </button>
              );
            })}
          </div>
          {status === 'completed' ? (
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
              Completed this week. The next assignment arrives on Monday — the timeline below is still the place to
              record what you actually learned.
            </p>
          ) : null}
          {status === 'not-relevant' ? (
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
              Noted. Next week’s assignment will come from a different part of the rotation; nothing is deleted and
              you can change this answer.
            </p>
          ) : null}
          {status === 'in-progress' ? (
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
              Picked up. It stays on this card until Monday, so you can leave the tab and come back.
            </p>
          ) : null}
        </div>
      </section>

      {savedLater.length > 0 ? (
        <section aria-labelledby="saved-learning-heading" className="rounded-2xl border border-line bg-surface px-5 py-4">
          <p id="saved-learning-heading" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">
            Saved for later
          </p>
          <ul className="mt-2 divide-y divide-line">
            {savedLater.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-snug text-ink">{item.title}</p>
                  <p className="text-[11px] text-ink-3">
                    {item.projectLabel} · {WEEKLY_LEARNING_STATUS_LABELS[records[item.id]?.status ?? 'not-started']}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDecision(item.id, { savedForLater: false })}
                  className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-ink-2 hover:text-ink"
                >
                  Remove from saved
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Mon 3 Nov — short, unambiguous, and independent of the reader's locale. */
function formatWeek(weekStart: string): string {
  const [year, month, day] = weekStart.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const [, ...rest] = weekDays(weekStart);
  const end = rest[rest.length - 1];
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const format = (value: Date) =>
    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(value);
  return `${format(date)} – ${format(new Date(Date.UTC(endYear, endMonth - 1, endDay)))}`;
}
