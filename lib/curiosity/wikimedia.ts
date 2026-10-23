/**
 * A very small Wikimedia API client, written for the publisher only.
 *
 * The Curiosity job now runs one discovery pass per day for the three science
 * cards and one entity resolution for the mythology card. That is a handful of
 * requests against two public APIs, which is why this file is deliberately
 * narrow: no SDK, no authentication, no crawl. It asks for one category listing,
 * one batch of article leads and — when the mythology card needs it — one
 * Wikidata entity.
 *
 * OPERATIONAL RULES (from Wikimedia's API etiquette and this app's own history)
 *
 *  - **A descriptive User-Agent with a contact.** Anonymous generic agents are
 *    the ones that get rate-limited first; `metadata.wikimediaUserAgent()` reads
 *    `WIKIMEDIA_CONTACT_EMAIL` when the deployment sets it.
 *  - **A hard timeout and at most two attempts.** A discovery pass that hangs is
 *    worse than one that returns nothing: the daily publish has its own five-minute
 *    budget and curated content to fall back to.
 *  - **Retry only what is transient.** 429/5xx/network errors are retried after a
 *    short delay; a 404 is an answer.
 *  - **Never throw.** Every function returns a result with a `note` naming what
 *    went wrong, because the caller must be able to say *why* a card used its
 *    curated pool instead of saying nothing.
 *  - **Respect `Retry-After`.** When the API sends one, the retry waits at least
 *    that long rather than hammering the endpoint.
 */

export const WIKIMEDIA_TIMEOUT_MS = 8_000;
export const WIKIMEDIA_ATTEMPTS = 2;
/** Wikimedia's API endpoint for the English Wikipedia and Wikidata. */
export const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

export type WikimediaNote = { text?: string };

/**
 * The User-Agent every request carries.
 *
 * Wikimedia's policy asks for a way to contact the operator. The contact address
 * is optional in this app (a self-hosted deployment may not have one), but the
 * client name and the repository are always there, which is what makes the
 * traffic attributable.
 */
export function wikimediaUserAgent(): string {
  const contact = process.env.WIKIMEDIA_CONTACT_EMAIL?.trim();
  return `FocusDesk/0.1 (curiosity daily briefing${contact ? `; contact: ${contact}` : ''}; https://github.com/rajeshkamboj/FocusDesk)`;
}

/** Discovery is on by default; `CURIOSITY_WIKIMEDIA=off` makes the pools purely authored. */
export function wikimediaEnabled(): boolean {
  return (process.env.CURIOSITY_WIKIMEDIA ?? '').toLowerCase() !== 'off';
}

type FetchOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  attempts?: number;
  note?: WikimediaNote;
};

function transient(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/** A JSON GET with the retry policy above. Returns `null` on any failure, with a note. */
export async function wikimediaJson(
  base: string,
  params: Record<string, string | number | boolean | undefined>,
  options: FetchOptions = {},
): Promise<Record<string, unknown> | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? WIKIMEDIA_TIMEOUT_MS;
  const attempts = Math.max(1, options.attempts ?? WIKIMEDIA_ATTEMPTS);
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === false) continue;
    url.searchParams.set(key, value === true ? '1' : String(value));
  }
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url.toString(), {
        headers: {
          accept: 'application/json',
          'user-agent': wikimediaUserAgent(),
          'accept-language': 'en',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        if (!transient(response.status)) break;
        const retryAfter = Number(response.headers.get('retry-after') ?? '');
        if (attempt < attempts) {
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5_000) : 700 * attempt);
        }
        continue;
      }
      const body = (await response.json()) as Record<string, unknown>;
      // The action API reports application-level errors with a 200 and an `error`
      // object — a malformed category, for instance. Treat it as a failure.
      if (body?.error) {
        const detail = body.error as { code?: unknown; info?: unknown };
        lastError = `API error ${String(detail.code ?? '')}: ${String(detail.info ?? '').slice(0, 120)}`;
        break;
      }
      return body;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = /abort|timeout/i.test(message) ? `no answer within ${Math.round(timeoutMs / 1000)}s` : message;
      if (attempt < attempts) await sleep(700 * attempt);
    }
  }
  if (options.note) options.note.text = `${new URL(base).hostname}: ${lastError || 'no usable response'}`;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* Wikipedia                                                           */
