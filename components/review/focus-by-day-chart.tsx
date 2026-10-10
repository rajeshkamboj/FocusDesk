'use client';

import { compactFocusedTime, formatSecondsDetailed, formatShortDate, weekdayName } from '@/lib/dates';
import type { ISODate } from '@/lib/types';

export interface FocusByDayDatum {
  date: ISODate;
  seconds: number;
}

/**
 * Recorded focused time, one bar per local calendar day.
 *
 * Drawn with plain elements — no chart library, no SVG. A bar is a div whose
 * height is a percentage of the tallest day, which is all a bar chart with
 * seven categorical columns is; the alternative is a dependency tree (a chart
 * library, a Redux store and a d3 bundle) to render the same seven divs.
 *
 * Two rules come from the data, not the design:
 *
 *  - **Every day is present, including the zero ones.** The caller passes a
 *    zero-filled range (`focusedTimeInRange` already does), so a day with no
 *    recorded time is a flat bar with a "0" label, never a missing column.
 *    A week is seven days long whether or not the timer ran.
 *  - **The bars are read from the same numbers as the summary above them.**
 *    The component never sums its own data — `total` is passed in — so the
 *    chart cannot drift from the figure the Review already prints.
 *
 * Accessibility: each column's visible text is the compact minute label and
 * the weekday initial, both decorative to a screen reader; the real content is
 * a `sr-only` sentence with the full weekday, date and seconds-exact value.
 * Nothing is conveyed by colour alone — every bar carries its own number.
 */
export function FocusByDayChart({
  days,
  total,
  className = '',
}: {
  days: FocusByDayDatum[];
  total: number;
  className?: string;
}) {
  if (days.length === 0) return null;

  // Tallest day sets the scale. Bars are scaled to the peak, not to the total,
  // so the shape of the week stays readable even on a light week; the numbers
  // above the bars (and the total in the section header) carry the absolute
  // values, so no comparison here depends on reading a length.
  const peak = days.reduce((max, day) => Math.max(max, day.seconds), 0);
  const recordedDays = days.filter((day) => day.seconds > 0).length;

  return (
    <ul
      data-focus-by-day-chart
      role="list"
      className={`flex items-end gap-1 sm:gap-1.5 ${className}`}
      aria-label={`Recorded focused time by day: ${recordedDays} of ${days.length} days with recorded time, ${formatSecondsDetailed(total)} in total`}
    >
      {days.map(({ date, seconds }) => {
        // A minute on a 20-hour peak is 0.08% — invisible. Clamp any recorded
        // day to a hairline so "some" is never drawn as "none"; the exact value
        // is in the label, so nothing is exaggerated by the clamp.
        const height = seconds <= 0 || peak <= 0 ? 0 : Math.max(3, (seconds / peak) * 100);
        const detail =
          seconds > 0
            ? `${weekdayName(date)} ${formatShortDate(date)}: ${formatSecondsDetailed(seconds)}`
            : `${weekdayName(date)} ${formatShortDate(date)}: no recorded focused time`;
        return (
          <li
            key={date}
            data-focus-bar={date}
            title={detail}
            // No `min-w-0`: a column must never be squeezed narrower than its
            // own label. Seven columns at their 9px labels need ~172px, well
            // inside the 248px a 320px phone leaves for this card — and
            // because the floor is real, the mobile-layout audit measures the
            // chart instead of assuming it can shrink to nothing.
            className="flex flex-1 flex-col gap-1"
          >
            {/* `whitespace-nowrap` is deliberate. The compact format is what
                makes a label fit a 32px column at 320px; if a future format
                grew past that, this makes it overflow visibly (and trip the
                column-width check in verify-mobile-layout) instead of silently
                breaking onto a second line inside the bar. */}
            <span
              aria-hidden="true"
              className={`whitespace-nowrap text-center text-[9px] leading-none tabular-nums sm:text-[11px] ${
                seconds > 0 ? 'font-medium text-ink' : 'text-ink-3'
              }`}
            >
              {compactFocusedTime(seconds)}
            </span>
            {/* The rule under each column is what makes a zero day legible as
                a day: an empty slot on a baseline, not an absent column. */}
            <span aria-hidden="true" className="flex h-20 items-end border-b border-line sm:h-24">
              <span
                className="w-full rounded-t-[3px] bg-accent"
                style={{ height: `${height}%` }}
              />
            </span>
            <span
              aria-hidden="true"
              className={`text-center text-[9px] font-medium leading-none sm:text-[11px] ${
                seconds > 0 ? 'text-ink-2' : 'text-ink-3'
              }`}
            >
              {weekdayName(date).slice(0, 1)}
            </span>
            <span className="sr-only">{detail}</span>
          </li>
        );
      })}
    </ul>
  );
}
