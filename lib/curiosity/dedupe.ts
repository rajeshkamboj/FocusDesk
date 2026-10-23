import { createHash } from 'node:crypto';

/**
 * Text identity for the Curiosity anti-repetition layer.
 *
 * This file answers one question for every card: *is this the same thing we
 * already published?* It has no database, no network and no clock — only
 * normalization, hashing and similarity — so the publisher and the tests can
 * reason about identity without touching a store.
 *
 * Three levels of identity are deliberately kept apart, because conflating them
 * is how "different wording" quietly becomes "new discovery":
 *
 *  1. **Canonical id** — supplied by the card (a pool id, a Wikidata QID, a
 *     repository URL). Two items with the same id are the same item, full stop.
 *  2. **Normalized key** — title, URL or full text with markup, punctuation,
 *     diacritics, articles and tracking parameters removed. Catches formatting
 *     changes and the same article arriving from two feeds.
 *  3. **Shingle signature** — a small set of hashed word n-grams, compared with
 *     Jaccard similarity. Catches a genuine edit of an old item: a new sentence,
 *     a re-worded title, a re-ordered paragraph.
 *
 * Nothing here throws on odd input: a card that feeds a `null` title has a
 * different bug, and the selection layer reports it as "no usable candidates"
 * rather than crashing the publish.
 */

/** Lowercase, strip diacritics, and drop anything that is not a letter or digit. */
export function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    // Combining marks left behind by NFKD, so "Gödel" and "Godel" agree.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Words that carry no identity on a title: stripping them makes "The Iliad" == "Iliad". */
const TITLE_STOPWORDS = new Set([
  'a', 'an', 'the',
  'of', 'on', 'in', 'and', 'or', 'to', 'for', 'from', 'with',
]);

/**
 * A normalized title, for duplicate detection.
 *
 * Leading articles are dropped ("The Iliad" and "Iliad" are one work), and so is
 * a trailing parenthetical qualifier — Wikipedia's "(mythology)" and a feed's
 * " - OpenAI" both describe *where* the title came from, not what it names. The
 * body is NOT truncated: a long headline is still a different item from a short
 * one that shares its opening.
 */
export function normalizeTitle(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return '';
  const words = text.split(' ').filter(Boolean);
  while (words.length > 1 && TITLE_STOPWORDS.has(words[0])) words.shift();
  return words.join(' ');
}

/** A stable, short hash of an arbitrary number of parts. Empty parts still vary the hash. */
export function fingerprint(...parts: unknown[]): string {
  return createHash('sha256')
    .update(parts.map((part) => normalizeText(part)).join('\u0001'))
    .digest('hex')
    .slice(0, 32);
}

/** A stable id derived from text, for corpora that never assigned one. */
export function idFromText(...parts: unknown[]): string {
  return fingerprint(...parts).slice(0, 16);
}

/** Query parameters that describe how a reader arrived, not which page they arrived at. */
const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|ref$|ref_|source$|mc_cid$|mc_eid$|igshid$|share$)/i;

/**
 * Canonical URL identity.
 *
 * Compares scheme, `www.`, trailing slashes, fragments, default ports, tracking
 * parameters and parameter order — all of which routinely differ between two
 * copies of the *same* article. The query string is preserved for parameters
 * that select content (`?id=`, `?v=`), because dropping those would merge two
 * genuinely different pages.
 */
export function normalizeUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Not a URL (a bare repository name, an ISBN). Fall back to text identity so
    // the caller still gets a stable key instead of an empty one.
    return normalizeText(raw);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return normalizeText(raw);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, val]) => `${key}=${val}`)
    .join('&');
  return `${host}${path}${kept ? `?${kept}` : ''}`;
}

/** Domain of a canonical URL, for attributing a source without inventing one. */
export function urlHost(value: unknown): string {
  const canonical = normalizeUrl(value);
  const [host] = canonical.split('/');
  return host ?? '';
}

/** Word tokens used for similarity. Single characters are dropped as noise. */
export function tokens(value: unknown): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 1);
}

/** Never derive an identity from a body this short: it would collide with everything. */
export const MIN_SIGNATURE_WORDS = 6;
/** How many hashes a stored signature keeps. Bounded to keep the ledger small. */
export const SIGNATURE_SIZE = 28;
/** How many of those hashes come from single words, so a re-worded sentence still matches. */
export const SIGNATURE_UNIGRAMS = 10;

