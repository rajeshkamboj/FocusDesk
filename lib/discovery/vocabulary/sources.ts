/**
 * Live lexical sources for the vocabulary pipeline.
 *
 * Three services, each doing one job:
 *
 *   - **Datamuse** — candidate words and corpus frequency. `ml=` ("means like")
 *     grows candidates from an anchor; `md=f` returns the word's per-million
 *     frequency, which is the only automatic difficulty evidence available for
 *     free. Datamuse data is CC BY 4.0.
 *   - **Wiktionary** — a short English sense and part of speech, CC BY-SA 4.0.
 *   - **Free Dictionary API** — a phonetic transcription plus, often, usage
 *     examples and synonyms, CC BY-SA.
 *
 * None of them supplies a CEFR level, a Hindi gloss or an editorial note, and this
 * module never pretends otherwise. It returns what the sources said and marks each
 * one `ok` or `failed`, so the run log and the published lesson can both be honest
 * about which half of the hybrid actually answered.
 *
 * All requests go through `lib/discovery/http.ts`: one user agent, per-host
 * spacing, bounded retries, and a failure that is a value rather than an exception.
 */

import { httpGet } from '../http';
import { lookupDatamuse } from '../enrichment/datamuse';
import { lookupFreeDictionary, type FreeDictionaryEntry } from '../enrichment/free-dictionary';
import { lookupWiktionary, type WiktionaryEntry } from '../enrichment/wiktionary';
import type { VocabularySourceRef } from '@/lib/curiosity/types';

const DATAMUSE = 'https://api.datamuse.com/words';

/** Words that are never a vocabulary lesson, whatever a source returns. */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'had', 'was', 'were',
  'will', 'would', 'could', 'should', 'about', 'there', 'their', 'they', 'them', 'then',
  'than', 'when', 'what', 'which', 'while', 'your', 'yours', 'you', 'are', 'not', 'but',
  'all', 'any', 'can', 'may', 'might', 'must', 'shall', 'very', 'just', 'also', 'into',
  'over', 'under', 'more', 'most', 'much', 'many', 'some', 'such', 'only', 'even', 'because',
  'before', 'after', 'between', 'through', 'during', 'without', 'within', 'upon', 'been',
  'being', 'does', 'did', 'doing', 'done', 'its', 'it', 'is', 'be', 'to', 'of', 'in', 'on',
  'at', 'by', 'as', 'an', 'a', 'or', 'if', 'so', 'do', 'go', 'no', 'up', 'we', 'us', 'he',
  'she', 'his', 'her', 'him', 'one', 'two', 'how', 'who', 'why', 'where', 'here', 'now',
]);

export interface VocabularyDiscoveryCandidate {
  word: string;
  /** The anchor this candidate was grown from, e.g. `ml:articulate`. */
  discoveredVia: string;
  /** Datamuse's per-million frequency when the same response carried it. */
  frequencyPerMillion?: number;
}

