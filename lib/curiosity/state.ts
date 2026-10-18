import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { BookRecommendation, CuriosityBriefing, CuriosityCategory, PublishedContentIds } from './types';

/**
 * The published record: what was published, when, from which content ids, and
 * what the last few runs did.
 *
 * Two backends, one contract:
 *
 *  - **Supabase** (`curiosity_briefings` + `curiosity_seen` + `curiosity_jobs`)
 *    when the project URL and a server-side secret key are configured. This is
 *    the durable, multi-instance answer: the scheduler writes, the app reads,
 *    and the row survives every deploy and restart.
 *  - **File** otherwise, at `.curiosity/state.json`. That is the local and
 *    self-hosted answer, and it is why the feature works with zero credentials:
 *    a laptop or a single box keeps its published days across restarts without
 *    needing a database.
 *
 * The contract has three parts, and the third is the reason the other two
 * exist:
 *
 *  - `read()` never throws. A missing or corrupt record reads as “nothing
 *    published yet”, which sends the app to its built-in fallback instead of an
 *    error page.
 *  - `write()` is an append of a complete snapshot, keyed by the publication
 *    date, so a day is published at most once and a late or duplicated run
 *    overwrites only its own day.
 *  - `withLease()` runs a job while holding a single-flight lease, so two
 *    schedulers (or a scheduler and an admin click) cannot interleave a
 *    publish. A lease expires, which is what makes a crashed run recoverable
 *    instead of permanently stuck.
 */

/**
 * Everything published for a day *except* the book.
 *
 * `book` is stored in its own record because it changes on a three-day
 * interval: folding it into the daily snapshot would either republish metadata
 * daily or make the daily record depend on the book's freshness.
 */
export type DailyPayload = Omit<CuriosityBriefing, 'date' | 'publication' | 'book'>;

export type RefreshTrigger = 'cron' | 'admin' | 'cli' | 'startup';

export type PublishedDaily = {
  /** The Asia/Kolkata day this content is *for*. */
  date: string;
  /** The instant the publish succeeded. */
  publishedAt: string;
  contentIds: PublishedContentIds;
  payload: DailyPayload;
  /** Cards whose live source failed and are showing their fallback text. */
  degraded: string[];
  trigger: RefreshTrigger;
};

export type PublishedBook = {
  date: string;
  publishedAt: string;
  contentId: string;
  payload: BookRecommendation;
  degraded: string[];
  trigger: RefreshTrigger;
};

export type SeenRecord = { category: CuriosityCategory; id: string; on: string };
export type RunRecord = { at: string; trigger: RefreshTrigger; ok: boolean; detail: string };

export type CuriosityState = {
  version: 1;
  daily: PublishedDaily | null;
  book: PublishedBook | null;
  seen: SeenRecord[];
  runs: RunRecord[];
};

export const emptyState = (): CuriosityState => ({ version: 1, daily: null, book: null, seen: [], runs: [] });

/** Rows kept per ledger, so the state file cannot grow without bound. */
export const MAX_SEEN_RECORDS = 400;
export const MAX_RUN_RECORDS = 25;

/**
 * A job decides *what* to persist and the store decides *whether it may*.
 * Returning `null` from the mutator means "nothing to write" — the usual answer
 * when today's snapshot already exists — and it still counts as a successful,
 * non-overlapping run.
 */
export type StatePatch = Partial<Omit<CuriosityState, 'version'>> | null;

export type LeaseResult =
  | { ok: true; wrote: boolean; state: CuriosityState }
  /** The lease was already held by another run. */
  | { ok: false; reason: 'busy'; state: CuriosityState }
  /** The store itself refused the write; the previous snapshot is untouched. */
  | { ok: false; reason: 'error'; error: string; state: CuriosityState };

