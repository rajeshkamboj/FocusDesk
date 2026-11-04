/**
 * Wiktionary — the dictionary half of Speak Better enrichment.
 *
 * WHAT IT SUPPLIES, AND WHAT IT MUST NEVER SUPPLY
 * Wiktionary supplies a part of speech and a short definition, both of which are
 * dictionary text and are shown as such, attributed and linked under CC BY-SA 4.0.
 * It does **not** supply:
 *
 *   - the Hindi meaning, which is editorial;
 *   - the nuance line or the learner mistake, which are editorial;
 *   - a CEFR level, which Wiktionary does not publish.
 *
 * Those stay authored, and this module has no field in which to overwrite them.
 *
 * TERMS
 * The REST definition endpoint is free and needs no key. Wikimedia's usage guidance
 * asks for an identifying user agent with a contact address — the shared discovery
 * client supplies one from `WIKIMEDIA_CONTACT_EMAIL`. One request per word, spaced
 * by the per-host limiter, and only for the handful of words on today's lesson.
 */

import { httpGet } from '../http';

const API = 'https://en.wiktionary.org/api/rest_v1/page/definition';

export function wiktionaryEnabled(): boolean {
  const value = (process.env.CURIOSITY_ENRICHMENT ?? process.env.CURIOSITY_SPEAK_BETTER_ENRICH ?? '').trim().toLowerCase();
  return value !== 'off' && value !== 'false' && value !== '0';
}

export interface WiktionaryEntry {
  partOfSpeech?: string;
  definition?: string;
  /** The page a reader can check, always present when the lookup succeeded. */
  url: string;
  license: string;
  sourceName: string;
}

interface DefinitionShape {
  partOfSpeech?: unknown;
  language?: unknown;
  definitions?: Array<{ definition?: unknown; parsedExamples?: unknown }>;
}

/** Strip the HTML wiktionary embeds in its own definition strings. */
export function stripMarkup(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The first English sense, preferring a verbal or nominal sense over an obscure
 * one. `null` means "Wiktionary has no English entry this shape" — which the caller
 * treats as a normal absence, not a failure.
 */
export function parseWiktionaryDefinition(json: unknown, term: string): WiktionaryEntry | null {
  if (!json || typeof json !== 'object') return null;
  const english = (json as Record<string, unknown>).en;
  if (!Array.isArray(english)) return null;
  for (const block of english as DefinitionShape[]) {
    if (!block || typeof block !== 'object') continue;
    const definitions = Array.isArray(block.definitions) ? block.definitions : [];
    for (const definition of definitions) {
      const text = stripMarkup(definition?.definition);
      if (text.length < 8) continue;
      return {
        partOfSpeech: stripMarkup(block.partOfSpeech) || undefined,
        definition: text.length > 240 ? `${text.slice(0, 240).replace(/\s+\S*$/, '')}…` : text,
        url: `https://en.wiktionary.org/wiki/${encodeURIComponent(term.replace(/\s+/g, '_'))}`,
        license: 'Wiktionary, CC BY-SA 4.0',
        sourceName: 'Wiktionary',
      };
    }
  }
  return null;
}

export async function lookupWiktionary(
  term: string,
  context: { fetchImpl?: typeof fetch; sleepImpl?: (ms: number) => Promise<void>; timeoutMs?: number } = {},
): Promise<{ entry: WiktionaryEntry | null; note?: string }> {
  const clean = term.trim().toLowerCase();
  if (!clean || clean.length > 64) return { entry: null, note: 'term not usable for a dictionary lookup' };
  const result = await httpGet(`${API}/${encodeURIComponent(clean)}`, {
    fetchImpl: context.fetchImpl,
    sleepImpl: context.sleepImpl,
    attempts: 1,
    timeoutMs: context.timeoutMs ?? 4_000,
    headers: { accept: 'application/json' },
  });
  if (!result.ok) return { entry: null, note: result.note };
  const entry = parseWiktionaryDefinition(result.json, clean);
  return entry ? { entry } : { entry: null, note: 'no English definition in the response' };
}
