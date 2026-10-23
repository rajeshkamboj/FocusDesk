import {
  HISTORY_CATEGORY_LABELS,
  HISTORY_CATEGORY_ORDER,
  type BookCandidate,
  type CuriosityCategory,
  type CuriosityPoolEntry,
  type BrainSharpener,
  type CuriosityBriefing,
  type CuriosityNewsItem,
  type DeveloperDiscovery,
  type HistoryCategory,
  type HistoryEvent,
  type LearningItem,
  type LiteratureItem,
  type OneThingItem,
} from './types';
import { dayNumber } from './schedule';
import { selectFromPool } from './pool';
import { buildRecommendation } from './openlibrary';
import { speakBetterLessons } from './content/speak-better';
import { mythCharacters } from './content/mythology';
import { chemistryConcepts } from './content/chemistry';
import { physicsConcepts } from './content/physics';
import { biologyConcepts } from './content/biology';
import { aiBackgroundLibrary } from './content/ai-background';
import { radarFallbackShelf } from './content/radar-fallback';
import { sikhHistorySeed, type SeedHistoryRecord } from './content/history-sikh';
import { indianHistorySeed } from './content/history-indian';
import { worldHistorySeed } from './content/history-world';

export { sikhHistorySeed, indianHistorySeed, worldHistorySeed };
export type { SeedHistoryRecord };




/* ------------------------------------------------------------------ */
/* Today in History — a curated corpus for the dates it covers.       */
/* ------------------------------------------------------------------ */

export const historyEvents: HistoryEvent[] = [
  {
    date: 'October 5',
    year: 1923,
    title: 'A photograph that changed our view of the universe',
    explanation:
      'On the night of October 5–6, 1923, Edwin Hubble photographed Andromeda at Mount Wilson. Comparing this plate with earlier exposures later revealed a Cepheid variable star, which helped establish that Andromeda lies beyond the Milky Way.',
    significance:
      'Fundamentally expanded humanity’s conception of the cosmos from a single galaxy to a universe containing billions of galaxies.',
    url: 'https://science.nasa.gov/missions/hubble/hubble-views-the-star-that-changed-the-universe/',
  },
  {
    date: 'September 28',
    year: 1928,
    title: 'Alexander Fleming discovers penicillin',
    explanation:
      'Returning to his London laboratory, biologist Alexander Fleming observed a stray mould (Penicillium notatum) contaminating a Staphylococcus culture dish, producing a bacteria-free halo around itself.',
    significance:
      'Inaugurated the modern antibiotic era, turning previously fatal bacterial infections into curable ailments and saving hundreds of millions of lives.',
    url: 'https://en.wikipedia.org/wiki/Discovery_of_penicillin',
  },
  {
    date: 'July 20',
    year: 1969,
    title: 'Apollo 11 lands humans on the Moon',
    explanation:
      'Astronauts Neil Armstrong and Buzz Aldrin piloted the Lunar Module Eagle to a landing in the Sea of Tranquility, stepping onto lunar soil while Michael Collins orbited overhead in Columbia.',
    significance:
      'Represented the first time in history that human beings traveled to and walked upon another celestial body.',
    url: 'https://www.nasa.gov/mission/apollo-11/',
  },
  {
    date: 'October 29',
    year: 1969,
    title: 'First host-to-host message transmitted on ARPANET',
    explanation:
      'Computer scientists at UCLA sent the first packet-switched message to the Stanford Research Institute. The transmission crashed after the first two letters of "LOGIN", but established the viability of digital packet networks.',
    significance:
      'Created the direct architectural and conceptual ancestor of the modern global Internet.',
    url: 'https://en.wikipedia.org/wiki/ARPANET',
  },
  {
    date: 'July 15',
    year: 1799,
    title: 'Discovery of the Rosetta Stone in Egypt',
    explanation:
      'French engineer Pierre-François Bouchard discovered a granodiorite stele near Rashid (Rosetta) containing the same royal decree written in Ancient Egyptian hieroglyphs, Demotic script, and Ancient Greek.',
    significance:
      'Provided the definitive multilingual key that enabled Jean-François Champollion and Thomas Young to unlock ancient Egyptian language and civilization.',
    url: 'https://www.britishmuseum.org/collection/egypt/rosetta-stone',
  },
  {
    date: 'July 5',
    year: 1687,
    title: 'Isaac Newton publishes the Principia',
    explanation:
      'Newton published Philosophiae Naturalis Principia Mathematica, introducing the three universal laws of motion and the law of universal gravitation.',
    significance:
      'Formed the mathematical foundation of classical mechanics and defined scientific physics for over three hundred years.',
    url: 'https://en.wikipedia.org/wiki/Philosophi%C3%A6_Naturalis_Principia_Mathematica',
  },
  {
    date: 'April 25',
    year: 1953,
    title: 'Structure of DNA published in Nature',
    explanation:
      'James Watson and Francis Crick published the molecular structure of deoxyribonucleic acid (DNA), building upon the crucial X-ray diffraction images (Photo 51) captured by Rosalind Franklin and Raymond Gosling.',
    significance:
      'Revealed the physical basis of heredity and biological information, sparking the modern era of molecular genetics.',
    url: 'https://www.nature.com/articles/171737a0',
  },
  {
    date: 'February 23',
    year: 1455,
    title: 'Johannes Gutenberg completes the Gutenberg Bible',
    explanation:
      'In Mainz, Germany, Gutenberg completed printing the 42-line Latin Bible using movable metal type and oil-based ink.',
    significance:
      'Ignited the European printing revolution, making knowledge widely accessible and democratizing literacy and scientific ideas.',
    url: 'https://en.wikipedia.org/wiki/Gutenberg_Bible',
  },
  {
    date: 'April 12',
    year: 1961,
    title: 'Yuri Gagarin completes first human spaceflight',
    explanation:
      'Aboard Vostok 1, Soviet cosmonaut Yuri Gagarin completed a 108-minute orbital flight around the Earth, becoming the first human in outer space.',
    significance:
      'Demonstrated that human beings could survive and operate in space, opening the era of human spaceflight.',
    url: 'https://en.wikipedia.org/wiki/Vostok_1',
  },
];


