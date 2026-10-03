'use client';

import { useData } from '@/components/data/data-provider';
import { wellbeingCompletedCount, wellbeingOnDate } from '@/lib/selectors';
import { ALL_CHECKINS, Checkin, JOGGING, NITNEM } from '@/components/today/wellbeing-card';
import type { ISODate } from '@/lib/types';

/**
 * Well-being in the daily review — the exact same four check-ins as the
 * Today card, shown for the day being reviewed. This is where the past can
 * be looked at and honestly corrected: navigate to any previous day with the
 * arrows above and tick what actually happened.
 *
 * Every reviewed day is a real day, even one without a record — it quietly
 * shows as 0 of 4 completed. Ticking a check-in on a forgotten day creates
 * that day's record; editing a past day never touches today's record. No
 * streaks, no scores, no judgment.
 */
export function WellbeingReview({ date }: { date: ISODate }) {
  const { data, actions } = useData();
  const day = wellbeingOnDate(data.wellbeingDays, date);
  const completed = wellbeingCompletedCount(day);

  return (
    <section aria-labelledby="wellbeing-review-heading" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 id="wellbeing-review-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        Daily well-being
      </h2>

      <div className="mt-2.5">
        <Checkin
          label={JOGGING.label}
          checked={day?.jogging ?? false}
          onToggle={() => void actions.toggleWellbeing(JOGGING.habit, date)}
        />

        <p className="mt-2.5 px-1.5 text-[12.5px] font-medium text-ink-2">Nitnem</p>
        <div className="mt-0.5 space-y-0.5 pl-7">
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

      <p className="mt-3.5 border-t border-line pt-3 text-[11px] tabular-nums text-ink-3">
        {completed} of {ALL_CHECKINS.length} completed
      </p>
    </section>
  );
}
