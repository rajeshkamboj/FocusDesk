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
 *   2. an evidenced book renders the source, the list, and the date or year the
 *      record carries — and a year-level record says in words that no dated entry
 *      was verified, so a year never reads as a week;
 *   3. a book without evidence renders no claim at all — no heading, no line;
 *   4. the validator refuses a `list-entry` that cannot name its list and a dated
 *      period, refuses a bare year dressed as one, refuses an ambiguous
 *      `list-year` and refuses a publisher claim carrying a date;
 *   5. a snapshot published before these fields existed still renders.
 *
 * It renders the real component with `react-dom/server`; there is no browser in
 * this repository, so layout and colour are not asserted here.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { bookPool } from '../lib/curiosity/content/books';
import { buildRecommendation } from '../lib/curiosity/openlibrary';
import {
  YEAR_LEVEL_SUFFIX,
  bestsellerEvidenceLine,
  hasVerifiedBestseller,
} from '../lib/curiosity/book-selection';
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
  if (evidence.kind === 'list-year' && !html.includes(String(evidence.year))) renderedMissing.push(`${entry.id}: year`);
  if (evidence.kind === 'publisher-stated' && !html.includes('publisher&#x27;s own record')) {
    renderedMissing.push(`${entry.id}: publisher-stated wording`);
  }
  if (evidence.url && !html.includes(esc(evidence.url))) renderedMissing.push(`${entry.id}: link`);
}
check(
  'all 34 evidenced cards print the heading, source, list and the date or year they carry',
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
console.log('The three corrected records');
const entryById = new Map(bookPool.map((entry) => [entry.id, entry]));
const itemById = (id: string) => {
  const entry = entryById.get(id);
  if (!entry) throw new Error(`missing pool entry: ${id}`);
  return entry.item;
};
const lineFor = (id: string) => bestsellerEvidenceLine(itemById(id)) ?? '';

const dragon = itemById('shelf-girl-with-the-dragon-tattoo').bestseller!;
check(
  'Dragon Tattoo is a dated paperback trade fiction entry',
  dragon.kind === 'list-entry' &&
    dragon.list === 'Paperback Trade Fiction' &&
    dragon.period === '15 August 2009' &&
    dragon.rank === '#2',
  JSON.stringify(dragon),
);
check(
  'Dragon Tattoo no longer claims the 2008 paperback year',
  !/2008/.test([dragon.list, dragon.period, String(dragon.year ?? '')].join(' ')),
  `${dragon.list} ${dragon.period}`,
);
check(
  'Dragon Tattoo prints the verified list date',
  lineFor('shelf-girl-with-the-dragon-tattoo').includes('15 August 2009'),
  lineFor('shelf-girl-with-the-dragon-tattoo'),
);

const normal = itemById('shelf-normal-people').bestseller!;
check(
  'Normal People is recorded on the combined print and e-book fiction list',
  normal.kind === 'list-entry' &&
    normal.list === 'Combined Print & E-Book Fiction' &&
    normal.period === '5 May 2019',
  JSON.stringify(normal),
);
check(
  'Normal People no longer claims a 2019 paperback fiction listing',
  !/Paperback/i.test(normal.list ?? ''),
  String(normal.list),
);
check(
  'Normal People prints the board it was verified on',
  lineFor('shelf-normal-people').includes('Combined Print & E-Book Fiction'),
  lineFor('shelf-normal-people'),
);

const lean = itemById('shelf-lean-startup').bestseller!;
check(
  'Lean Startup names the Hardcover Advice & Misc. list',
  lean.list === 'Hardcover Advice & Misc.',
  JSON.stringify(lean),
);
check(
  'Lean Startup keeps 2011 as a year-level record, not a date',
  lean.kind === 'list-year' && lean.year === 2011 && lean.period === undefined,
  JSON.stringify(lean),
);
check('Lean Startup keeps the No. 2 debut the source supports', lean.rank === '#2', JSON.stringify(lean));
check(
  'Lean Startup prints the year-level caveat',
  lineFor('shelf-lean-startup').includes(YEAR_LEVEL_SUFFIX),
  lineFor('shelf-lean-startup'),
);

console.log('');
console.log('Year-level evidence is not a dated list entry');
const byKind = (kind: BestsellerEvidence['kind']) =>
  withEvidence.filter((entry) => entry.item.bestseller?.kind === kind);
const datedEntries = byKind('list-entry');
const yearEntries = byKind('list-year');
const publisherEntries = byKind('publisher-stated');
check(
  'the pool holds 7 dated, 14 year-level and 13 publisher-stated records',
  datedEntries.length === 7 && yearEntries.length === 14 && publisherEntries.length === 13,
  `${datedEntries.length} dated, ${yearEntries.length} year-level, ${publisherEntries.length} publisher-stated`,
);
check(
  'every evidenced record is exactly one of the three kinds',
  datedEntries.length + yearEntries.length + publisherEntries.length === withEvidence.length,
);

const datedLines = datedEntries.map((entry) => bestsellerEvidenceLine(entry.item) ?? '');
check(
  'every dated entry is a real date, not a bare year',
  datedEntries.every((entry) => {
    const period = entry.item.bestseller?.period ?? '';
    return period.trim().length > 5 && !/^\d{4}$/.test(period.trim());
  }),
);
check('every dated entry prints its date', datedLines.every((line, i) => line.includes(datedEntries[i].item.bestseller!.period!)));
check('no dated entry prints the year-level caveat', datedLines.every((line) => !line.includes(YEAR_LEVEL_SUFFIX)));
check(
  'no dated entry also carries a year field',
  datedEntries.every((entry) => entry.item.bestseller?.year === undefined),
);

const months = /January|February|March|April|May|June|July|August|September|October|November|December/;
const yearLines = yearEntries.map((entry) => bestsellerEvidenceLine(entry.item) ?? '');
check(
  'every year-level record prints its year',
  yearEntries.every((entry, i) => yearLines[i].includes(String(entry.item.bestseller!.year))),
);
check(
  'every year-level record says no dated entry was verified',
  yearLines.every((line) => line.includes(YEAR_LEVEL_SUFFIX)),
);
check(
  'no year-level record carries a period it could be mistaken for',
  yearEntries.every((entry) => entry.item.bestseller?.period === undefined),
);
check('no year-level line prints a date', yearLines.every((line) => !months.test(line)));
check('a year-level line is never just a year', yearLines.every((line) => line.length > 24));

const yearCard = render(buildRecommendation(yearEntries[0], null));
check(
  `the year-level card prints the caveat (${yearEntries[0].id})`,
  yearCard.includes(YEAR_LEVEL_SUFFIX) && !months.test(yearCard.split('Bestseller evidence')[1] ?? ''),
);
const datedCard = render(buildRecommendation(datedEntries[0], null));
check(
  `the dated card prints a date and no caveat (${datedEntries[0].id})`,
  datedCard.includes(esc(datedEntries[0].item.bestseller!.period!)) && !datedCard.includes(YEAR_LEVEL_SUFFIX),
);

const publisherLines = publisherEntries.map((entry) => bestsellerEvidenceLine(entry.item) ?? '');
check('every publisher claim says whose record it is', publisherLines.every((line) => line.includes("publisher's own record")));
check(
  'no publisher claim prints a date or a year of its own',
  publisherEntries.every((entry) => entry.item.bestseller?.period === undefined && entry.item.bestseller?.year === undefined) &&
    publisherLines.every((line) => !months.test(line)),
);

console.log('');
console.log('A year, a missing date and a made-up week are all refused');
const claim = (bestseller: BestsellerEvidence | undefined, id = 'x') => ({
  ...book(bestseller),
  id,
  url: 'https://example.org',
  source: 'curated' as const,
  sourceName: 'FocusDesk editorial',
});
check(
  'a bare year wearing the list-entry label is refused',
  !hasVerifiedBestseller(book({ ...base, period: '2019' })),
);
const bareYear = claim({ source: 'The New York Times', kind: 'list-entry', list: 'Hardcover Nonfiction', period: '2019' });
check('a bare-year claim prints no line', bestsellerEvidenceLine(bareYear) === null);
check('a bare-year claim renders no evidence block', !render(bareYear).includes('Bestseller evidence'));
check('a bare-year claim renders the word nowhere', !/bestseller/i.test(render(bareYear)));

check(
  'a year-level record without a year is refused',
  !hasVerifiedBestseller(book({ source: 'The New York Times', kind: 'list-year', list: 'Hardcover Fiction' })),
);
check(
  'a year-level record with an impossible year is refused',
  !hasVerifiedBestseller(book({ source: 'The New York Times', kind: 'list-year', list: 'Hardcover Fiction', year: 12 })),
);
check(
  'a year-level record that also carries a period is refused as ambiguous',
  !hasVerifiedBestseller(
    book({ source: 'The New York Times', kind: 'list-year', list: 'Hardcover Fiction', year: 2019, period: '15 August 2019' }),
  ),
);
check(
  'a year-level record without a list is refused',
  !hasVerifiedBestseller(book({ source: 'The New York Times', kind: 'list-year', year: 2019 })),
);
check(
  'a publisher claim carrying a year is refused',
  !hasVerifiedBestseller(book({ source: 'Avery', kind: 'publisher-stated', year: 2019 })),
);
check(
  'a publisher claim carrying a period is refused',
  !hasVerifiedBestseller(book({ source: 'Avery', kind: 'publisher-stated', period: '5 May 2019' })),
);
const refusedYear = claim({ source: 'The New York Times', kind: 'list-year', list: 'Hardcover Fiction' });
check('a refused year-level record prints nothing', bestsellerEvidenceLine(refusedYear) === null);
check('a refused year-level record renders no block', !render(refusedYear).includes('Bestseller evidence'));
check(
  'a missing source refuses every kind',
  (['list-entry', 'list-year', 'publisher-stated'] as BestsellerEvidence['kind'][]).every((kind) => {
    const record: BestsellerEvidence = {
      source: ' ',
      kind,
      list: 'Hardcover Fiction',
      period: kind === 'list-entry' ? '15 August 2019' : undefined,
      year: kind === 'list-year' ? 2019 : undefined,
    };
    return !hasVerifiedBestseller(book(record));
  }),
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
