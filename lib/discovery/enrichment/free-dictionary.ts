/**
 * The Free Dictionary API — a second lexical source for vocabulary discovery.
 *
 * WHY A SECOND SOURCE
 * The expansion requires that Speak Better not depend on one provider. Wiktionary
 * supplies a short English sense and part of speech; Datamuse supplies frequency
 * and association data; this API supplies a phonetic transcription and, often,
 * usage examples and synonyms. If one of the three is unavailable the pipeline
 * still approves a lesson from the other two — and records which one failed.
 *
 * WHAT IT MAY NOT SUPPLY
 * The Hindi meaning, the nuance note, the learner mistake and the challenge are
 * editorial and live in `lib/curiosity/content/speak-better-vocabulary.ts`. This
 * module has no field in which to overwrite them; its output is attached as
 * attributed dictionary material beside the authored teaching.
 *
 * TERMS
 * `https://dictionaryapi.dev` is a free, keyless service whose data derives from
 * Wiktionary and is published under CC BY-SA. Attribution and a link are carried
 * on the lesson, exactly as for the Wiktionary lookup. One request per word, spaced
 * by the shared per-host limiter, and only inside scheduled discovery — never on a
 * reader's page load.
 */

import { httpGet } from '../http';

const API = 'https://api.dictionaryapi.dev/api/v2/entries/en';

export interface FreeDictionaryEntry {
  partOfSpeech?: string;
  phonetic?: string;
  definition?: string;
  examples: string[];
  synonyms: string[];
  url: string;
  license: string;
  sourceName: string;
}

interface MeaningShape {
  partOfSpeech?: unknown;
  definitions?: Array<{ definition?: unknown; example?: unknown; synonyms?: unknown }>;
  synonyms?: unknown;
}

interface EntryShape {
  word?: unknown;
  phonetic?: unknown;
  phonetics?: Array<{ text?: unknown }>;
  meanings?: unknown;
  sourceUrls?: unknown;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    const clean = text(raw);
    if (clean.length < 2 || clean.length > 60) continue;
    if (out.some((existing) => existing.toLowerCase() === clean.toLowerCase())) continue;
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Parse the first usable English sense.
 *
 * Deliberately conservative: an entry with no definition longer than a few
 * characters returns `null`, which the caller treats as "this source had nothing",
 * not as an error. The returned text is the dictionary's own wording and is shown
 * only under its licence.
 */
export function parseFreeDictionary(json: unknown, term: string): FreeDictionaryEntry | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const entries = json as EntryShape[];

  let phonetic = '';
  let definition = '';
  let partOfSpeech = '';
  const examples: string[] = [];
  const synonyms: string[] = [];
  let sourceUrl = '';

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    if (!phonetic) {
      phonetic = text(entry.phonetic);
      if (!phonetic && Array.isArray(entry.phonetics)) {
        for (const item of entry.phonetics) {
          const candidate = text((item as { text?: unknown })?.text);
          if (candidate) {
            phonetic = candidate;
            break;
          }
        }
      }
    }
    if (!sourceUrl) {
      const urls = stringList(entry.sourceUrls, 1);
      if (urls[0] && /^https?:\/\//i.test(urls[0])) sourceUrl = urls[0];
    }
    const meanings = Array.isArray(entry.meanings) ? (entry.meanings as MeaningShape[]) : [];
    for (const meaning of meanings) {
      if (!meaning || typeof meaning !== 'object') continue;
      const defs = Array.isArray(meaning.definitions) ? meaning.definitions : [];
      for (const item of defs) {
        const candidate = text(item?.definition);
        if (candidate.length < 8) continue;
        if (!definition) {
          definition = candidate.length > 260 ? `${candidate.slice(0, 260).replace(/\s+\S*$/, '')}…` : candidate;
          partOfSpeech = text(meaning.partOfSpeech);
        }
        const example = text(item?.example);
        if (example.length >= 12 && example.length <= 240) {
          if (!examples.some((existing) => existing.toLowerCase() === example.toLowerCase())) {
            examples.push(example);
          }
        }
        synonyms.push(...stringList(item?.synonyms, 4));
      }
      synonyms.push(...stringList(meaning.synonyms, 4));
    }
  }

  if (!definition) return null;
  return {
    partOfSpeech: partOfSpeech || undefined,
    phonetic: phonetic || undefined,
    definition,
    examples: examples.slice(0, 4),
    synonyms: [...new Set(synonyms.map((word) => word.toLowerCase()))].slice(0, 8),
    url: sourceUrl || `https://en.wiktionary.org/wiki/${encodeURIComponent(term.replace(/\s+/g, '_'))}`,
    license: 'Free Dictionary API (Wiktionary-derived), CC BY-SA',
    sourceName: 'Free Dictionary API',
  };
}

export async function lookupFreeDictionary(
  term: string,
  context: { fetchImpl?: typeof fetch; sleepImpl?: (ms: number) => Promise<void>; timeoutMs?: number } = {},
): Promise<{ entry: FreeDictionaryEntry | null; note?: string }> {
  const clean = term.trim().toLowerCase();
  if (!clean || clean.length > 64 || !/^[a-z][a-z'-]*$/.test(clean)) {
    return { entry: null, note: 'term not usable for a dictionary lookup' };
  }
  const result = await httpGet(`${API}/${encodeURIComponent(clean)}`, {
    fetchImpl: context.fetchImpl,
    sleepImpl: context.sleepImpl,
    attempts: 1,
    timeoutMs: context.timeoutMs ?? 5_000,
    headers: { accept: 'application/json' },
  });
  if (!result.ok) {
    // 404 from this API means "no entry", which is a normal absence rather than a
    // transport failure — the note still says so, because a run log should show it.
    return { entry: null, note: result.status === 404 ? 'no entry for this word' : result.note };
  }
  const entry = parseFreeDictionary(result.json, clean);
  return entry ? { entry } : { entry: null, note: 'no usable English sense in the response' };
}
