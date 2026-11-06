/**
 * The Speak Better enrichment pass.
 *
 * WHAT IT ADDS
 * For the day's one target word it attaches dictionary material that the
 * authored lesson cannot supply on its own: a part of speech and a short definition
 * from Wiktionary, and the words a term habitually travels with from Datamuse.
 *
 * WHAT IT NEVER TOUCHES
 * `englishMeaning`, `hindiMeaning`, `nuance`, `examples`, `commonMistake`,
 * `differsFrom`, `register`, `tone`, `partOfSpeech` and `challenge` are editorial. The enrichment result is
 * written to a separate `dictionary` object on each word, so a dictionary response
 * cannot overwrite a judgement an editor made. That separation is the invariant the
 * "Hindi and nuance stay authorial" requirement needs, expressed in the type system
 * rather than in a comment.
 *
 * FAILURE
 * A dictionary outage is normal. The function returns the lesson unchanged with
 * `enrichment.status: 'unavailable'`, and the card simply shows the authored lesson.
 * It never blocks a publish and never invents a definition.
 */

import type { SpeakBetterLesson, SpeakBetterWord } from '../../curiosity/types';
import { lookupWiktionary } from './wiktionary';
import { lookupDatamuse } from './datamuse';

export interface EnrichmentOptions {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  /** Wall-clock budget for the whole pass. */
  budgetMs?: number;
  /** Injected for tests. */
  nowIso?: string;
}

export interface EnrichmentOutcome {
  lesson: SpeakBetterLesson;
  enrichedWords: number;
  notes: string[];
}

/** True when the operators have switched enrichment off. */
export function enrichmentEnabled(): boolean {
  const value = (process.env.CURIOSITY_ENRICHMENT ?? process.env.CURIOSITY_SPEAK_BETTER_ENRICH ?? '').trim().toLowerCase();
  return value !== 'off' && value !== 'false' && value !== '0';
}

/**
 * Enrich one lesson's primary word, without mutating the input.
 *
 * Only the one target word is looked up. The result is attached as its `dictionary`
 * object, and every authored field is copied through untouched, so a dictionary
 * response can add material beside the teaching but can never stand in for it.
 */
export async function enrichLesson(lesson: SpeakBetterLesson, options: EnrichmentOptions = {}): Promise<EnrichmentOutcome> {
  const nowIso = options.nowIso ?? new Date().toISOString();
  if (!enrichmentEnabled()) {
    return {
      lesson: { ...lesson, enrichment: { status: 'disabled', detail: 'CURIOSITY_ENRICHMENT is off', fetchedAt: nowIso } },
      enrichedWords: 0,
      notes: ['enrichment disabled by configuration'],
    };
  }

  const deadline = Date.now() + Math.max(2_000, options.budgetMs ?? 9_000);
  const notes: string[] = [];
  const word = lesson.word;
  let enrichedWord: SpeakBetterWord = word;
  let enrichedWords = 0;

  if (Date.now() > deadline) {
    notes.push('stopped before the lookup started (time limit)');
  } else {
    // A phrase is looked up by its head word: Wiktionary has no entry for most
    // multi-word expressions, and asking would burn a request for nothing.
    const head = word.word.split(/\s+/)[0].replace(/[^A-Za-z'-]/g, '');
    const [dictionary, associations] = await Promise.all([
      lookupWiktionary(head, { fetchImpl: options.fetchImpl, sleepImpl: options.sleepImpl }),
      lookupDatamuse(word.word, { fetchImpl: options.fetchImpl, sleepImpl: options.sleepImpl, limit: 5 }),
    ]);

    if (!dictionary.entry && !associations.entry) {
      if (dictionary.note) notes.push(`${word.word}: ${dictionary.note}`);
    } else {
      enrichedWord = {
        ...word,
        dictionary: {
          sourceName: dictionary.entry?.sourceName ?? 'Datamuse',
          license: [dictionary.entry?.license, associations.entry?.license].filter(Boolean).join(' · '),
          url: dictionary.entry?.url ?? associations.entry?.url ?? `https://en.wiktionary.org/wiki/${encodeURIComponent(head)}`,
          ...(dictionary.entry?.partOfSpeech ? { partOfSpeech: dictionary.entry.partOfSpeech } : {}),
          ...(dictionary.entry?.definition ? { definition: dictionary.entry.definition } : {}),
          ...(associations.entry?.related.length ? { collocations: associations.entry.related } : {}),
          fetchedAt: nowIso,
        },
      };
      enrichedWords = 1;
    }
  }

  const lessonWithEnrichment: SpeakBetterLesson = {
    ...lesson,
    word: enrichedWord,
    enrichment: enrichedWords > 0
      ? { status: 'enriched', detail: '1 word with dictionary detail', fetchedAt: nowIso }
      : { status: 'unavailable', detail: notes[0] ?? 'the dictionary services returned nothing usable', fetchedAt: nowIso },
  };

  return { lesson: lessonWithEnrichment, enrichedWords, notes };
}