/**
 * A compact set of hashed 3-word shingles.
 *
 * The signature is stored on the publication record, so a later candidate can be
 * compared with everything already published without re-reading the archived
 * text. Twenty-four 6-character hashes is ~170 bytes per record: enough to catch
 * a re-worded repeat, small enough that twenty thousand records stay a few
 * megabytes even in the file store.
 */
export function signature(value: unknown, size = 3): string[] {
  const words = tokens(value);
  if (words.length < MIN_SIGNATURE_WORDS) return [];

  // A signature is a *sample*, not a prefix. Taking the first N shingles would
  // compare the opening of two texts and miss an edit three sentences in; keeping
  // the smallest N hashes samples the whole document, which is the standard
  // MinHash trick and costs one sort.
  const unigrams = new Set<string>();
  for (const word of words) unigrams.add(fingerprint('u', word).slice(0, 6));
  const trigrams = new Set<string>();
  for (let index = 0; index + size <= words.length; index += 1) {
    trigrams.add(fingerprint(words.slice(index, index + size).join(' ')).slice(0, 6));
  }

  // Word hashes are included because a sentence-level edit ("organised additional"
  // → "additional organised") rearranges nearly every trigram while keeping every
  // word. Without them, a re-worded repeat scores below any useful threshold.
  const sampledUnigrams = [...unigrams].sort().slice(0, Math.min(SIGNATURE_UNIGRAMS, SIGNATURE_SIZE));
  const sampledTrigrams = [...trigrams]
    .sort()
    .slice(0, Math.max(0, SIGNATURE_SIZE - sampledUnigrams.length));
  return [...sampledUnigrams, ...sampledTrigrams].sort();
}

/** The stored form of `signature`: space-separated hashes, or '' when too short to compare. */
export function signatureText(value: unknown): string {
  return signature(value).join(' ');
}

/** Jaccard similarity of two signature strings, 0..1. */
export function signatureSimilarity(left: string | undefined, right: string | undefined): number {
  const a = new Set((left ?? '').split(' ').filter(Boolean));
  const b = new Set((right ?? '').split(' ').filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const hash of a) if (b.has(hash)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Threshold for "the same item, re-worded".
 *
 * Calibrated against the real corpus, not guessed. Measured on the shipped
 * content: a sentence-level edit of a published text scores ~0.37, while the
 * highest score between any two *different* items in the authored corpus is 0.10
 * (the same topic, different concept). The 0.3 threshold sits in the gap with
 * room on both sides. A false positive costs one rejected candidate (the pool has
 * another); a false negative costs a reader seeing the same item twice, which is
 * the failure this layer exists to prevent. `scripts/verify-curiosity-dedupe.ts`
 * pins both ends of the range.
 */
export const NEAR_DUPLICATE_THRESHOLD = 0.3;

export function isNearDuplicate(left: string | undefined, right: string | undefined, threshold = NEAR_DUPLICATE_THRESHOLD): boolean {
  return signatureSimilarity(left, right) >= threshold;
}

/**
 * The canonical author string, for attribution-aware deduplication.
 *
 * "Seneca", "Lucius Annaeus Seneca" and "Seneca the Younger" are one person; the
 * card's cooldown uses the shortest shared form it can, which is the author's
 * final name token. It is a heuristic, and it is only ever used to ask "has this
 * author appeared too recently", never to merge two different people silently:
 * the full normalized name is still stored and checked first.
 */
export function normalizeAuthor(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return '';
  const words = text.split(' ');
  return words[words.length - 1] ?? text;
}

/**
 * Subject keys for cross-card repetition.
 *
 * A key is a *specific* entity — `myth:athena`, `concept:photosynthesis`,
 * `author:seneca` — never a broad tag like `physics`, which every physics card
 * would share. The `group` scopes the cooldown: two science cards drawing the
 * same concept is a repeat, while a physics concept and a history event that
 * merely share a word are not.
 */
export function subjectKey(group: string, value: unknown): string {
  const text = normalizeTitle(value);
  return text ? `${normalizeText(group)}:${text}` : '';
}

/** Keeps a subject list deterministic and free of empties and duplicates. */
export function normalizeSubjects(values: readonly (string | undefined | null)[]): string[] {
  return [...new Set(values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))].sort();
}