/* ------------------------------------------------------------------ */
/* 3. Brain Sharpener                                                 */
/* ------------------------------------------------------------------ */

export const brainSharpeners: BrainSharpener[] = [
  {
    id: 'math-crossing-trains',
    subject: 'mathematics',
    topic: 'Algebra & Relative Motion',
    title: 'The Crossing Trains',
    problem:
      'Two train stations, A and B, are 300 km apart on a straight track. At 9:00 AM, Train 1 departs Station A toward B at 60 km/h. At 10:00 AM, Train 2 departs Station B toward A at 90 km/h. At what time will the two trains pass each other?',
    givenInfo: [
      'Distance between stations = 300 km',
      'Train 1: starts at 9:00 AM at 60 km/h',
      'Train 2: starts at 10:00 AM at 90 km/h',
    ],
    hint: 'Determine Train 1’s position at 10:00 AM. After 10:00 AM, both trains are closing the gap at their combined speed of 150 km/h.',
    solution:
      '1. Between 9:00 AM and 10:00 AM (1 hour), Train 1 travels: 60 km/h × 1 h = 60 km.\n2. Remaining distance between the trains at 10:00 AM: 300 km - 60 km = 240 km.\n3. Combined relative closing speed: 60 km/h + 90 km/h = 150 km/h.\n4. Time needed to meet: t = 240 / 150 = 8/5 hours = 1 hour and 36 minutes.\n5. Crossing time: 10:00 AM + 1 hr 36 min = 11:36 AM.',
    answer: '11:36 AM',
  },
  {
    id: 'physics-free-fall',
    subject: 'physics',
    topic: 'Kinematics & Gravity',
    title: 'The Height of the Bridge',
    problem:
      'A stone is dropped from rest from a bridge into the river below. Exactly 3.0 seconds later, you hear the splash. Assuming g = 9.8 m/s² and a sound speed of 343 m/s, calculate the height of the bridge, including the time the sound takes to return. Ignore air resistance.',
    givenInfo: [
      'Initial velocity u = 0 m/s',
      'Total fall + sound travel time = 3.0 s',
      'Acceleration g = 9.8 m/s²',
      'Sound speed = 343 m/s',
    ],
    hint: 'Let t be the falling time. The sound travels the height h in the remaining 3 − t seconds.',
    solution: '1. Falling distance h = 4.9t². Sound travel time = h/343.\n2. Therefore t + 4.9t²/343 = 3, or t² + 70t − 210 = 0.\n3. The positive root is t = (√5740 − 70)/2 ≈ 2.8814 s.\n4. h = 4.9t² ≈ 40.68 m. The remaining 0.1186 s is sound travel time.',
    answer: 'Approximately 40.68 metres',
  },
  {
    id: 'math-arithmetic-sum',
    subject: 'mathematics',
    topic: 'Sequences & Patterns',
    title: 'The Spread of Odd Numbers',
    problem:
      'For the first 50 positive odd integers (1, 3, 5, …, 99), find their sum, their mean, and the mean squared distance from that mean. Can you find the last quantity without adding 50 individual squared differences?',
    givenInfo: [
      'Sequence: 1, 3, 5, ..., (2n - 1)',
      'Number of terms n = 50',
      'Last term = 2(50) - 1 = 99',
    ],
    hint: 'Use mean squared distance = mean of the squares − square of the mean. Expand (2k − 1)² and use the sums of k and k².',
    solution:
      '1. The sum is 50(1 + 99)/2 = 2,500, so the mean is 50.\n2. Sum (2k − 1)² = 4 sum k² − 4 sum k + 50.\n3. For k = 1 to 50, sum k = 1,275 and sum k² = 50 × 51 × 101 / 6 = 42,925. Thus the sum of the odd squares is 166,650.\n4. Mean square = 166,650/50 = 3,333. Subtract the squared mean: 3,333 − 2,500 = 833.',
    answer: 'Sum = 2,500; mean = 50; mean squared distance = 833',
  },
  {
    id: 'physics-circuit-current',
    subject: 'physics',
    topic: 'Electricity & Ohm’s Law',
    title: 'Resistors in Series and Parallel',
    problem:
      'A 12V DC power source is connected across a network of three identical 6 Ω resistors. Two of the resistors are connected in parallel with each other, and this parallel pair is connected in series with the third resistor. Calculate the total current supplied by the 12V source.',
    givenInfo: [
      'Voltage V = 12 V',
      'Three resistors: R₁ = 6 Ω, R₂ = 6 Ω, R₃ = 6 Ω',
    ],
    hint: 'First find the equivalent resistance of the parallel pair (3 Ω), then add the 6 Ω series resistor. Apply Ohm’s Law I = V / R.',
    solution:
      '1. Equivalent resistance of parallel branch: R_p = (6 × 6)/(6 + 6) = 36/12 = 3 Ω.\n2. Total circuit resistance: R_total = 6 Ω + 3 Ω = 9 Ω.\n3. Using Ohm’s Law: I = V / R_total = 12 V / 9 Ω = 4/3 A ≈ 1.33 A.',
    answer: '4/3 A (or approx. 1.33 Amperes)',
  },
  {
    id: 'math-dice-probability',
    subject: 'mathematics',
    topic: 'Probability & Combinatorics',
    title: 'Sum of Two Dice',
    problem:
      'Two standard fair 6-sided dice are rolled. You are told that at least one die is even. Given that information, what is the exact probability that the sum is either 7 or 11?',
    givenInfo: [
      'Each die has faces {1, 2, 3, 4, 5, 6}',
      'Total possible outcomes = 6 × 6 = 36',
    ],
    hint: 'Restrict the sample space first: exclude the pairs in which both dice are odd. Then count the pairs summing to 7 or 11.',
    solution:
      '1. Of 36 ordered outcomes, 3 × 3 = 9 have two odd dice, leaving 27 equally likely outcomes.\n2. Six pairs sum to 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1). Two sum to 11: (5,6), (6,5).\n3. All eight contain an even die, so all remain in the conditional sample space.\n4. The conditional probability is 8/27 ≈ 29.63%.',
    answer: '8/27 (approximately 29.63%)',
  },
  {
    id: 'physics-stopping-distance',
    subject: 'physics',
    topic: 'Work & Energy',
    title: 'Braking Distance of a Car',
    problem:
      'A 1,000 kg car is traveling at 20 m/s (72 km/h) on a flat road. The driver brakes, exerting a constant total friction braking force of 5,000 N until the car comes to a stop. Using the work-energy theorem, what is the stopping distance?',
    givenInfo: [
      'Mass m = 1,000 kg',
      'Velocity v = 20 m/s',
      'Braking force F = 5,000 N',
      'Work done by friction = Initial kinetic energy: F · d = ½ m v²',
    ],
    hint: 'Equate the braking work F · d to the car’s kinetic energy ½ m v².',
    solution:
      '1. Kinetic energy KE = ½ · m · v² = 0.5 × 1,000 × (20)² = 200,000 J.\n2. Work done by brakes W = F × d.\n3. 5,000 N × d = 200,000 J.\n4. d = 200,000 / 5,000 = 40 meters.',
    answer: '40 meters',
  },
];

