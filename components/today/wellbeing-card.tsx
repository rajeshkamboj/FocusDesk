'use client';

import { useData } from '@/components/data/data-provider';
import { todayISO } from '@/lib/dates';
import { wellbeingCompletedCount, wellbeingOnDate } from '@/lib/selectors';
import type { ISODate, WellbeingHabit } from '@/lib/types';

/**
 * Daily well-being — a quiet corner of the app that asks
 * "did I take care of myself today?", not "how well did I track my habits?".
 *
 * Two habits, four check-ins, no streaks, no scores. It stays visually
 * secondary to Today's Priority and the task list on purpose.
 *
 * The check-in definitions, the Checkin control and the whole card body are
 * exported so the Review page can show (and correct) the exact same four
 * check-ins for past days.
 *
 * Layout: the card body is a container query context, so it lays itself out
 * from the space it is actually given rather than from the viewport. Wide
 * enough (the full-width card on Today below 2xl, and on Review) and
 * everything sits on one compact row; narrow (the 264px sidebar on very wide
 * screens, or any phone) and it falls back to the original stacked list.
 */

export interface CheckinDef {
  habit: WellbeingHabit;
  label: string;
}

export const JOGGING: CheckinDef = { habit: 'jogging', label: 'Jogging' };

export const NITNEM: CheckinDef[] = [
  { habit: 'nitnemMorning', label: 'Morning' },
  { habit: 'nitnemEvening', label: 'Evening' },
  { habit: 'nitnemNight', label: 'Night' },
];

export const ALL_CHECKINS: CheckinDef[] = [JOGGING, ...NITNEM];

/**
 * One check-in: the whole control is the tap target. Full-width row when the
 * card is narrow, a compact inline chip once there is room for a single row.
 */
export function Checkin({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2 @md:w-auto @md:shrink-0 @md:gap-2 @md:px-2"
    >
      <span
        aria-hidden="true"
        className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
          checked
            ? 'border-accent/60 bg-accent-soft text-accent-ink'
            : 'border-line-strong bg-surface group-hover:border-ink-3'
        }`}
      >
        {checked ? (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12 5 5L20 7" />
          </svg>
        ) : null}
      </span>
      <span className={`text-[13.5px] leading-snug ${checked ? 'text-ink-2' : 'text-ink'}`}>{label}</span>
    </button>
  );
}

/** A hairline separator between groups — only drawn in the one-row layout. */
function RowDivider() {
  return <span aria-hidden="true" className="hidden h-4 w-px shrink-0 bg-line @md:block" />;
}

/**
 * The four check-ins plus the "n of 4 completed" count, for one day.
 * `date` is passed straight through to the existing toggle action — omitted
 * on Today (which means "today"), explicit on Review.
 */
export function WellbeingChecklist({ date, headingId }: { date?: ISODate; headingId: string }) {
  const { data, actions } = useData();
  const day = wellbeingOnDate(data.wellbeingDays, date ?? todayISO());
  const completed = wellbeingCompletedCount(day);

  return (
    <div className="@container">
      <div className="flex flex-col @md:flex-row @md:flex-wrap @md:items-center @md:gap-x-3 @md:gap-y-1">
        <h2
          id={headingId}
          className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 @md:shrink-0 @md:px-0"
        >
          Daily well-being
        </h2>

        <RowDivider />

        <div className="mt-2.5 @md:mt-0 @md:shrink-0">
          <Checkin
            label={JOGGING.label}
            checked={day?.jogging ?? false}
            onToggle={() => void actions.toggleWellbeing(JOGGING.habit, date)}
          />
        </div>

        <RowDivider />

        <div className="mt-2.5 @md:mt-0 @md:flex @md:min-w-0 @md:items-center @md:gap-1.5">
          <p className="px-1.5 text-[12.5px] font-medium text-ink-2 @md:shrink-0 @md:px-0">
            Nitnem<span className="hidden @md:inline">:</span>
          </p>
          <div className="mt-0.5 space-y-0.5 pl-7 @md:mt-0 @md:flex @md:flex-wrap @md:items-center @md:gap-x-1 @md:space-y-0 @md:pl-0">
            {NITNEM.map((item) => (
              <Checkin
                key={item.habit}
                label={item.label}
                checked={day?.[item.habit] ?? false}
                onToggle={() => void actions.toggleWellbeing(item.habit, date)}
              />
            ))}
          </div>
        </div>

        <p className="mt-3.5 border-t border-line pt-3 text-[11px] tabular-nums text-ink-3 @md:mt-0 @md:ml-auto @md:shrink-0 @md:border-0 @md:pt-0 @md:pl-3">
          {completed} of {ALL_CHECKINS.length} completed
        </p>
      </div>
    </div>
  );
}

export function WellbeingCard() {
  return (
    <section
      aria-labelledby="wellbeing-heading"
      className="rounded-2xl border border-line bg-surface px-5 py-4 shadow-card"
    >
      <WellbeingChecklist headingId="wellbeing-heading" />
    </section>
  );
}
