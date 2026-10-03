'use client';

import { WellbeingChecklist } from '@/components/today/wellbeing-card';
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
  return (
    <section
      aria-labelledby="wellbeing-review-heading"
      className="rounded-2xl border border-line bg-surface px-5 py-4 shadow-card"
    >
      <WellbeingChecklist date={date} headingId="wellbeing-review-heading" />
    </section>
  );
}
