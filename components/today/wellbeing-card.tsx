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
 */

export interface CheckinDef {
  habit: WellbeingHabit;
  label: string;
  icon?: string;
  ariaLabel?: string;
}

export const JOGGING: CheckinDef = { habit: 'jogging', label: 'Jogging', icon: '🏃', ariaLabel: 'Jogging' };

export const NITNEM: CheckinDef[] = [
  { habit: 'nitnemMorning', label: 'Morning', icon: '🌅', ariaLabel: 'Nitnem Morning' },
  { habit: 'nitnemEvening', label: 'Evening', icon: '🌆', ariaLabel: 'Nitnem Evening' },
  { habit: 'nitnemNight', label: 'Night', icon: '🌃', ariaLabel: 'Nitnem Night' },
];

export const ALL_CHECKINS: CheckinDef[] = [JOGGING, ...NITNEM];

export function CheckinBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border transition-all duration-150 ${
        checked
          ? 'border-accent bg-accent text-white'
          : 'border-line-strong bg-surface group-hover:border-ink-3'
      }`}
    >
      {checked ? (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 12 5 5L20 7" />
        </svg>
      ) : null}
    </span>
  );
}

/**
 * Backward compatible Checkin component.
 */
export function Checkin({
  label,
  checked,
  onToggle,
  icon,
  ariaLabel,
}: {
  label?: string;
  checked: boolean;
  onToggle: () => void;
  icon?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      onClick={onToggle}
      className="group inline-flex min-w-0 items-center gap-1.5 rounded-lg py-1 text-left transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      {icon ? <span className="text-[14px] leading-none select-none" aria-hidden="true">{icon}</span> : null}
      {label ? (
        <span className={`text-[12px] font-medium leading-none sm:text-[13px] ${checked ? 'text-ink-2' : 'text-ink'}`}>
          {label}
        </span>
      ) : null}
      <CheckinBox checked={checked} />
    </button>
  );
}

/**
 * The four check-ins plus the "n/4" count, for one day.
 * `date` is passed straight through to the existing toggle action — omitted
 * on Today (which means "today"), explicit on Review.
 */
export function WellbeingChecklist({ date, headingId }: { date?: ISODate; headingId: string }) {
  const { data, actions } = useData();
  const day = wellbeingOnDate(data.wellbeingDays, date ?? todayISO());
  const completed = wellbeingCompletedCount(day);

  return (
    <div>
      {/* Top row: Section title & count */}
      <div className="flex items-center justify-between">
        <h2
          id={headingId}
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3"
        >
          Daily well-being
        </h2>
        <span
          className="text-[11px] font-medium tabular-nums text-ink-3"
          aria-label={`${completed} of ${ALL_CHECKINS.length} completed`}
        >
          <span>{completed}/{ALL_CHECKINS.length}</span>
          <span className="sr-only"> {completed} of {ALL_CHECKINS.length} completed</span>
        </span>
      </div>

      {/* Main check-ins row: single row on mobile and desktop */}
      <div className="mt-3 flex items-center justify-between gap-1 sm:justify-start sm:gap-3.5">
        {/* Jogging group */}
        <button
          type="button"
          role="checkbox"
          aria-checked={day?.jogging ?? false}
          aria-label="Jogging"
          onClick={() => void actions.toggleWellbeing(JOGGING.habit, date)}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg py-0.5 text-left transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <span className="text-[14px] leading-none select-none" aria-hidden="true">🏃</span>
          <span className={`text-[12px] font-medium leading-none sm:text-[12.5px] ${day?.jogging ? 'text-ink-2' : 'text-ink'}`}>
            Jogging
          </span>
          <CheckinBox checked={day?.jogging ?? false} />
        </button>

        {/* Vertical divider */}
        <div aria-hidden="true" className="h-4 w-px shrink-0 bg-line mx-0.5 sm:mx-1" />

        {/* Nitnem group */}
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
          <span className="text-[11.5px] font-medium text-ink-3 sm:text-[12px]">
            Nitnem
          </span>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {NITNEM.map((item) => {
              const checked = day?.[item.habit] ?? false;
              return (
                <button
                  key={item.habit}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={item.ariaLabel ?? `Nitnem ${item.label}`}
                  onClick={() => void actions.toggleWellbeing(item.habit, date)}
                  className="group inline-flex shrink-0 items-center gap-1 rounded-lg py-0.5 text-left transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                >
                  <span className="text-[14px] leading-none select-none" aria-hidden="true">{item.icon}</span>
                  <CheckinBox checked={checked} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WellbeingCard() {
  return (
    <section
      aria-labelledby="wellbeing-heading"
      className="rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card sm:px-5 sm:py-4"
    >
      <WellbeingChecklist headingId="wellbeing-heading" />
    </section>
  );
}
