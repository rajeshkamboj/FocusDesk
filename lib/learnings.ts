/**
 * Learnings — helpers for the learning timeline (called "Milestones" before
 * Phase 3; the behaviour is unchanged, only the names are).
 *
 * A learning date is a *partial* ISO date, because memory is partial:
 *   'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD'
 * Everything here (sorting, grouping, labelling) is built to respect that
 * without ever inventing a precision the user did not claim.
 */

import type { Learning, LearningCategory, LearningDate } from './types';

export type LearningDatePrecision = 'year' | 'month' | 'day';

export const LEARNING_CATEGORIES: { id: LearningCategory; label: string }[] = [
  { id: 'ai-tool', label: 'AI tool' },
  { id: 'framework', label: 'Framework' },
  { id: 'platform', label: 'Platform' },
  { id: 'extension', label: 'Extension' },
  { id: 'language', label: 'Language' },
  { id: 'concept', label: 'Concept' },
  { id: 'habit', label: 'Habit' },
  { id: 'other', label: 'Other' },
];

export function categoryLabel(category: LearningCategory): string {
  return LEARNING_CATEGORIES.find((c) => c.id === category)?.label ?? 'Other';
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY' / 'YYYY-MM' / 'YYYY-MM-DD' → precision. Anything else → 'year'. */
export function precisionOf(date: LearningDate): LearningDatePrecision {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'day';
  if (/^\d{4}-\d{2}$/.test(date)) return 'month';
  return 'year';
}

export function isValidLearningDate(date: string): boolean {
  if (/^\d{4}$/.test(date)) return true;
  if (/^\d{4}-\d{2}$/.test(date)) return Number(date.slice(5, 7)) >= 1 && Number(date.slice(5, 7)) <= 12;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  return false;
}

export function yearOf(date: LearningDate): number {
  return Number(date.slice(0, 4));
}

/** 1–12, or 0 when the entry is year-only. */
export function monthOf(date: LearningDate): number {
  return precisionOf(date) === 'year' ? 0 : Number(date.slice(5, 7));
}

/**
 * Comparable key. A vaguer date sorts *after* precise ones inside the same
 * bucket ('2025' lands at the end of 2025, '2025-08' at the end of August)
 * because "sometime then" cannot claim a specific slot.
 */
export function sortKey(date: LearningDate): string {
  const p = precisionOf(date);
  if (p === 'day') return `${date}-1`;
  if (p === 'month') return `${date}-00-0`;
  return `${date}-00-00-0`;
}

/** Latest first. Ties fall back to creation time so same-day entries stay stable. */
export function compareLearnings(a: Learning, b: Learning): number {
  const ka = sortKey(a.date);
  const kb = sortKey(b.date);
  if (ka !== kb) return ka < kb ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : -1;
}

/** '14 Aug 2025' / 'August 2025' / '2025' — never more precise than the data. */
export function formatLearningDate(date: LearningDate): string {
  const p = precisionOf(date);
  if (p === 'year') return date.slice(0, 4);
  const month = MONTHS[Number(date.slice(5, 7)) - 1] ?? '';
  if (p === 'month') return `${month} ${date.slice(0, 4)}`;
  return `${Number(date.slice(8, 10))} ${month.slice(0, 3)} ${date.slice(0, 4)}`;
}

export function monthLabel(month: number): string {
  // Year-only entries get an honest heading rather than a fake month.
  return month === 0 ? 'Sometime that year' : MONTHS[month - 1];
}

export interface LearningMonthGroup {
  month: number;
  label: string;
  items: Learning[];
}

export interface LearningYearGroup {
  year: number;
  count: number;
  months: LearningMonthGroup[];
}

/** Descending year → descending month, with year-only entries last in a year. */
export function groupLearnings(learnings: Learning[]): LearningYearGroup[] {
  const sorted = [...learnings].sort(compareLearnings);
  const years = new Map<number, Map<number, Learning[]>>();

  for (const m of sorted) {
    const y = yearOf(m.date);
    const mo = monthOf(m.date);
    if (!years.has(y)) years.set(y, new Map());
    const months = years.get(y)!;
    if (!months.has(mo)) months.set(mo, []);
    months.get(mo)!.push(m);
  }

  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      count: [...months.values()].reduce((n, list) => n + list.length, 0),
      months: [...months.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([month, items]) => ({ month, label: monthLabel(month), items })),
    }));
}
