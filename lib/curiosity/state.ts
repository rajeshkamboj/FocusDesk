import { createHash } from 'node:crypto';
import { access, constants, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import type { BookRecommendation, CuriosityBriefing, CuriosityCategory, CuriosityDurability, PublishedContentIds } from './types';
import { LEGACY_SEEN_CATEGORIES } from './catalog';

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

/**
 * One row of the publication ledger.
 *
 * `category` is a card key (see `catalog.ts`) — a superset of the four pool
 * categories this type used to hold, which is why the field is typed as a string
 * with a documented meaning rather than the narrow union. Rows written before the
 * enrichment have only the first three fields; everything else is optional and is
 * simply absent for them.
 */
export type SeenRecord = {
  category: string;
  id: string;
  on: string;
  /** The item's title at publication time, for duplicate-title detection. */
  title?: string;
  /** Canonical URL the reader was sent to. */
  url?: string;
  /** Stable hash of normalized title + body. */
  fingerprint?: string;
  /** Compact shingle signature, for near-duplicate detection. */
  signature?: string;
  /** Entity/subject keys this item occupied. */
  subjects?: string[];
  /** Where the text came from, recorded so attribution survives in the ledger. */
  source?: string;
  /** Content version: changes only when the wording changes. */
  version?: string;
};
export type RunRecord = { at: string; trigger: RefreshTrigger; ok: boolean; detail: string };

export type CuriosityState = {
  version: 1;
  daily: PublishedDaily | null;
  book: PublishedBook | null;
  seen: SeenRecord[];
  runs: RunRecord[];
};

export const emptyState = (): CuriosityState => ({ version: 1, daily: null, book: null, seen: [], runs: [] });

/**
 * Rows kept in the ledger.
 *
 * Fourteen cards × 365 days is ~5,100 rows a year, and the cooldown needs a year
 * of history, so the old cap of 400 was itself a repetition bug: after a few
 * weeks the ledger forgot the very items it was supposed to exclude. The cap is
 * now three years' worth, which keeps a file-store document a few megabytes at
 * worst and never truncates inside a cooldown window.
 */
export const MAX_SEEN_RECORDS = 20_000;
export const MAX_RUN_RECORDS = 25;
/** Retention window for publication history: three years, twice the longest cooldown. */
export const MAX_SEEN_AGE_DAYS = 1095;

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
  /**
   * What "it is stored" actually buys: whether a restart, or a second instance, will
   * find the same record. The page and the settings panel show this instead of letting
   * a successful write imply a durability the backend does not have.
   */
  readonly durability: CuriosityDurability;
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
  const seen = Array.isArray(state.seen) ? state.seen : [];
  // Age pruning is relative to the newest record, not to the wall clock, so the
  // same document normalises identically on two machines and a test with a fixed
  // date does not depend on when it ran.
  let newest = '';
  for (const record of seen) if (record.on > newest) newest = record.on;
  const cutoff = newest ? new Date(Date.parse(`${newest}T00:00:00Z`) - MAX_SEEN_AGE_DAYS * 86_400_000).toISOString().slice(0, 10) : '';
  const retained = cutoff ? seen.filter((record) => record.on >= cutoff) : seen;
  return {
    version: 1,
    daily: state.daily ?? null,
    book: state.book ?? null,
    seen: retained.slice(-MAX_SEEN_RECORDS),
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

/** A filesystem that refuses writes outright, as opposed to a bug of ours. */
function isRefusedByTheFilesystem(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EROFS' || code === 'EACCES' || code === 'EPERM';
}

/**
 * Where the state goes when the deployment directory cannot be written — which is
 * the normal case on Vercel (`/var/task` is read-only) and on any immutable image.
 * Concatenated rather than `join()` so the bundler keeps its hands off it; the
 * directory is created by the same code that creates it for any other path.
 */
export function ephemeralStatePath(): string {
  return `${tmpdir()}/focusdesk-curiosity/state.json`;
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
  private settled: { path: string; ephemeral: boolean; why?: string } | null = null;

  constructor(readonly configuredPath = stateFilePath()) {}

  /** The path this process actually uses, once chosen. */
  get path(): string {
    return this.settled?.path ?? this.configuredPath;
  }

  /**
   * Where the record lives, in the operator's words rather than ours: when the
   * configured path had to be abandoned, `location` carries the errno and the new
   * path, because "it is in /tmp, for this instance only" is the difference between
   * a deployment that persists content and one that republishes it on every boot.
   */
  /**
   * A file on a writable disk outlives a restart and nothing else; a file in a temp
   * directory outlives nothing. Both are worth saying out loud, because "the run
   * published successfully" reads like a promise this backend cannot keep.
   */
  get durability(): CuriosityDurability {
    if (!this.settled) return 'unproven';
    return this.settled.ephemeral ? 'instance-only' : 'single-host';
  }

  get location() {
    const settled = this.settled;
    if (!settled) return this.configuredPath;
    if (!settled.ephemeral) return settled.path;
    return `${settled.path} · ephemeral: moved there because ${settled.why ?? 'the deployment filesystem was read-only'}`;
  }

  /**
   * Choose a writable location, once per process, and never throw: a publisher that
   * cannot prove a directory is writable should still try, and the write itself will
   * report what happened. A render never calls this — reading is not a write, and an
   * unwritable deployment must still be able to serve the day it can find.
   */
  private async settlePath(): Promise<void> {
    if (this.settled) return;
    try {
      const dir = dirname(this.configuredPath);
      await mkdir(dir, { recursive: true });
      await access(dir, constants.W_OK);
      this.settled = { path: this.configuredPath, ephemeral: false };
    } catch (error) {
      const why = isRefusedByTheFilesystem(error) ? `${(error as NodeJS.ErrnoException).code} on ${dirname(this.configuredPath)}` : `the configured path was unusable (${error instanceof Error ? error.message : String(error)})`;
      this.settled = { path: ephemeralStatePath(), ephemeral: true, why };
    }
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
    await this.settlePath();
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
  readonly durability = 'shared' as const;
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
        this.readLedger(),
      ]);
      const daily = briefings.find((row) => row.kind === 'daily');
      const book = briefings.find((row) => row.kind === 'book');
      return normalizeState({
        version: 1,
        daily: daily ? hydrateDaily(daily) : null,
        book: book ? hydrateBook(book) : null,
        seen: seen.map(hydrateSeen).reverse(),
        runs: [],
      });
    } catch {
      // A missing migration, a cold project or a bad network all land here. The
      // caller treats "nothing published" as "use the fallback pool", so the page
      // keeps working; the reason is reported by the admin action instead.
      return emptyState();
    }
  }

  /**
   * The publication ledger, newest first.
   *
   * Three things changed from the original four-hundred-row read, and all three
   * were repetition bugs rather than scale concerns:
   *
   *  - **Enough rows.** 400 rows is four or five weeks across fourteen cards, so
   *    a 365-day cooldown could not be enforced against the database at all.
   *    Pages of 1,000 up to 8,000 records cover three years.
   *  - **The identity columns**, when the deployment has applied migration 010.
   *    A pre-010 table is detected from the 400 response and the read degrades to
   *    the three original columns — the selection layer then falls back to
   *    id-only history, which is a documented, visible degradation.
   *  - **`offset` paging**, because PostgREST caps a response at 1,000 rows by
   *    default and silently truncating history is the failure mode this change
   *    exists to remove.
   */
  private async readLedger(): Promise<Record<string, unknown>[]> {
    const enriched = 'category,content_id,shown_on,title,url,fingerprint,signature,subjects,source,version';
    const legacy = 'category,content_id,shown_on';
    let columns = enriched;
    const rows: Record<string, unknown>[] = [];
    for (let page = 0; page < 8; page += 1) {
      const result = await this.selectRaw(`curiosity_seen?order=shown_on.desc&select=${columns}&limit=1000&offset=${page * 1000}`);
      if (!result.ok) {
        // The first page failing the enriched projection is the pre-010 table;
        // anything later is a transport failure, and partial history is better
        // than none because the lease and the snapshot still prevent duplicates.
        if (page === 0 && columns !== legacy && (result.status === 400 || result.status === 404)) {
          columns = legacy;
          continue;
        }
        if (page === 0) throw new Error(`Supabase ledger read failed (${result.status})`);
        break;
      }
      rows.push(...result.rows);
      if (result.rows.length < 1000) break;
    }
    return rows;
  }

  private async selectRaw(query: string, key = this.readKey): Promise<{ ok: boolean; status: number; rows: Record<string, unknown>[] }> {
    const response = await fetch(`${this.url}/rest/v1/${query}`, {
      headers: this.headers(key),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { ok: false, status: response.status, rows: [] };
    const body = (await response.json()) as unknown;
    return { ok: true, status: response.status, rows: Array.isArray(body) ? (body as Record<string, unknown>[]) : [] };
  }

  private async select(query: string, key = this.readKey): Promise<Record<string, unknown>[]> {
    const result = await this.selectRaw(query, key);
    if (!result.ok) throw new Error(`Supabase read failed (${result.status})`);
    return result.rows;
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

  /**
   * Persist a state document.
   *
   * Write order is part of the correctness argument and is the reverse of the
   * original: the **ledger first, the snapshot second**.
   *
   *  - Ledger-then-snapshot means a crash between the two records that an item
   *    was published when the reader never saw it. The cost is one item skipped
   *    by the rotation — the safe direction.
   *  - Snapshot-then-ledger (the old order) meant a crash could publish a day
   *    whose items were never recorded, and the next run would happily pick them
   *    again. That is precisely the "why did I read this last week" failure.
   *
   * The ledger write also degrades instead of failing the publish: an
   * unmigrated table (no identity columns, narrower category CHECK) is retried
   * with the original columns and the legacy category list. History for the new
   * cards is lost until the migration is applied; the day is not.
   */
  private async persist(state: CuriosityState): Promise<void> {
    await this.writeLedger(state.seen);

    const rows: Record<string, unknown>[] = [];
    if (state.daily) rows.push(toBriefingRow('daily', state.daily));
    if (state.book) rows.push(toBriefingRow('book', state.book));
    if (rows.length) {
      const response = await fetch(`${this.url}/rest/v1/curiosity_briefings`, {
        method: 'POST',
        headers: { ...this.headers(this.writeKey), prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Supabase briefing write failed (${response.status})`);
    }
  }

  private async writeLedger(records: readonly SeenRecord[]): Promise<void> {
    if (!records.length) return;
    const enriched = records.slice(-MAX_SEEN_RECORDS).map((record) => ({
      category: record.category,
      content_id: record.id,
      shown_on: record.on,
      ...(record.title ? { title: record.title } : {}),
      ...(record.url ? { url: record.url } : {}),
      ...(record.fingerprint ? { fingerprint: record.fingerprint } : {}),
      ...(record.signature ? { signature: record.signature } : {}),
      ...(record.subjects?.length ? { subjects: record.subjects } : {}),
      ...(record.source ? { source: record.source } : {}),
      ...(record.version ? { version: record.version } : {}),
    }));
    const post = async (body: unknown) =>
      fetch(`${this.url}/rest/v1/curiosity_seen`, {
        method: 'POST',
        headers: { ...this.headers(this.writeKey), prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });

    let response = await post(enriched);
    if (response.ok) return;

    // Pre-010 table: no identity columns, and a category CHECK that only accepts
    // the original ten keys. Retry with the original shape before giving up.
    if (response.status === 400 || response.status === 409 || response.status === 422) {
      const legacy = records
        .filter((record) => LEGACY_SEEN_CATEGORIES.includes(record.category))
        .slice(-MAX_SEEN_RECORDS)
        .map((record) => ({ category: record.category, content_id: record.id, shown_on: record.on }));
      if (legacy.length) {
        response = await post(legacy);
        if (response.ok) return;
      }
    }
    throw new Error(`Supabase ledger write failed (${response.status})`);
  }
}

type BriefingRow = Record<string, unknown>;

/**
 * A ledger row back into a `SeenRecord`.
 *
 * `subjects`, `title` and the signature are only present on rows written after
 * migration 010; an older row is still a usable id-and-day record, which is why
 * every extra field is read defensively rather than required.
 */
export function hydrateSeen(row: BriefingRow): SeenRecord {
  const subjects = Array.isArray(row.subjects) ? row.subjects.map(String).filter(Boolean) : undefined;
  return {
    category: String(row.category),
    id: String(row.content_id),
    on: String(row.shown_on).slice(0, 10),
    ...(typeof row.title === 'string' && row.title ? { title: row.title } : {}),
    ...(typeof row.url === 'string' && row.url ? { url: row.url } : {}),
    ...(typeof row.fingerprint === 'string' && row.fingerprint ? { fingerprint: row.fingerprint } : {}),
    ...(typeof row.signature === 'string' && row.signature ? { signature: row.signature } : {}),
    ...(subjects?.length ? { subjects } : {}),
    ...(typeof row.source === 'string' && row.source ? { source: row.source } : {}),
    ...(typeof row.version === 'string' && row.version ? { version: row.version } : {}),
  };
}

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
