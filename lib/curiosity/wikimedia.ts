/**
 * Polite, bounded clients for Wikimedia MediaWiki Action API, Wikimedia REST
 * On-This-Day feed, and Wikidata Action / SPARQL APIs.
 *
 * Preserves every existing call signature while adding:
 *  - exponential backoff honouring `Retry-After` (`computeBackoffMs`, injectable `sleepImpl`),
 *  - `cmcontinue` pagination & multi-page traversal in `wikipediaCategoryMembers`,
 *  - multi-batch chunking (`wikipediaLeadsBatched`),
 *  - Wikimedia REST On-This-Day structured client (`wikimediaOnThisDay`),
 *  - batch entity alias lookup (`wikidataAliases`), and
 *  - Wikidata Query Service SPARQL client (`wikidataSparql`).
 */

export const WIKIMEDIA_TIMEOUT_MS = 8_000;
export const WIKIMEDIA_ATTEMPTS = 2;
export const WIKIMEDIA_BASE_BACKOFF_MS = 700;
export const WIKIMEDIA_MAX_BACKOFF_MS = 5_000;

export const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
export const WIKIPEDIA_REST = 'https://en.wikipedia.org/api/rest_v1';
export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
export const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

export type WikimediaNote = { text?: string };
export type SleepImpl = (ms: number) => Promise<void>;

export interface WikimediaFetchOptions {
  fetchImpl?: typeof fetch;
  sleepImpl?: SleepImpl;
  timeoutMs?: number;
  attempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  note?: WikimediaNote;
}

export function wikimediaUserAgent(): string {
  const contact = process.env.WIKIMEDIA_CONTACT_EMAIL?.trim();
  return `FocusDesk/0.1 (curiosity daily briefing${contact ? `; contact: ${contact}` : ''}; https://github.com/rajeshkamboj/FocusDesk)`;
}

export function wikimediaEnabled(): boolean {
  const v = (process.env.CURIOSITY_WIKIMEDIA ?? '').trim().toLowerCase();
  return v !== 'off' && v !== 'false' && v !== '0';
}

function transient(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeBackoffMs(
  attempt: number,
  retryAfterHeader?: string | null,
  baseMs = WIKIMEDIA_BASE_BACKOFF_MS,
  maxMs = WIKIMEDIA_MAX_BACKOFF_MS,
): number {
  if (retryAfterHeader) {
    const retryAfter = Number(retryAfterHeader.trim());
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return Math.min(Math.round(retryAfter * 1000), maxMs);
    }
  }
  return Math.min(maxMs, Math.round(baseMs * Math.pow(2, Math.max(0, attempt - 1))));
}

async function rawJsonGet(
  fullUrl: string,
  hostLabel: string,
  options: WikimediaFetchOptions = {},
  accept = 'application/json',
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const doSleep = options.sleepImpl ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? WIKIMEDIA_TIMEOUT_MS;
  const attempts = Math.max(1, options.attempts ?? WIKIMEDIA_ATTEMPTS);
  const baseBackoff = options.baseBackoffMs ?? WIKIMEDIA_BASE_BACKOFF_MS;
  const maxBackoff = options.maxBackoffMs ?? WIKIMEDIA_MAX_BACKOFF_MS;

  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(fullUrl, {
        headers: {
          accept,
          'user-agent': wikimediaUserAgent(),
          'api-user-agent': wikimediaUserAgent(),
          'accept-language': 'en',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        if (!transient(response.status)) break;
        if (attempt < attempts) {
          await doSleep(computeBackoffMs(attempt, response.headers.get('retry-after'), baseBackoff, maxBackoff));
        }
        continue;
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        lastError = 'unparseable JSON response';
        break;
      }
      if (body && typeof body === 'object' && 'error' in (body as Record<string, unknown>) && (body as Record<string, unknown>).error) {
        const detail = (body as { error: { code?: unknown; info?: unknown } }).error;
        lastError = `API error ${String(detail.code ?? '')}: ${String(detail.info ?? '').slice(0, 120)}`;
        break;
      }
      return body;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = /abort|timeout/i.test(message) ? `no answer within ${Math.round(timeoutMs / 1000)}s` : message;
      if (attempt < attempts) {
        await doSleep(computeBackoffMs(attempt, null, baseBackoff, maxBackoff));
      }
    }
  }
  if (options.note) options.note.text = `${hostLabel}: ${lastError || 'no usable response'}`;
  return null;
}

/** A MediaWiki/Wikidata Action API JSON GET with bounded retries and Retry-After support. */
export async function wikimediaJson(
  base: string,
  params: Record<string, string | number | boolean | undefined>,
  options: WikimediaFetchOptions = {},
): Promise<Record<string, unknown> | null> {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === false) continue;
    url.searchParams.set(key, value === true ? '1' : String(value));
  }
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  const body = await rawJsonGet(url.toString(), url.hostname, options, 'application/json');
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
}