/* ------------------------------------------------------------------ */
/* Daily Editorial Aggregation                                        */
/* ------------------------------------------------------------------ */

/**
 * The briefing for a date, with no scheduler and no network involved.
 *
 * Two kinds of category, on purpose:
 *
 *  - **Pool-backed** — One Thing, Literature, Learn Something and the book
 *    candidate. These rotate through `lib/curiosity/pool.ts`, which filters by
 *    publication date and accepts the rotation ledger. Called directly (as here)
 *    there is no ledger, so the result is a pure function of the date; called by
 *    the publisher job it is the same rotation *minus* whatever the last weeks
 *    already showed.
 *  - **Fixed corpus** — the older editorial sets (Speak Better, Mythology, the
 *    three sciences, Brain Sharpener) and the dated history entries. Twelve or
 *    fewer items each, offset from one another so the briefing does not return
 *    to the same combination of everything at once, and cycling is acceptable
 *    for a set this carefully authored.
 *
 * Every step is arithmetic on the date, never on a request count. A reader
 * opening the page twice gets the same briefing; a reader opening it tomorrow
 * gets a different one. That is the property the verify script tests, and it is
 * why no card may consult `Date.now()` or a random value.
 */
const SPEAK_BETTER_OFFSET = 5;
const MYTHOLOGY_OFFSET = 2;
const CHEMISTRY_OFFSET = 7;
const PHYSICS_OFFSET = 11;
const BIOLOGY_OFFSET = 3;

