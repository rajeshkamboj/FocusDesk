/**
 * Regression tests for One Book — evidence pass-through, evidence rules, and
 * what the card is allowed to print.
 *
 *   npx tsx scripts/verify-curiosity-books.ts   (npm run verify:curiosity-books)
 *
 * WHY THIS FILE EXISTS
 * `buildRecommendation()` used to return a fixed list of fields, so a curated
 * `bestseller` record — and `genre`, `audience` and `expect` with it — was
 * dropped between the pool entry and the card. Selection still filtered on
 * evidence, so the app under-claimed rather than over-claimed, but the publisher
 * was paying for a lookup whose strongest fact never reached the reader.
 *
 * These checks keep that from coming back:
 *   1. every pool entry's evidence, genre, audience and expectation survive
 *      construction into the `BookRecommendation`;
 *   2. an evidenced book renders the source and the ranking period (and the
 *      publisher-stated wording, where that is the kind);
 *   3. a book without evidence renders no claim at all — no heading, no line;
 *   4. the validator refuses a `list-entry` that cannot name its list and period,
 *      which is the rule the corpus was corrected to follow;
 *   5. a snapshot published before these fields existed still renders.
 *
 * It renders the real component with `react-dom/server`; there is no browser in
 * this repository, so layout and colour are not asserted here.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { bookPool } from '../lib/curiosity/content/books';
import { buildRecommendation } from '../lib/curiosity/openlibrary';
import { bestsellerEvidenceLine, hasVerifiedBestseller } from '../lib/curiosity/book-selection';
import { BookCard } from '../components/curiosity/sections/book-card';
import type { BookCandidate, BestsellerEvidence, CuriosityPoolEntry } from '../lib/curiosity/types';

let checks = 0;

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
}

/** HTML-escape a plain string the way React does, so assertions match markup. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function render(book: Parameters<typeof BookCard>[0]['book']): string {
  return renderToStaticMarkup(createElement(BookCard, { book }));
}

const withEvidence = bookPool.filter((entry) => hasVerifiedBestseller(entry.item));
const withoutEvidence = bookPool.filter((entry) => !hasVerifiedBestseller(entry.item));

console.log('Evidence survives construction');
check('the pool is the size the docs describe', bookPool.length === 53, String(bookPool.length));
check(
  'the evidenced pool is the size the docs describe',
  withEvidence.length === 34,
  `${withEvidence.length} evidenced`,
);
check('books without evidence still exist and were not deleted', withoutEvidence.length === 19, String(withoutEvidence.length));

let missingFields = 0;
for (const entry of bookPool) {
  const record = buildRecommendation(entry, null);
  const item = entry.item;
  if (record.genre !== item.genre) missingFields += 1;
  if (record.audience !== item.audience) missingFields += 1;
  if (record.expect !== item.expect) missingFields += 1;
  if (JSON.stringify(record.bestseller) !== JSON.stringify(item.bestseller)) missingFields += 1;
}
check(
  'every genre, audience, expectation and evidence record reaches the recommendation',
  missingFields === 0,
  `${missingFields} field mismatches`,
);

const sample = withEvidence[0] as CuriosityPoolEntry<BookCandidate>;
const sampleRecord = buildRecommendation(sample, null);
check(
  'the evidence object is copied, not re-derived',
  JSON.stringify(sampleRecord.bestseller) === JSON.stringify(sample.item.bestseller),
);

console.log('');
console.log('The card prints what the record says');
const renderedMissing: string[] = [];
for (const entry of withEvidence) {
  const record = buildRecommendation(entry, null);
  const html = render(record);
  const evidence = record.bestseller as BestsellerEvidence;
  if (!html.includes('Bestseller evidence')) renderedMissing.push(`${entry.id}: heading`);
  if (!html.includes(esc(evidence.source))) renderedMissing.push(`${entry.id}: source`);
  if (evidence.list && !html.includes(esc(evidence.list))) renderedMissing.push(`${entry.id}: list`);
  if (evidence.period && !html.includes(esc(evidence.period))) renderedMissing.push(`${entry.id}: period`);
  if (evidence.kind === 'publisher-stated' && !html.includes('publisher&#x27;s own record')) {
    renderedMissing.push(`${entry.id}: publisher-stated wording`);
  }
  if (evidence.url && !html.includes(esc(evidence.url))) renderedMissing.push(`${entry.id}: link`);
}
check(
  'all 34 evidenced cards print heading, source, list, rank and period',
  renderedMissing.length === 0,
  renderedMissing.slice(0, 6).join('; '),
);

const periodEntry = withEvidence.find((entry) => entry.item.bestseller?.kind === 'list-entry' && entry.item.bestseller.period);
check('at least one listed book carries a ranking period', Boolean(periodEntry));
if (periodEntry) {
  const html = render(buildRecommendation(periodEntry, null));
  check(
    `the listed book shows its period (${periodEntry.id})`,
    html.includes(esc(periodEntry.item.bestseller!.period!)),
  );
}

const publisherEntry = withEvidence.find((entry) => entry.item.bestseller?.kind === 'publisher-stated');
check('the publisher-stated books are still labelled as weaker evidence', Boolean(publisherEntry));
if (publisherEntry) {
  const html = render(buildRecommendation(publisherEntry, null));
  check(
    'publisher-stated evidence says whose claim it is',
    html.includes('publisher&#x27;s own record'),
  );
  check(
    'publisher-stated evidence does not print a period it was not given',
    publisherEntry.item.bestseller?.period === undefined &&
      !html.includes(esc('week of')),
  );
}

console.log('');
console.log('No evidence means no claim');
const blameFree = withoutEvidence[0] as CuriosityPoolEntry<BookCandidate>;
const blameFreeRecord = buildRecommendation(blameFree, null);
const blameFreeHtml = render(blameFreeRecord);
check('a book without evidence has no evidence field', blameFreeRecord.bestseller === undefined);
check('a book without evidence produces no evidence line', bestsellerEvidenceLine(blameFreeRecord) === null);
check('a book without evidence renders no evidence block', !blameFreeHtml.includes('Bestseller evidence'));
check(
  'a book without evidence renders the word nowhere on its card',
  !/bestseller/i.test(blameFreeHtml),
  blameFree.id,
);

const claimFree = bookPool.filter((entry) => {
  const html = render(buildRecommendation(entry, null));
  return /bestseller/i.test(html);
});
check(
  'only the 34 evidenced books ever render the word',
  claimFree.length === withEvidence.length,
  `${claimFree.length} cards mention it`,
);

console.log('');
console.log('The validation rule');
const base: BestsellerEvidence = {
  source: 'The New York Times',
  kind: 'list-entry',
  list: 'Hardcover Fiction',
  period: 'week of 12 May 2019',
};
const book = (bestseller: BestsellerEvidence | undefined): BookCandidate => ({
  title: 'T',
  author: 'A',
  synopsis: 'S',
  why: 'W',
  bestseller,
});
check('a complete list entry is accepted', hasVerifiedBestseller(book(base)));
check(
  'a list entry without a period is refused',
  !hasVerifiedBestseller(book({ ...base, period: undefined })),
);
check(
  'a list entry without a list is refused',
  !hasVerifiedBestseller(book({ ...base, list: undefined })),
);
check(
  'a one-character source is refused',
  !hasVerifiedBestseller(book({ ...base, source: 'x' })),
);
check(
  'an unknown kind is refused',
  !hasVerifiedBestseller(book({ ...base, kind: 'vibes' as BestsellerEvidence['kind'] })),
);
check(
  'publisher-stated evidence needs no list or period',
  hasVerifiedBestseller(book({ source: 'Profile Books', kind: 'publisher-stated' })),
);
const refused = bestsellerEvidenceLine({ ...book({ ...base, period: undefined }), id: 'x', url: 'https://example.org', source: 'curated', sourceName: 'FocusDesk editorial' });
check('a refused record prints nothing', refused === null, String(refused));
const publisherLine = bestsellerEvidenceLine({
  ...book({ source: 'Profile Books', kind: 'publisher-stated' }),
  id: 'x',
  url: 'https://example.org',
  source: 'curated',
  sourceName: 'FocusDesk editorial',
});
check(
  'publisher-stated wording is printed, not upgraded',
  publisherLine === 'Profile Books (publisher\'s own record)',
  String(publisherLine),
);

console.log('');
console.log('Historical snapshots');
const legacy = {
  id: 'legacy-book',
  title: 'A Book Published Before These Fields Existed',
  author: 'An Author',
  synopsis: 'A synopsis that was stored in the snapshot.',
  why: 'A reason that was stored in the snapshot.',
  url: 'https://openlibrary.org/works/OL1W',
  source: 'openlibrary' as const,
  sourceName: 'Open Library',
};
let legacyHtml = '';
try {
  legacyHtml = render(legacy);
  check('a snapshot with none of the new fields still renders', legacyHtml.includes(legacy.title));
  check('a snapshot with no evidence claims none', !/bestseller/i.test(legacyHtml));
  check(
    'a snapshot with no genre does not invent a shelf',
    !legacyHtml.includes('Hardcover Fiction'),
  );
} catch (error) {
  check('a snapshot with none of the new fields still renders', false, String(error));
}

console.log('');
if (process.exitCode) {
  console.error(`${checks} checks run — failures above.`);
} else {
  console.log(`${checks} checks run — all passed.`);
}