/* ------------------------------------------------------------------ */
/* Wikipedia Action API                                                */
/* ------------------------------------------------------------------ */

export interface WikipediaPage {
  title: string;
  url: string;
  extract: string;
  wikidataId?: string;
  length?: number;
}

export const UNSUITABLE_TITLE = /^(list of|lists of|index of|outline of|timeline of|glossary of|history of the|category:|template:|portal:|wikipedia:|draft:|help:|file:|talk:)/i;
export const DISAMBIGUATION_TITLE = /\(disambiguation\)$|^disambiguation/i;

export interface CategoryMembersResult {
  titles: string[];
  pagesRead: number;
  nextContinue?: string;
  exhausted: boolean;
  note?: string;
}

/**
 * Reads category member titles from Wikipedia, supporting `cmcontinue` cursor
 * continuation across scheduled discovery runs (`continueFrom`, `maxPages`).
 */
export async function wikipediaCategoryMembers(
  category: string,
  options: WikimediaFetchOptions & { limit?: number; continueFrom?: string; maxPages?: number } = {},
): Promise<CategoryMembersResult> {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 1, 10));
  const seen = new Set<string>();
  const allTitles: string[] = [];
  let cursor = options.continueFrom;
  let pagesRead = 0;

  for (let page = 0; page < maxPages; page += 1) {
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
        ...(cursor ? { cmcontinue: cursor } : {}),
      },
      { ...options, note },
    );
    const members = (body?.query as { categorymembers?: unknown } | undefined)?.categorymembers;
    if (!Array.isArray(members)) {
      if (!note.text) note.text = `en.wikipedia.org returned no members for ${category}`;
      if (options.note) options.note.text = note.text;
      return {
        titles: allTitles,
        pagesRead,
        ...(cursor ? { nextContinue: cursor } : {}),
        exhausted: false,
        note: note.text,
      };
    }
    pagesRead += 1;
    for (const member of members) {
      const title = (member as { title?: unknown }).title;
      if (typeof title === 'string' && title.trim().length > 0 && !seen.has(title)) {
        seen.add(title);
        allTitles.push(title);
      }
    }
    const next = (body?.continue as { cmcontinue?: unknown } | undefined)?.cmcontinue;
    cursor = typeof next === 'string' && next.length > 0 ? next : undefined;
    if (!cursor) {
      return { titles: allTitles, pagesRead, exhausted: true };
    }
  }

  return {
    titles: allTitles,
    pagesRead,
    ...(cursor ? { nextContinue: cursor } : {}),
    exhausted: !cursor,
  };
}

/** Lead sections for up to twenty titles in one MediaWiki Action request. */
export async function wikipediaLeads(
  titles: readonly string[],
  options: WikimediaFetchOptions = {},
): Promise<{ pages: WikipediaPage[]; note?: string }> {
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

/** Chunked multi-batch wrapper over `wikipediaLeads` (20 pages per batch). */
export async function wikipediaLeadsBatched(
  titles: readonly string[],
  options: WikimediaFetchOptions & { maxBatches?: number } = {},
): Promise<{ pages: WikipediaPage[]; notes: string[] }> {
  const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  const maxBatches = Math.max(1, Math.min(options.maxBatches ?? 3, 10));
  const pages: WikipediaPage[] = [];
  const notes: string[] = [];
  for (let offset = 0, batch = 0; offset < unique.length && batch < maxBatches; offset += 20, batch += 1) {
    const res = await wikipediaLeads(unique.slice(offset, offset + 20), options);
    pages.push(...res.pages);
    if (res.note) notes.push(res.note);
  }
  return { pages, notes };
}

/* ------------------------------------------------------------------ */
/* Wikimedia REST API: On This Day feed                                */
/* ------------------------------------------------------------------ */

export interface OnThisDayArticlePage {
  title: string;
  extract: string;
  wikidataId?: string;
  url: string;
}

export interface OnThisDayFeedEntry {
  year: number;
  text: string;
  pages: OnThisDayArticlePage[];
}

const inFlightOnThisDay = new Map<string, Promise<{ events: OnThisDayFeedEntry[]; note?: string }>>();

export async function wikimediaOnThisDay(
  month: number,
  day: number,
  options: WikimediaFetchOptions & { feedKind?: 'selected' | 'events' } = {},
): Promise<{ events: OnThisDayFeedEntry[]; note?: string }> {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
    return { events: [], note: `invalid month-day ${month}-${day}` };
  }
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const kind = options.feedKind ?? 'selected';
  const flightKey = `${kind}:${mm}-${dd}`;
  if (!options.fetchImpl && inFlightOnThisDay.has(flightKey)) {
    return inFlightOnThisDay.get(flightKey)!;
  }
  const run = (async () => {
    const note: WikimediaNote = {};
    const body = await rawJsonGet(
      `${WIKIPEDIA_REST}/feed/onthisday/${kind}/${mm}/${dd}`,
      'en.wikipedia.org',
      { ...options, note },
      'application/json',
    );
    if (!body || typeof body !== 'object') {
      if (options.note) options.note.text = note.text ?? 'empty onthisday response';
      return { events: [], note: note.text ?? 'empty onthisday response' };
    }
    const rawList = (body as Record<string, unknown>)[kind];
    if (!Array.isArray(rawList)) {
      const msg = `en.wikipedia.org returned malformed onthisday.${kind}`;
      if (options.note) options.note.text = msg;
      return { events: [], note: msg };
    }
    const currentYear = new Date().getUTCFullYear();
    const events: OnThisDayFeedEntry[] = [];
    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as {
        year?: unknown;
        text?: unknown;
        pages?: Array<{
          titles?: { normalized?: string };
          title?: string;
          extract?: string;
          wikibase_item?: string;
          content_urls?: { desktop?: { page?: string } };
        }>;
      };
      if (typeof entry.year !== 'number' || !Number.isInteger(entry.year) || entry.year < -10_000 || entry.year > currentYear) {
        continue;
      }
      if (typeof entry.text !== 'string' || entry.text.trim().length < 12) continue;

      const pages: OnThisDayArticlePage[] = [];
      for (const p of entry.pages ?? []) {
        const title = (p?.titles?.normalized ?? p?.title ?? '').replace(/_/g, ' ').trim();
        const pageUrl = p?.content_urls?.desktop?.page ?? '';
        if (!title || !/^https?:\/\/\S+$/i.test(pageUrl)) continue;
        pages.push({
          title,
          extract: (p?.extract ?? '').trim(),
        ...(p?.wikibase_item ? { wikidataId: p.wikibase_item } : {}),
        url: pageUrl,
      });
    }
    if (pages.length === 0) continue;
    events.push({ year: entry.year, text: entry.text.trim(), pages });
  }
  return { events };
  })();
  inFlightOnThisDay.set(flightKey, run);
  try {
    return await run;
  } finally {
    inFlightOnThisDay.delete(flightKey);
  }
}