/**
 * How many curated items the live-only cards take from their shelves per day. Three
 * from twelve means a full cycle is four days, and two consecutive days never share an
 * entry — which is the honest maximum for a library that is not being refreshed.
 */
export const CURATED_PER_DAY = 3;

/** A slice of a fixed list, advanced by the day so the shelf rotates. */
function rotate<T>(list: readonly T[], date: string, take = CURATED_PER_DAY): T[] {
  if (list.length === 0) return [];
  const day = dayNumber(date);
  const start = (day * Math.min(take, list.length)) % list.length;
  const count = Math.min(take, list.length);
  return Array.from({ length: count }, (_, index) => list[(start + index) % list.length]);
}

/**
 * Curated AI background for a day. These are explainers, not news: every item arrives
 * with `origin: 'background'` and no publication date, because nothing here claims to
 * have happened recently, and the card is expected to say which of the two it is.
 */
export function curatedAiWorld(date: string): { items: CuriosityNewsItem[]; ids: string[] } {
  const picked = rotate(aiBackgroundLibrary, date);
  return { items: picked.map((entry) => entry.item), ids: picked.map((entry) => entry.id) };
}

/** Curated developer tools for a day, for when the repository search yielded nothing. */
export function curatedRadar(date: string): { items: DeveloperDiscovery[]; ids: string[] } {
  const picked = rotate(radarFallbackShelf, date);
  return { items: picked.map((entry) => entry.item), ids: picked.map((entry) => entry.id) };
}

/**
 * An event for a day that has no verified anniversary.
 *
 * Marked `forThisDate: false`, and carrying its own real date, so the card can show it
 * as what it is: something worth reading today, not something that happened today. The
 * alternative — leaving the card empty, or reusing yesterday's event — either wastes a
 * curated corpus or states something untrue.
 */
export function curatedHistoryArchive(date: string): HistoryEvent {
  const record = rotate(sikhHistorySeed, date, 1)[0];
  return seedHistoryToEvent(record, 'sikh-history', {
    forThisDate: false,
    dateMatch: 'archive-fallback',
  });
}

/**
 * Curated events that really belong to the requested month and day.
 *
 * The published pipeline uses this list, not a single entry, so the selector can
 * prefer an anniversary the ledger has not shown recently. The Gutenberg entry is
 * excluded here exactly as it is in `dailyEditorial`: it is an authoring record
 * whose date is not the date the card would claim, and republishing it under
 * "Today in History" would be a false statement.
 */
export const seedHistoryByCategory: Record<HistoryCategory, readonly SeedHistoryRecord[]> = {
  'sikh-history': sikhHistorySeed,
  'indian-history': indianHistorySeed,
  'world-history': worldHistorySeed,
};