/* ------------------------------------------------------------------ */

export interface WikipediaPage {
  title: string;
  /** Canonical article URL, the citation the card shows. */
  url: string;
  /** Plain-text lead section. */
  extract: string;
  /** Wikidata QID, when the page has one. Used as a stable concept id. */
  wikidataId?: string;
  /** Page length from the API, used as a coarse quality signal. */
  length?: number;
}

/** Titles whose names make them unsuitable education material, whatever their text. */
export const UNSUITABLE_TITLE = /^(list of|lists of|index of|outline of|timeline of|glossary of|history of the|category:|template:|portal:|wikipedia:|draft:|help:|file:|talk:)/i;

/** Pages about the word rather than the thing. */
export const DISAMBIGUATION_TITLE = /\(disambiguation\)$|^disambiguation/i;

/**
 * One page of a category listing.
 *
 * `cmtype=page` excludes sub-categories and files, which is what makes a category
 * usable as a candidate pool; the caller still filters titles and then reads the
 * articles themselves. `cmcontinue` is intentionally not followed: one page of up
 * to 200 members a day, rotated by subfield, is a deliberately modest draw on the
 * API, and the cooldown means a single page lasts weeks.
 */
export async function wikipediaCategoryMembers(
  category: string,
  options: FetchOptions & { limit?: number } = {},
): Promise<{ titles: string[]; note?: string }> {
  const note: WikimediaNote = {};
  const body = await wikimediaJson(
    WIKIPEDIA_API,
    {
      action: 'query',
      list: 'categorymembers',
      cmtitle: category.startsWith('Category:') ? category : `Category:${category}`,
      cmtype: 'page',
      cmlimit: Math.min(Math.max(options.limit ?? 200, 1), 500),
      cmnamespace: 0,
    },
    { ...options, note },
  );
  const members = (body?.query as { categorymembers?: unknown } | undefined)?.categorymembers;
  if (!Array.isArray(members)) {
    if (!note.text) note.text = `en.wikipedia.org returned no members for ${category}`;
    if (options.note) options.note.text = note.text;
    return { titles: [], note: note.text };
  }
  const titles = members
    .map((member) => (member as { title?: unknown }).title)
    .filter((title): title is string => typeof title === 'string' && title.trim().length > 0);
  return { titles, ...(note.text ? { note: note.text } : {}) };
}

/**
 * Lead sections for up to twenty titles, in one request.
 *
 * `exintro` + `explaintext` is the cheapest shape that is still usable: it is
 * plain prose (no wiki markup to strip), it arrives batched, and it is exactly
 * the part of an article that states what the thing is. Section text is not
 * fetched, on purpose — a discovered card is built only from sentences the lead
 * actually contains, and a concept whose lead does not support a real-world
 * connection is rejected rather than padded with an invention.
 */
export async function wikipediaLeads(titles: readonly string[], options: FetchOptions = {}): Promise<{ pages: WikipediaPage[]; note?: string }> {
  const batch = titles.slice(0, 20).filter((title) => title.trim());
  if (batch.length === 0) return { pages: [] };
  const note: WikimediaNote = {};
  const body = await wikimediaJson(
    WIKIPEDIA_API,
    {
      action: 'query',
      prop: 'extracts|pageprops|info',
      exintro: true,
      explaintext: true,
      exlimit: 'max',
      inprop: 'url',
      redirects: true,
      titles: batch.join('|'),
    },
    { ...options, note },
  );
  const pages = (body?.query as { pages?: unknown } | undefined)?.pages;
  if (!Array.isArray(pages)) {
    if (options.note) options.note.text = note.text ?? 'en.wikipedia.org returned no pages';
    return { pages: [], ...(note.text ? { note: note.text } : {}) };
  }
  const parsed = (pages as Array<Record<string, unknown>>)
    .filter((page) => page.missing !== true && typeof page.title === 'string')
    .map((page) => {
      const pageprops = (page.pageprops ?? {}) as Record<string, unknown>;
      return {
        title: String(page.title),
        url: typeof page.fullurl === 'string' ? page.fullurl : `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, '_'))}`,
        extract: typeof page.extract === 'string' ? page.extract.trim() : '',
        ...(typeof pageprops.wikibase_item === 'string' ? { wikidataId: pageprops.wikibase_item } : {}),
        ...(typeof page.length === 'number' ? { length: page.length } : {}),
      } satisfies WikipediaPage;
    });
  return { pages: parsed, ...(note.text ? { note: note.text } : {}) };
}

