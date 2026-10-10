'use client';

import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { formatLongDate, todayISO } from '@/lib/dates';
import { NAV_ITEMS } from './nav';
import { BrandMark } from './sidebar';

/**
 * Print-only document header.
 *
 * The sidebar (which normally carries the brand and the current
 * section) is hidden in print, so every printed page's first line of
 * context comes from this bar instead: brand mark, app name, the
 * section being printed, and the date it was printed.
 *
 * `hidden print:flex` keeps it out of the screen layout entirely.
 * The date is rendered only after mount (the same snapshot trick the
 * rest of the app uses for time-dependent text) so the server HTML
 * and the first client paint never disagree.
 */
export function PrintHeader() {
  const pathname = usePathname() ?? '/';
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const section =
    pathname === '/'
      ? 'Today'
      : (NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? 'FocusDesk');

  return (
    <div className="hidden print:flex print:items-center print:gap-2.5 print:border-b print:border-line print:pb-3 print:mb-6">
      <BrandMark size={22} />
      <span className="text-[13px] font-semibold text-ink">FocusDesk</span>
      <span className="text-ink-3">·</span>
      <span className="text-[13px] font-medium text-ink-2">{section}</span>
      {mounted ? (
        <span className="ml-auto text-[12px] text-ink-3">Printed {formatLongDate(todayISO())}</span>
      ) : null}
    </div>
  );
}
