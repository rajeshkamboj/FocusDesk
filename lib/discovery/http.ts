/**
 * A polite, bounded HTTP client for third-party discovery sources.
 *
 * Every source this project reads has terms that boil down to: identify
 * yourself, do not hammer us, back off when told, and cache what you can. This
 * module is those four rules in one place so no adapter has to remember them.
 *
 * It exists separately from `lib/curiosity/wikimedia.ts` because the Wikimedia
 * client is written around MediaWiki's Action API (format=json, api-user-agent,
 * `cmcontinue`). A Gutenberg RDF file, a Standard Ebooks OPDS feed, a NASA image
 * API and a Europe PMC search are all plain JSON/XML GETs with different
 * parameters, and bending the MediaWiki client to do that would have meant a
 * second, worse implementation hiding inside the first.
 *
 * Nothing here throws: a failed request returns a structured result with a
 * human-readable note, because one unreachable source must never stop the others.
 */

export const DEFAULT_TIMEOUT_MS = 12_000;
export const DEFAULT_ATTEMPTS = 2;
export const DEFAULT_BASE_BACKOFF_MS = 900;
export const DEFAULT_MAX_BACKOFF_MS = 8_000;

export type SleepImpl = (ms: number) => Promise<void>;

export interface HttpOptions {
  /** Injected for deterministic tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  sleepImpl?: SleepImpl;
  timeoutMs?: number;
  attempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /** Extra headers (an `accept`, a source-specific user agent suffix). */
  headers?: Record<string, string>;
  /** Set false to disable the shared per-host rate limiter. */
  rateLimit?: boolean;
}

export interface HttpOk {
  ok: true;
  status: number;
  /** Parsed JSON when the body is JSON, otherwise undefined. */
  json?: unknown;
  /** Raw body, always populated. */
  text: string;
  headers: Headers;
}

export interface HttpFailure {
  ok: false;
  status: number;
  /** Short, reader-safe reason. Never includes a URL with a key in it. */
  note: string;
}

export type HttpResult = HttpOk | HttpFailure;

/**
 * The contact address every source's usage terms ask for.
 *
 * `WIKIMEDIA_CONTACT_EMAIL` already exists and is reused so a deployment does not
 * need a second variable; if it is unset the agent string simply omits the
 * contact, which is what a local run wants.
 */
export function discoveryUserAgent(tool: string): string {
  const contact = process.env.WIKIMEDIA_CONTACT_EMAIL?.trim() || process.env.DISCOVERY_CONTACT_EMAIL?.trim();
  return `FocusDesk/0.1 (${tool}${contact ? `; contact: ${contact}` : ''}; https://github.com/rajeshkamboj/FocusDesk)`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeHttpBackoffMs(
  attempt: number,
  retryAfterHeader?: string | null,
  baseMs = DEFAULT_BASE_BACKOFF_MS,
  maxMs = DEFAULT_MAX_BACKOFF_MS,
): number {
  if (retryAfterHeader) {
    const trimmed = retryAfterHeader.trim();
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(Math.round(seconds * 1000), maxMs);
    // `Retry-After` may also be an HTTP date.
    const at = Date.parse(trimmed);
    if (Number.isFinite(at)) return Math.min(Math.max(0, at - Date.now()), maxMs);
  }
  return Math.min(maxMs, Math.round(baseMs * 2 ** Math.max(0, attempt - 1)));
}

/* ------------------------------------------------------------------ */
/* Per-host rate limiting                                             */
/* ------------------------------------------------------------------ */

/**
 * A minimum interval between requests to the same host, held in process memory.
 *
 * This is deliberately crude: one scheduled run is one process, and the sources
 * here ask for roughly one request a second rather than a token bucket. A second
 * run in another process is not coordinated — the scheduler's own overlap guard
 * is responsible for that, as it already is for Curiosity.
 */
const lastRequestAt = new Map<string, number>();

export const HOST_MIN_INTERVAL_MS: Record<string, number> = {
  'www.gutenberg.org': 1_000,
  'standardebooks.org': 1_000,
  'en.wikisource.org': 1_000,
  'en.wikipedia.org': 1_000,
  'www.wikidata.org': 1_000,
  'images-api.nasa.gov': 1_000,
  'openstax.org': 1_000,
  'www.ebi.ac.uk': 700,
  'eutils.ncbi.nlm.nih.gov': 1_000,
};

export function resetRateLimiterForTesting(): void {
  lastRequestAt.clear();
}

async function respectHostInterval(host: string, sleep: SleepImpl, enabled: boolean): Promise<void> {
  if (!enabled) return;
  const interval = HOST_MIN_INTERVAL_MS[host];
  if (!interval) return;
  const last = lastRequestAt.get(host);
  const now = Date.now();
  if (last !== undefined) {
    const wait = interval - (now - last);
    if (wait > 0) await sleep(wait);
  }
  lastRequestAt.set(host, Date.now());
}

function transient(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/** Strip query strings from a URL before it can reach a log or a note. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return 'source';
  }
}

/**
 * One bounded GET with retries, `Retry-After` support and per-host spacing.
 *
 * `parseAs: 'json'` (the default) tries `JSON.parse` and degrades to text rather
 * than failing — a source that answers HTML with a 200 is a source problem that
 * the adapter's own validation should report, not a transport error.
 */
export async function httpGet(url: string, options: HttpOptions = {}): Promise<HttpResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const baseBackoff = options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const maxBackoff = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return '';
    }
  })();

  let lastNote = 'no usable response';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await respectHostInterval(host, sleep, options.rateLimit !== false);
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: 'application/json, application/atom+xml, text/xml, text/html;q=0.8, */*;q=0.5',
          'user-agent': discoveryUserAgent('discovery'),
          ...options.headers,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      lastStatus = response.status;
      if (!response.ok) {
        lastNote = `HTTP ${response.status} from ${redactUrl(url)}`;
        if (!transient(response.status)) return { ok: false, status: response.status, note: lastNote };
        if (attempt < attempts) {
          await sleep(computeHttpBackoffMs(attempt, response.headers.get('retry-after'), baseBackoff, maxBackoff));
        }
        continue;
      }
      const text = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return { ok: true, status: response.status, json, text, headers: response.headers };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastNote = /abort|timeout/i.test(message)
        ? `no answer within ${Math.round(timeoutMs / 1000)}s`
        : `request failed (${message.slice(0, 120)})`;
      if (attempt < attempts) {
        await sleep(computeHttpBackoffMs(attempt, null, baseBackoff, maxBackoff));
      }
    }
  }

  return { ok: false, status: lastStatus, note: lastNote };
}