export function isIsoLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function parseIsoCalendarDate(date: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const maxDays = month === 2
    ? (isIsoLeapYear(year) ? 29 : 28)
    : ([4, 6, 9, 11].includes(month) ? 30 : 31);
  if (day > maxDays) return null;
  return { year, month, day };
}

export function seedHistoryToEvent(
  record: SeedHistoryRecord,
  category: HistoryCategory,
  opts: {
    forThisDate: boolean;
    dateMatch: 'exact-date' | 'leap-day-observed' | 'archive-fallback';
    extraCalendarNote?: string;
  },
): HistoryEvent {
  const calendarNote = [record.calendarNote, opts.extraCalendarNote]
    .filter(Boolean)
    .join(' ');
  return {
    id: record.id,
    category,
    categoryLabel: HISTORY_CATEGORY_LABELS[category],
    date: record.dateLabel,
    year: record.year,
    ...(record.month !== undefined ? { month: record.month } : {}),
    ...(record.day !== undefined ? { day: record.day } : {}),
    datePrecision: record.datePrecision,
    ...(calendarNote ? { calendarNote } : {}),
    title: record.title,
    explanation: record.explanation,
    significance: record.significance,
    url: record.url,
    sourceName: record.sourceName,
    ...(record.license ? { license: record.license } : {}),
    forThisDate: opts.forThisDate,
    dateMatch: opts.dateMatch,
    origin: 'curated',
    attribution: record.attribution,
  };
}

export function curatedHistoryMatches(date: string): HistoryEvent[] {
  const parsed = parseIsoCalendarDate(date);
  const matches: HistoryEvent[] = [];
  const seenUrls = new Set<string>();

  if (parsed) {
    for (const category of HISTORY_CATEGORY_ORDER) {
      for (const record of seedHistoryByCategory[category]) {
        if (record.month === parsed.month && record.day === parsed.day) {
          seenUrls.add(record.url);
          matches.push(seedHistoryToEvent(record, category, { forThisDate: true, dateMatch: 'exact-date' }));
        }
      }
    }
  }

  const key = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  for (const event of historyEvents) {
    if (event.date === key && event.title !== 'Johannes Gutenberg completes the Gutenberg Bible' && (!event.url || !seenUrls.has(event.url))) {
      matches.push({
        ...event,
        category: 'world-history',
        categoryLabel: HISTORY_CATEGORY_LABELS['world-history'],
        forThisDate: true,
        dateMatch: 'exact-date',
        origin: 'curated',
      });
    }
  }
  return matches;
}

/**
 * Deterministic 3-entry Today in History triad for zero-credential/offline mode,
 * ordered strictly: 1. Sikh History -> 2. Indian History -> 3. World History.
 * Exact calendar anniversaries carry `forThisDate: true`; archive milestones carry
 * `forThisDate: false` so a non-anniversary event is never presented as today's date.
 */
export function fallbackHistoryTriad(date: string, safeDayOverride?: number): HistoryEvent[] {
  const parsed = parseIsoCalendarDate(date);
  const parsedMs = Date.parse(`${date}T00:00:00Z`);
  const safeDay = safeDayOverride ?? (Number.isFinite(parsedMs) ? Math.abs(Math.floor(parsedMs / 86_400_000)) : 0);
  const usedIds = new Set<string>();
  const usedUrls = new Set<string>();

  return HISTORY_CATEGORY_ORDER.map((category, slotIdx) => {
    const corpus = seedHistoryByCategory[category];
    if (parsed) {
      const exact = corpus.filter(
        (r) => r.month === parsed.month && r.day === parsed.day && !usedIds.has(r.id) && !usedUrls.has(r.url),
      );
      if (exact.length > 0) {
        const chosen = exact[safeDay % exact.length];
        usedIds.add(chosen.id);
        usedUrls.add(chosen.url);
        return seedHistoryToEvent(chosen, category, { forThisDate: true, dateMatch: 'exact-date' });
      }
      if (!isIsoLeapYear(parsed.year) && parsed.month === 2 && parsed.day === 28) {
        const leapOnly = corpus.filter(
          (r) => r.month === 2 && r.day === 29 && !usedIds.has(r.id) && !usedUrls.has(r.url),
        );
        if (leapOnly.length > 0) {
          const chosen = leapOnly[safeDay % leapOnly.length];
          usedIds.add(chosen.id);
          usedUrls.add(chosen.url);
          return seedHistoryToEvent(chosen, category, {
            forThisDate: false,
            dateMatch: 'leap-day-observed',
            extraCalendarNote: 'Occurred on leap day (February 29); surfaced on February 28 in a non-leap year.',
          });
        }
      }
    }

    const available = corpus.filter((r) => !usedIds.has(r.id) && !usedUrls.has(r.url));
    const pool = available.length > 0 ? available : corpus;
    const chosen = pool[(safeDay + slotIdx * 7) % pool.length];
    usedIds.add(chosen.id);
    usedUrls.add(chosen.url);
    return seedHistoryToEvent(chosen, category, { forThisDate: false, dateMatch: 'archive-fallback' });
  });
}