/* ------------------------------------------------------------------ */
/* Wikidata                                                            */
/* ------------------------------------------------------------------ */

export interface WikidataEntity {
  id: string;
  label?: string;
  description?: string;
  aliases: string[];
  /** Canonical English Wikipedia article, when the item has one. */
  articleUrl?: string;
}

/**
 * Resolve a name to a Wikidata entity, with its aliases and article.
 *
 * Two requests at most: `wbsearchentities` to find the most likely item, then
 * `wbgetentities` for aliases and the enwiki sitelink. Both are cached in
 * process for the day (see `discovery.ts`), so a re-run or a manual refresh does
 * not repeat them.
 *
 * The alias list matters for the exact failure this upgrade exists to fix: a
 * character who is "Inanna" in Sumerian and "Ishtar" in Akkadian is one subject,
 * and a selector comparing only the display name would happily publish both.
 */
export async function wikidataSearchEntity(name: string, options: FetchOptions = {}): Promise<{ entity: WikidataEntity | null; note?: string }> {
  const note: WikimediaNote = {};
  const search = await wikimediaJson(
    WIKIDATA_API,
    { action: 'wbsearchentities', search: name, language: 'en', uselang: 'en', type: 'item', limit: 5 },
    { ...options, note },
  );
  const results = (search?.search as unknown[] | undefined) ?? [];
  const best = results
    .map((entry) => entry as { id?: unknown; label?: unknown; description?: unknown; match?: unknown })
    .find((entry) => typeof entry.id === 'string');
  if (!best || typeof best.id !== 'string') {
    if (options.note) options.note.text = note.text ?? `no Wikidata item for ${name}`;
    return { entity: null, ...(note.text ? { note: note.text } : {}) };
  }

  const detail = await wikimediaJson(
    WIKIDATA_API,
    { action: 'wbgetentities', ids: best.id, props: 'aliases|labels|descriptions|sitelinks/urls', languages: 'en', sitefilter: 'enwiki' },
    { ...options, note },
  );
  const entityRow = (detail?.entities as Record<string, Record<string, unknown>> | undefined)?.[best.id];
  const englishAliases = ((entityRow?.aliases as Record<string, Array<{ value?: unknown }>> | undefined)?.en ?? [])
    .map((alias) => alias.value)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const label = (entityRow?.labels as Record<string, { value?: unknown }> | undefined)?.en?.value;
  const description = (entityRow?.descriptions as Record<string, { value?: unknown }> | undefined)?.en?.value;
  const sitelinks = entityRow?.sitelinks as Record<string, { url?: unknown }> | undefined;
  const articleUrl = typeof sitelinks?.enwiki?.url === 'string' ? sitelinks.enwiki.url : undefined;
  return {
    entity: {
      id: best.id,
      ...(typeof label === 'string' ? { label } : {}),
      ...(typeof description === 'string' ? { description } : {}),
      aliases: [...new Set([...englishAliases, typeof best.label === 'string' ? best.label : ''].filter(Boolean))],
      ...(articleUrl ? { articleUrl } : {}),
    },
    ...(note.text ? { note: note.text } : {}),
  };
}
