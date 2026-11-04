/**
 * Datamuse — related expressions and collocations for Speak Better.
 *
 * WHAT IT IS GOOD AT
 * Datamuse is a word-relationship service built on corpus statistics. Asked for
 * "words that are statistically associated with X", it returns the phrases a word
 * actually travels with — which is exactly the collocation list a learner needs and
 * the one thing a dictionary does not give you.
 *
 * WHAT IT IS NOT
 * It is not a dictionary and not a CEFR list. The card labels its output
 * "Often appears with (Datamuse)" rather than "collocations", because that is what
 * the data is: association, not a prescriptive list.
 *
 * TERMS
 * Free, no key, no stated rate limit, and the service asks only that clients be
 * reasonable. One request per word, spaced by the shared limiter, for at most the
 * few words on today's lesson. Datamuse publishes its data under CC BY 4.0, so the
 * attribution is carried on the card.
 */

import { httpGet } from '../http';

const API = 'https://api.datamuse.com/words';

export function datamuseEnabled(): boolean {
  const value = (process.env.CURIOSITY_ENRICHMENT ?? process.env.CURIOSITY_SPEAK_BETTER_ENRICH ?? '').trim().toLowerCase();
  return value !== 'off' && value !== 'false' && value !== '0';
}

export interface DatamuseEntry {
  related: string[];
  sourceName: string;
  license: string;
  url: string;
}

/** Parse the ranked list, dropping anything that is not a short phrase. */
export function parseDatamuseWords(json: unknown, limit = 6): string[] {
  if (!Array.isArray(json)) return [];
  const words: string[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue;
    const word = typeof (raw as { word?: unknown }).word === 'string' ? (raw as { word: string }).word.trim() : '';
    if (word.length < 2 || word.length > 40) continue;
    if (words.some((existing) => existing.toLowerCase() === word.toLowerCase())) continue;
    words.push(word);
    if (words.length >= limit) break;
  }
  return words;
}

/**
 * Words that habitually appear near `term`.
 *
 * `rel_trg` is Datamuse's "trigger" relation: statistically associated words. It
 * returns both collocations and looser topical neighbours, which is why the card
 * says "often appears with" rather than claiming they are fixed phrases.
 */
export async function lookupDatamuse(
  term: string,
  context: { fetchImpl?: typeof fetch; sleepImpl?: (ms: number) => Promise<void>; timeoutMs?: number; limit?: number } = {},
): Promise<{ entry: DatamuseEntry | null; note?: string }> {
  const clean = term.trim().toLowerCase();
  if (!clean || clean.length > 48) return { entry: null, note: 'term not usable for a Datamuse lookup' };
  const params = new URLSearchParams({
    rel_trg: clean,
    max: String(Math.max(1, Math.min(context.limit ?? 6, 10))),
  });
  const result = await httpGet(`${API}?${params.toString()}`, {
    fetchImpl: context.fetchImpl,
    sleepImpl: context.sleepImpl,
    attempts: 1,
    timeoutMs: context.timeoutMs ?? 4_000,
    headers: { accept: 'application/json' },
  });
  if (!result.ok) return { entry: null, note: result.note };
  const related = parseDatamuseWords(result.json).filter((word) => word.toLowerCase() !== clean);
  if (related.length === 0) return { entry: null, note: 'no associated words in the response' };
  return {
    entry: {
      related,
      sourceName: 'Datamuse',
      license: 'Datamuse, CC BY 4.0',
      url: `https://www.datamuse.com/api/`,
    },
  };
}