export interface CuriosityStateStore {
  readonly kind: 'supabase' | 'file';
  /** Where the record lives, for the settings panel and the run log. */
  readonly location: string;
  read(): Promise<CuriosityState>;
  /**
   * The most recent run, for deployments where the run log is not kept in the
   * state document. The file store answers from `state.runs`; the database store
   * answers from the job row its lease carries, so the operator sees the same
   * "did the schedule fire?" line in Settings whichever backend is in use.
   */
  lastRun?(): Promise<{ at: string; ok: boolean; detail: string } | null>;
  /** Applies `mutate` to the current state and persists the result under a lease. */
  withLease(ttlMs: number, mutate: (state: CuriosityState) => StatePatch | Promise<StatePatch>): Promise<LeaseResult>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

export function isState(value: unknown): value is CuriosityState {
  return Boolean(value && typeof value === 'object' && (value as CuriosityState).version === 1 && 'daily' in value && 'seen' in value);
}

/** Trims and orders the ledgers; both stores persist through this. */
export function normalizeState(input: Partial<CuriosityState> | null | undefined): CuriosityState {
  const state = isState(input) ? input : emptyState();
  return {
    version: 1,
    daily: state.daily ?? null,
    book: state.book ?? null,
    seen: Array.isArray(state.seen) ? state.seen.slice(-MAX_SEEN_RECORDS) : [],
    runs: Array.isArray(state.runs) ? state.runs.slice(-MAX_RUN_RECORDS) : [],
  };
}

export function appendSeen(state: CuriosityState, records: SeenRecord[]): CuriosityState {
  const seen = [...state.seen, ...records].slice(-MAX_SEEN_RECORDS);
  return { ...state, seen };
}

export function appendRun(state: CuriosityState, run: RunRecord): CuriosityState {
  return { ...state, runs: [...state.runs, run].slice(-MAX_RUN_RECORDS) };
}

/**
 * Content ids shown recently in a category.
 *
 * The ledger is the whole defence against “today is yesterday again”, because
 * the rotation itself only guarantees variety across days, not across an
 * interrupted or repeated schedule. `lookbackDays` bounds how far back that
 * memory reaches; it should stay below the pool length, or the rotation would
 * run out of fresh material and silently start repeating anyway.
 */
export function recentSeenIds(state: CuriosityState, category: CuriosityCategory, lookbackDays = 30): string[] {
  const sorted = [...state.seen].filter((record) => record.category === category).sort((a, b) => (a.on < b.on ? 1 : -1));
  const ids: string[] = [];
  let lastDate: string | null = null;
  let days = 0;
  for (const record of sorted) {
    if (record.on !== lastDate) {
      days += 1;
      lastDate = record.on;
    }
    if (days > lookbackDays) break;
    if (!ids.includes(record.id)) ids.push(record.id);
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* File store                                                          */
/* ------------------------------------------------------------------ */

/**
 * Relative to the process working directory, which is where Next.js and the CLI
 * both run from. Set an absolute path when the working directory is not the
 * persistent one — the usual case for a container with a mounted volume.
 */
export const DEFAULT_STATE_FILE = '.curiosity/state.json';

/**
 * Deliberately not `path.resolve()`: Turbopack statically traces the argument of
 * `resolve`/`join`, and a dynamic one makes it warn that the *whole project* has
 * to be traced into the deployment. Node resolves a relative path against
 * `process.cwd()` when the file call happens — same result, smaller bundle.
 */
export function stateFilePath(): string {
  const configured = process.env.CURIOSITY_STATE_FILE?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_STATE_FILE;
}

/**
 * Single-process, cross-restart, and honest about what it cannot do.
 *
 * The lock file is created with `wx`, so creation itself is the atomic claim:
 * two processes cannot both succeed. It is released by token, so a slow run
 * never deletes a lease that has already been handed to someone else, and an
 * expired lease is broken rather than waited on forever. What this cannot do is
 * coordinate two machines on different filesystems — that is what the Supabase
 * store is for, and `location` in the settings panel says which one is active.
 */
export class FileStateStore implements CuriosityStateStore {
  readonly kind = 'file' as const;
  constructor(readonly path = stateFilePath()) {}

  get location() {
    return this.path;
  }

  private get lockPath() {
    return `${this.path}.lock`;
  }

  async read(): Promise<CuriosityState> {
    try {
      return normalizeState(JSON.parse(await readFile(this.path, 'utf8')) as Partial<CuriosityState>);
    } catch {
      return emptyState();
    }
  }

  private async write(state: CuriosityState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    // Write-then-rename: a reader either sees the previous file or the new one,
    // never a half-written snapshot.
    const temp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(temp, this.path);
  }

  private async tryAcquire(ttlMs: number): Promise<string | null> {
    const token = createHash('sha256').update(`${process.pid}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 16);
    await mkdir(dirname(this.lockPath), { recursive: true });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await writeFile(this.lockPath, JSON.stringify({ token, expiresAt: Date.now() + ttlMs }), { flag: 'wx' });
        return token;
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
        const holder = await readFile(this.lockPath, 'utf8').catch(() => '');
        let expired = true;
        try {
          const parsed = JSON.parse(holder || '{}') as { expiresAt?: number };
          expired = typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now();
        } catch {
          expired = true;
        }
        if (!expired) return null;
        await unlink(this.lockPath).catch(() => {});
      }
    }
    return null;
  }

  private async release(token: string): Promise<void> {
    const holder = await readFile(this.lockPath, 'utf8').catch(() => '');
    try {
      if ((JSON.parse(holder || '{}') as { token?: string }).token === token) await unlink(this.lockPath).catch(() => {});
    } catch {
      await unlink(this.lockPath).catch(() => {});
    }
  }

  async withLease(ttlMs: number, mutate: (state: CuriosityState) => StatePatch | Promise<StatePatch>): Promise<LeaseResult> {
    const current = await this.read();
    let token: string | null;
    try {
      token = await this.tryAcquire(ttlMs);
    } catch (error) {
      return { ok: false, reason: 'error', error: error instanceof Error ? error.message : String(error), state: current };
    }
    if (!token) return { ok: false, reason: 'busy', state: current };
    try {
      // Re-read under the lease, so the mutator sees the state its predecessor
      // committed rather than the one that was on disk when we started.
      const state = await this.read();
      const patch = await mutate(state);
      if (!patch) return { ok: true, wrote: false, state };
      const next = normalizeState({ ...state, ...patch });
      await this.write(next);
      return { ok: true, wrote: true, state: next };
    } catch (error) {
      return { ok: false, reason: 'error', error: error instanceof Error ? error.message : String(error), state: current };
    } finally {
      await this.release(token).catch(() => {});
    }
  }
}

/* ------------------------------------------------------------------ */
/* Supabase store                                                      */
/* ------------------------------------------------------------------ */

/**
 * PostgREST hands a scalar-returning function back as a one-element array
 * (`["token"]`), and as an empty array or a `[null]` when the function returned
 * NULL — which is exactly the "someone else holds the lease" case. Older
 * PostgREST versions and the `prefer` headers in play also produce the bare
 * string or an object, so all four shapes are read here rather than hoping the
 * deployment's version matches one. Treating an unrecognised shape as "busy"
 * would be the dangerous mistake: the scheduler would silently stop publishing.
 */
export function leaseToken(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'string') return first.length > 0 ? first : null;
  if (first && typeof first === 'object') {
    const row = first as Record<string, unknown>;
    for (const key of ['lease_token', 'token', 'result']) {
      if (typeof row[key] === 'string' && row[key].length > 0) return row[key] as string;
    }
  }
  return null;
}

/**
 * Server-side only.
 *
 * Reads go through the anon key, because the Curiosity tables are world-readable
 * and contain no user data. Every write goes through the service-role key, which
 * therefore must never appear in a `NEXT_PUBLIC_*` variable or reach the browser:
 * the tables' row-level security allows select to anyone and writes to no one, so
 * the service key is the only way the publisher can persist anything at all. That
 * is also what keeps the endpoint safe: a caller who can reach `/api/curiosity/refresh`
 * without a credential can trigger a fetch, never write.
 */
export class SupabaseStateStore implements CuriosityStateStore {
  readonly kind = 'supabase' as const;
  constructor(
    private readonly url: string,
    private readonly readKey: string,
    private readonly writeKey: string,
  ) {}

  get location() {
    return `${this.url.replace(/^https?:\/\//, '')} · curiosity_briefings`;
  }

  /** `curiosity_jobs` is the only table this reads, and only for reporting. */
  async lastRun(): Promise<{ at: string; ok: boolean; detail: string } | null> {
    try {
      const [row] = await this.select('curiosity_jobs?select=last_result,last_error,last_finished_at&id=eq.1');
      if (!row || (!row.last_finished_at && !row.last_result && !row.last_error)) return null;
      const error = typeof row.last_error === 'string' && row.last_error.length > 0 ? row.last_error : null;
      const result = typeof row.last_result === 'string' && row.last_result.length > 0 ? row.last_result : error ? 'failed' : 'no result recorded';
      return { at: String(row.last_finished_at ?? ''), ok: !error, detail: error ? `${result} · ${error}` : result };
    } catch {
      return null;
    }
  }

  private headers(key: string) {
    return {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json',
    };
  }

  /** A snapshot is one row: (kind, date) with the payload the app renders. */
  async read(): Promise<CuriosityState> {
    try {
      const [briefings, seen] = await Promise.all([
        this.select('curiosity_briefings?order=date_key.desc&select=kind,date_key,published_at,content_ids,payload,degraded,trigger&limit=60'),
        this.select('curiosity_seen?order=shown_on.desc&select=category,content_id,shown_on&limit=400'),
      ]);
      const daily = briefings.find((row) => row.kind === 'daily');
      const book = briefings.find((row) => row.kind === 'book');
      return normalizeState({
        version: 1,
        daily: daily ? hydrateDaily(daily) : null,
        book: book ? hydrateBook(book) : null,
        seen: seen
          .map((row) => ({ category: String(row.category) as CuriosityCategory, id: String(row.content_id), on: String(row.shown_on) }))
          .reverse(),
        runs: [],
      });
    } catch {
      // A missing migration, a cold project or a bad network all land here. The
      // caller treats "nothing published" as "use the fallback pool", so the page
      // keeps working; the reason is reported by the admin action instead.
      return emptyState();
    }
  }

  private async select(query: string, key = this.readKey): Promise<Record<string, unknown>[]> {
    const response = await fetch(`${this.url}/rest/v1/${query}`, {
      headers: this.headers(key),
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error(`Supabase read failed (${response.status})`);
    return (await response.json()) as Record<string, unknown>[];
  }

  private async rpc(name: string, args: Record<string, unknown>) {
    const response = await fetch(`${this.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { ...this.headers(this.writeKey), prefer: 'return=representation' },
      body: JSON.stringify(args),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Supabase ${name} failed (${response.status})`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  /**
   * The lease is `pg_try_advisory_lock` semantics expressed in a row, so that
   * PostgREST can run it: `curiosity_acquire_lease` claims the job only when the
   * stored lease is missing or expired, and returns whether this caller won.
   */
  async withLease(ttlMs: number, mutate: (state: CuriosityState) => StatePatch | Promise<StatePatch>): Promise<LeaseResult> {
    const current = await this.read();
    let acquired: unknown;
    try {
      acquired = await this.rpc('curiosity_acquire_lease', { lease_seconds: Math.ceil(ttlMs / 1000) });
    } catch (error) {
      return { ok: false, reason: 'error', error: error instanceof Error ? error.message : String(error), state: current };
    }
    const token = leaseToken(acquired);
    if (!token) return { ok: false, reason: 'busy', state: current };
    // Recorded on the job row so `select * from curiosity_jobs` answers "did the
    // schedule actually publish?" without needing the app's own logs.
    let outcome = { result: 'no-op', error: null as string | null };
    try {
      const state = await this.read();
      const patch = await mutate(state);
      if (!patch) return { ok: true, wrote: false, state };
      const next = normalizeState({ ...state, ...patch });
      await this.persist(next);
      outcome = { result: `published ${next.daily?.date ?? '—'}`.slice(0, 60), error: null };
      return { ok: true, wrote: true, state: next };
    } catch (error) {
      outcome = { result: 'failed', error: (error instanceof Error ? error.message : String(error)).slice(0, 200) };
      return { ok: false, reason: 'error', error: error instanceof Error ? error.message : String(error), state: current };
    } finally {
      await this.rpc('curiosity_release_lease', { lease_token: token, result: outcome.result, error: outcome.error }).catch(() => null);
    }
  }

  private async persist(state: CuriosityState): Promise<void> {
    const rows: Record<string, unknown>[] = [];
    if (state.daily) rows.push(toBriefingRow('daily', state.daily));
    if (state.book) rows.push(toBriefingRow('book', state.book));
    if (rows.length) {
      await fetch(`${this.url}/rest/v1/curiosity_briefings`, {
        method: 'POST',
        headers: { ...this.headers(this.writeKey), 'prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
        signal: AbortSignal.timeout(8_000),
      }).then(async (response) => {
        if (!response.ok) throw new Error(`Supabase briefing write failed (${response.status})`);
      });
    }
    const seen = state.seen.slice(-MAX_SEEN_RECORDS).map((record) => ({ category: record.category, content_id: record.id, shown_on: record.on }));
    if (seen.length) {
      await fetch(`${this.url}/rest/v1/curiosity_seen`, {
        method: 'POST',
        headers: { ...this.headers(this.writeKey), 'prefer': 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(seen),
        signal: AbortSignal.timeout(8_000),
      }).then(async (response) => {
        if (!response.ok) throw new Error(`Supabase ledger write failed (${response.status})`);
      });
    }
  }
}

type BriefingRow = Record<string, unknown>;

function toBriefingRow(kind: 'daily' | 'book', published: PublishedDaily | PublishedBook): BriefingRow {
  const bookOnly = 'contentId' in published ? published.contentId : null;
  return {
    kind,
    date_key: published.date,
    published_at: published.publishedAt,
    content_ids: 'contentIds' in published ? Object.values(published.contentIds) : [bookOnly],
    content_id_map: 'contentIds' in published ? published.contentIds : { book: bookOnly },
    payload: published.payload,
    degraded: published.degraded,
    source_trigger: published.trigger,
  };
}

function hydrateDaily(row: BriefingRow): PublishedDaily {
  return {
    date: String(row.date_key),
    publishedAt: String(row.published_at),
    contentIds: (row.content_id_map ?? {}) as PublishedDaily['contentIds'],
    payload: row.payload as DailyPayload,
    degraded: Array.isArray(row.degraded) ? (row.degraded as string[]) : [],
    trigger: (row.source_trigger ?? 'cron') as PublishedDaily['trigger'],
  };
}

function hydrateBook(row: BriefingRow): PublishedBook {
  const ids = (row.content_id_map ?? {}) as { book?: string };
  return {
    date: String(row.date_key),
    publishedAt: String(row.published_at),
    contentId: String(ids.book ?? (Array.isArray(row.content_ids) ? row.content_ids[0] : '') ?? ''),
    payload: row.payload as BookRecommendation,
    degraded: Array.isArray(row.degraded) ? (row.degraded as string[]) : [],
    trigger: (row.source_trigger ?? 'cron') as PublishedBook['trigger'],
  };
}

/* ------------------------------------------------------------------ */
/* Which store is in use                                               */
/* ------------------------------------------------------------------ */

export function supabaseStoreConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

let cachedStore: CuriosityStateStore | null = null;
let cachedStoreFor = '';

/**
 * Supabase when it can be trusted to persist, the file otherwise.
 *
 * The URL alone is not enough: without the server-side key the app could read
 * briefings but never publish one, which is a worse failure than an explicit
 * local store. `CURIOSITY_STORE=file` overrides the choice for a machine that
 * has both and wants the file (used by the test harness).
 */
export function getStateStore(): CuriosityStateStore {
  const key = [process.env.CURIOSITY_STORE, process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY ? 'secret' : '', process.env.CURIOSITY_STATE_FILE].join('|');
  if (cachedStore && cachedStoreFor === key) return cachedStore;
  cachedStoreFor = key;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  // Reads use the least privileged key available: the briefings are world-readable,
  // so there is no reason for a read to travel with the service-role key when the
  // publishable one is configured. Only the writes need the secret.
  const readKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '';
  cachedStore =
    process.env.CURIOSITY_STORE !== 'file' && supabaseStoreConfigured()
      ? new SupabaseStateStore(url.replace(/\/$/, ''), readKey, process.env.SUPABASE_SECRET_KEY as string)
      : new FileStateStore();
  return cachedStore;
}

/** Test seam: the harness points the file store at a temp directory. */
export function setStateStoreForTesting(store: CuriosityStateStore | null): void {
  cachedStore = store;
  cachedStoreFor = store ? 'explicit' : '';
}