/* ------------------------------------------------------------------ */
/* Wikidata Action API & SPARQL Query Service                          */
/* ------------------------------------------------------------------ */

export interface WikidataEntity {
  id: string;
  label?: string;
  description?: string;
  aliases: string[];
  articleUrl?: string;
}

export async function wikidataSearchEntity(
  name: string,
  options: WikimediaFetchOptions = {},
): Promise<{ entity: WikidataEntity | null; note?: string }> {
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

export async function wikidataAliases(
  ids: readonly string[],
  options: WikimediaFetchOptions = {},
): Promise<{ aliases: Map<string, string[]>; note?: string }> {
  const out = new Map<string, string[]>();
  const unique = [...new Set(ids.filter((id) => /^Q\d+$/.test(id)))].slice(0, 50);
  if (unique.length === 0) return { aliases: out };
  const note: WikimediaNote = {};
  const body = await wikimediaJson(
    WIKIDATA_API,
    { action: 'wbgetentities', ids: unique.join('|'), props: 'labels|aliases', languages: 'en' },
    { ...options, note },
  );
  const entities = body?.entities as Record<string, unknown> | undefined;
  if (!entities || typeof entities !== 'object') {
    return { aliases: out, ...(note.text ? { note: note.text } : {}) };
  }
  for (const [id, raw] of Object.entries(entities)) {
    const e = raw as {
      labels?: { en?: { value?: string } };
      aliases?: { en?: { value?: string }[] };
    };
    const names: string[] = [];
    if (e.labels?.en?.value) names.push(e.labels.en.value);
    for (const a of e.aliases?.en ?? []) if (a.value) names.push(a.value);
    out.set(id, names);
  }
  return { aliases: out };
}

export type SparqlRow = Record<string, string>;

export async function wikidataSparql(
  query: string,
  options: WikimediaFetchOptions = {},
): Promise<{ rows: SparqlRow[]; note?: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { rows: [] };
  const params = new URLSearchParams({ query: trimmed, format: 'json' });
  const note: WikimediaNote = {};
  const body = await rawJsonGet(
    `${WIKIDATA_SPARQL}?${params}`,
    'query.wikidata.org',
    options,
    'application/sparql-results+json',
  );
  if (!body || typeof body !== 'object') {
    return { rows: [], note: note.text ?? 'empty SPARQL response' };
  }
  const bindings = (body as { results?: { bindings?: unknown } }).results?.bindings;
  if (!Array.isArray(bindings)) {
    return { rows: [], note: 'query.wikidata.org returned malformed SPARQL bindings' };
  }
  const rows: SparqlRow[] = [];
  for (const rawRow of bindings) {
    if (!rawRow || typeof rawRow !== 'object') continue;
    const flat: SparqlRow = {};
    for (const [key, cell] of Object.entries(rawRow as Record<string, { value?: unknown }>)) {
      if (cell && typeof cell.value === 'string') flat[key] = cell.value.trim();
    }
    if (Object.keys(flat).length > 0) rows.push(flat);
  }
  return { rows };
}