/** True when a string is a single, teachable English word. */
export function isTeachableWord(value: string): boolean {
  const word = value.trim().toLowerCase();
  if (!/^[a-z][a-z'-]{2,19}$/.test(word)) return false;
  if (word.includes("'") || word.includes('-')) return false;
  if (STOP_WORDS.has(word)) return false;
  return true;
}

/**
 * Read Datamuse's `md=f` tag into a number.
 *
 * The API returns frequency as a tag shaped `f<number>`, where the number is
 * occurrences per million words. A response without the tag yields `undefined` —
 * unknown, not zero — because treating a missing measurement as "very rare" would
 * silently reject ordinary words when Datamuse is degraded.
 */
export function parseFrequencyTag(tags: unknown): number | undefined {
  if (!Array.isArray(tags)) return undefined;
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const match = /^f([0-9]+(?:\.[0-9]+)?)$/.exec(raw.trim());
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
  }
  return undefined;
}

export function parseDatamuseCandidates(json: unknown, anchor: string, limit = 24): VocabularyDiscoveryCandidate[] {
  if (!Array.isArray(json)) return [];
  const out: VocabularyDiscoveryCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as { word?: unknown; tags?: unknown };
    const word = typeof record.word === 'string' ? record.word.trim().toLowerCase() : '';
    if (!isTeachableWord(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    out.push({
      word,
      discoveredVia: `datamuse:ml:${anchor}`,
      frequencyPerMillion: parseFrequencyTag(record.tags),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Grow candidates from a handful of anchors.
 *
 * Anchors rotate by run rather than all being asked at once: each anchor is one
 * request, and thirty anchors per run would be impolite to a free service. The
 * caller passes the slice it wants; the date-keyed rotation is in the pipeline.
 */
export async function discoverCandidates(
  anchors: readonly string[],
  context: { fetchImpl?: typeof fetch; sleepImpl?: (ms: number) => Promise<void>; timeoutMs?: number; perAnchor?: number } = {},
): Promise<{ candidates: VocabularyDiscoveryCandidate[]; report: VocabularySourceRef & { fetched: number } }> {
  const candidates: VocabularyDiscoveryCandidate[] = [];
  const seen = new Set<string>();
  let failures = 0;
  let firstFailure = '';

  for (const anchor of anchors) {
    const params = new URLSearchParams({
      ml: anchor,
      md: 'f',
      max: String(Math.max(1, Math.min(context.perAnchor ?? 24, 50))),
    });
    const result = await httpGet(`${DATAMUSE}?${params.toString()}`, {
      fetchImpl: context.fetchImpl,
      sleepImpl: context.sleepImpl,
      attempts: 1,
      timeoutMs: context.timeoutMs ?? 5_000,
      headers: { accept: 'application/json' },
    });
    if (!result.ok) {
      failures += 1;
      if (!firstFailure) firstFailure = result.note;
      continue;
    }
    for (const candidate of parseDatamuseCandidates(result.json, anchor, context.perAnchor ?? 24)) {
      if (seen.has(candidate.word)) continue;
      seen.add(candidate.word);
      candidates.push(candidate);
    }
  }

  return {
    candidates,
    report: {
      id: 'datamuse',
      name: 'Datamuse',
      url: 'https://www.datamuse.com/api/',
      license: 'Datamuse, CC BY 4.0',
      status: failures === anchors.length && anchors.length > 0 ? 'failed' : 'ok',
      detail:
        failures === 0
          ? `${candidates.length} candidate word${candidates.length === 1 ? '' : 's'} from ${anchors.length} anchor${anchors.length === 1 ? '' : 's'}`
          : `${failures} of ${anchors.length} anchor request(s) failed${firstFailure ? ` (${firstFailure})` : ''}`,
      fetched: candidates.length,
    },
  };
}

export interface VocabularyLexicalEvidence {
  /** The word's frequency, when Datamuse supplied it. */
  frequencyPerMillion?: number;
  wiktionary?: WiktionaryEntry;
  freeDictionary?: FreeDictionaryEntry;
  related: string[];
  sources: VocabularySourceRef[];
  notes: string[];
}

/**
 * Collect everything the sources say about one word.
 *
 * Never throws and never blocks on one failing source: a word with only one of the
 * three is still a candidate; a word with none is reported as unverified and cannot
 * be approved.
 */
export async function enrichWord(
  word: string,
  options: {
    fetchImpl?: typeof fetch;
    sleepImpl?: (ms: number) => Promise<void>;
    frequencyPerMillion?: number;
  } = {},
): Promise<VocabularyLexicalEvidence> {
  const sources: VocabularySourceRef[] = [];
  const notes: string[] = [];

  const [wiktionary, freeDictionary, associations] = await Promise.all([
    lookupWiktionary(word, { fetchImpl: options.fetchImpl, sleepImpl: options.sleepImpl }),
    lookupFreeDictionary(word, { fetchImpl: options.fetchImpl, sleepImpl: options.sleepImpl }),
    lookupDatamuse(word, { fetchImpl: options.fetchImpl, sleepImpl: options.sleepImpl, limit: 6 }),
  ]);

  if (wiktionary.entry) {
    sources.push({
      id: 'wiktionary',
      name: 'Wiktionary',
      url: wiktionary.entry.url,
      license: wiktionary.entry.license,
      status: 'ok',
      detail: wiktionary.entry.partOfSpeech ?? 'definition',
    });
  } else {
    sources.push({
      id: 'wiktionary',
      name: 'Wiktionary',
      url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
      license: 'Wiktionary, CC BY-SA 4.0',
      status: 'failed',
      detail: wiktionary.note ?? 'no entry returned',
    });
    notes.push(`Wiktionary: ${wiktionary.note ?? 'no entry returned'}`);
  }

  if (freeDictionary.entry) {
    sources.push({
      id: 'free-dictionary',
      name: freeDictionary.entry.sourceName,
      url: freeDictionary.entry.url,
      license: freeDictionary.entry.license,
      status: 'ok',
      detail: freeDictionary.entry.phonetic ? 'definition and pronunciation' : 'definition',
    });
  } else {
    sources.push({
      id: 'free-dictionary',
      name: 'Free Dictionary API',
      url: 'https://dictionaryapi.dev/',
      license: 'Free Dictionary API (Wiktionary-derived), CC BY-SA',
      status: 'failed',
      detail: freeDictionary.note ?? 'no entry returned',
    });
    notes.push(`Free Dictionary API: ${freeDictionary.note ?? 'no entry returned'}`);
  }

  if (associations.entry) {
    sources.push({
      id: 'datamuse-related',
      name: 'Datamuse',
      url: associations.entry.url,
      license: associations.entry.license,
      status: 'ok',
      detail: `${associations.entry.related.length} associated word(s)`,
    });
  } else {
    sources.push({
      id: 'datamuse-related',
      name: 'Datamuse',
      url: 'https://www.datamuse.com/api/',
      license: 'Datamuse, CC BY 4.0',
      status: 'failed',
      detail: associations.note ?? 'no associated words returned',
    });
  }

  return {
    frequencyPerMillion: options.frequencyPerMillion,
    wiktionary: wiktionary.entry ?? undefined,
    freeDictionary: freeDictionary.entry ?? undefined,
    related: associations.entry?.related ?? [],
    sources,
    notes,
  };
}