function poolEntry<T>(category: CuriosityCategory, date: string): CuriosityPoolEntry<T> {
  return selectFromPool(category, date).entry as CuriosityPoolEntry<T>;
}

export function dailyEditorial(date: string): Pick<
  CuriosityBriefing,
  | 'book'
  | 'aiWorld'
  | 'developerRadar'
  | 'oneThing'
  | 'learning'
  | 'history'
  | 'historyEntries'
  | 'literature'
  | 'sharpener'
  | 'speakBetter'
  | 'mythology'
  | 'chemistry'
  | 'physics'
  | 'biology'
> {
  // Deliberately *not* `dayNumber`: that one counts from ROTATION_EPOCH and drives the
  // content pool, while these six cards have always counted from the Unix epoch. The two
  // bases agree on nothing except being deterministic, and switching one of them would
  // silently reshuffle every reader's daily card without changing a single fact.
  const parsedDay = Date.parse(`${date}T00:00:00Z`);
  const safeDay = Number.isFinite(parsedDay) ? Math.abs(Math.floor(parsedDay / 86_400_000)) : 0;

  const oneThing = poolEntry<OneThingItem>('one-thing', date);
  const learning = poolEntry<LearningItem>('learn-something', date);
  const literature = poolEntry<LiteratureItem>('literature', date);
  const book = poolEntry<BookCandidate>('book', date);

  return {
    // The two live-only cards are never empty, even offline: they take today's slice of
    // the curated shelves, labelled as background and shelf picks rather than news.
    aiWorld: curatedAiWorld(date).items,
    developerRadar: curatedRadar(date).items,
    // A fallback briefing is built offline, so the book card is the curated
    // record on purpose: no cover, no publication year, no catalogue claims.
    book: buildRecommendation(book, null),
    oneThing: oneThing.item,
    learning: learning.item,
    // A date-matched curated event is a verified statement about today, so it says so;
    // `historyEntries` always carries the full ordered Sikh -> Indian -> World triad.
    history: curatedHistoryMatches(date)[0] ?? null,
    historyEntries: fallbackHistoryTriad(date, safeDay),
    literature: literature.item,
    sharpener: brainSharpeners[safeDay % brainSharpeners.length],
    speakBetter: speakBetterLessons[(safeDay + SPEAK_BETTER_OFFSET) % speakBetterLessons.length],
    mythology: mythCharacters[(safeDay + MYTHOLOGY_OFFSET) % mythCharacters.length],
    chemistry: chemistryConcepts[(safeDay + CHEMISTRY_OFFSET) % chemistryConcepts.length],
    physics: physicsConcepts[(safeDay + PHYSICS_OFFSET) % physicsConcepts.length],
    biology: biologyConcepts[(safeDay + BIOLOGY_OFFSET) % biologyConcepts.length],
  };
}

/** The pool ids behind a fallback briefing, so a log can say what was shown. */
export function dailyEditorialIds(date: string): Record<'oneThing' | 'learning' | 'literature' | 'book', string> {
  return {
    oneThing: poolEntry<OneThingItem>('one-thing', date).id,
    learning: poolEntry<LearningItem>('learn-something', date).id,
    literature: poolEntry<LiteratureItem>('literature', date).id,
    book: poolEntry<BookCandidate>('book', date).id,
  };
}

/** Which curated background/shelf items a day shows, for the published record. */
export function curatedFallbackIds(date: string): { aiWorld: string; developerRadar: string } {
  return {
    aiWorld: curatedAiWorld(date).ids.join('+'),
    developerRadar: curatedRadar(date).ids.join('+'),
  };
}
