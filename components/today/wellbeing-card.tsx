'use client';

import { useData } from '@/components/data/data-provider';
import { todayISO } from '@/lib/dates';
import { wellbeingCompletedCount, wellbeingOnDate } from '@/lib/selectors';
import type { WellbeingHabit } from '@/lib/types';

/**
 * Daily well-being — a quiet corner of the Today page that asks
 * "did I take care of myself today?", not "how well did I track my habits?".
 *
 * Two habits, four check-ins, no streaks, no scores. It stays visually
 * secondary to Today's Priority and the task list on purpose.
 *
 * The check-in definitions and the Checkin row are exported so the Review
 * page can show (and correct) the exact same four check-ins for past days.
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

/** One check-in row: the whole row is the tap target. */
export function Checkin({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2"
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

export function WellbeingCard() {
  const { data, actions } = useData();
  const day = wellbeingOnDate(data.wellbeingDays, todayISO());
  const completed = wellbeingCompletedCount(day);

  return (
    <section aria-labelledby="wellbeing-heading" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 id="wellbeing-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        Daily well-being
      </h2>

      <div className="mt-2.5">
        <Checkin
          label={JOGGING.label}
          checked={day?.jogging ?? false}
          onToggle={() => void actions.toggleWellbeing(JOGGING.habit)}
        />

        <p className="mt-2.5 px-1.5 text-[12.5px] font-medium text-ink-2">Nitnem</p>
        <div className="mt-0.5 space-y-0.5 pl-7">
          {NITNEM.map((item) => (
            <Checkin
              key={item.habit}
              label={item.label}
              checked={day?.[item.habit] ?? false}
              onToggle={() => void actions.toggleWellbeing(item.habit)}
            />
          ))}
        </div>
      </div>

      <p className="mt-3.5 border-t border-line pt-3 text-[11px] tabular-nums text-ink-3">
        {completed} of {ALL_CHECKINS.length} completed
      </p>
    </section>
  );
}
