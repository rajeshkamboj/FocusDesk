import { isCuriosityCategory } from './pool';
import { isIsoDate } from './schedule';
import type { CuriosityCategory, CuriosityPoolEntry } from './types';

/**
 * The optional database half of the content pool.
 *
 * `supabase/migrations/009_curiosity_content.sql` creates a `curiosity_content`
 * table. Nothing requires it: when the table is missing, empty, or unreachable
 * every function here returns nothing and the app rotates the authored pool it
 * ships with. When rows do exist they are merged *over* the authored pool by id,
 * so the table is a way to retire, re-date or add an item between deploys — not a
 * second source of truth that can leave a day blank.
 *
 * Reads use the public anon key (the rows are world-readable by design); writes
 * need the server-side service-role key, because RLS grants no write to any client
 * role. `backfillPool()` is the only writer, is never reachable from the browser,
 * and exists so an operator can start editing content in the database without
 * retyping it.
 */

type ContentRow = {
  id?: unknown;
  category?: unknown;
  status?: unknown;
  available_from?: unknown;
  title?: unknown;
  payload?: unknown;
  source_url?: unknown;
  source_name?: unknown;
  tags?: unknown;
};

/**
 * Reads and writes need different keys, and the difference is a security property
 * rather than a nicety: the pool is world-readable by design (RLS grants select to
 * anyone, writes to no one), so a read travels with the publishable key. Only the
 * backfill needs the service-role key — and it refuses to run without it, instead
 * of quietly reading with a key it should not have needed.
 */
function restBase(kind: 'read' | 'write'): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  const key = kind === 'write'
    ? process.env.SUPABASE_SECRET_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

/** Does this payload have the fields the card renders? A malformed row is dropped, not trusted. */
function payloadIsUsable(category: CuriosityCategory, payload: Record<string, unknown>): boolean {
  const has = (...keys: string[]) => keys.every((key) => typeof payload[key] === 'string' && (payload[key] as string).trim().length > 0);
  switch (category) {
    case 'one-thing':
      return has('title', 'explanation');
    case 'learn-something':
      return has('topic', 'explanation');
    case 'literature':
      return has('title', 'author', 'passage', 'whyItMatters');
    case 'book':
      return has('title', 'author', 'synopsis', 'why');
    default:
      return false;
  }
}

export function rowToPoolEntry(row: ContentRow): CuriosityPoolEntry<unknown> | null {
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const category = typeof row.category === 'string' ? row.category : '';
  const payload = row.payload;
  if (!id || !isCuriosityCategory(category)) return null;
  if (typeof row.status === 'string' && row.status !== 'published') {
    // A retired row still has to reach the rotation so it can *exclude* the
    // authored item of the same id; everything else is dropped.
    return row.status === 'retired' ? { id, category, availableFrom: '9999-12-31', provenance: 'curated', status: 'retired', item: {} } : null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (!payloadIsUsable(category, payload as Record<string, unknown>)) return null;
  // https only: a hand-typed http link would be blocked as mixed content on an
  // https deployment, so a dropped link is better than a silently broken one.
  const sourceUrl = typeof row.source_url === 'string' && /^https:\/\/[^\s]+$/i.test(row.source_url.trim()) ? row.source_url.trim() : undefined;
  const sourceName = typeof row.source_name === 'string' && row.source_name.trim() ? row.source_name.trim() : undefined;
  const availableFrom = isIsoDate(row.available_from) ? (row.available_from as string) : '2000-01-01';
  return {
    id,
    category,
    availableFrom,
    provenance: 'source-checked',
    status: 'published',
    ...(sourceUrl ? { source: { url: sourceUrl, name: sourceName ?? 'Source' } } : {}),
    tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String) : [],
    item: payload,
  };
}

/**
 * Rows the rotation may use.
 *
 * No date filter in the query: eligibility is decided by `available_from` in
 * `pool.ts` (`eligibleEntries`), so there is exactly one place that decides
 * whether an item may run on a given day. Any failure reads as "no database
 * pool", which is the authored corpus by itself — never an error page.
 */
export async function loadDatabasePool(): Promise<CuriosityPoolEntry<unknown>[]> {
  const rest = restBase('read');
  if (!rest) return [];
  try {
    const query = new URLSearchParams({
      select: 'id,category,status,available_from,title,payload,source_url,source_name,tags',
      status: 'in.(published,retired)',
      order: 'id.asc',
      limit: '500',
    });
    const response = await fetch(`${rest.url}/rest/v1/curiosity_content?${query.toString()}`, {
      headers: { apikey: rest.key, Authorization: `Bearer ${rest.key}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return [];
    const rows = (await response.json()) as ContentRow[];
    if (!Array.isArray(rows)) return [];
    return rows.map(rowToPoolEntry).filter((entry): entry is CuriosityPoolEntry<unknown> => Boolean(entry));
  } catch {
    return [];
  }
}

/**
 * Seed or update `curiosity_content` from the authored pool.
 *
 * Upsert on id, never delete: retiring an item is a status change so the ledger
 * keeps pointing at a real row. Requires the service-role key, which is why this
 * is only reachable from the CLI and not from the refresh endpoint.
 */
export async function backfillPool(entries: CuriosityPoolEntry<unknown>[]): Promise<{ written: number; error?: string }> {
  const rest = restBase('write');
  if (!rest) return { written: 0, error: 'Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY).' };
  if (!process.env.SUPABASE_SECRET_KEY) return { written: 0, error: 'A service-role key is required to write the content pool.' };
  const rows = entries.map((entry) => ({
    id: entry.id,
    category: entry.category,
    status: entry.status ?? 'published',
    available_from: entry.availableFrom,
    title:
      typeof (entry.item as { title?: unknown }).title === 'string'
        ? (entry.item as { title: string }).title
        : typeof (entry.item as { topic?: unknown }).topic === 'string'
          ? (entry.item as { topic: string }).topic
          : entry.id,
    payload: entry.item,
    source_url: entry.source?.url ?? null,
    source_name: entry.source?.name ?? null,
    tags: entry.tags ?? [],
    updated_at: new Date().toISOString(),
  }));
  try {
    const response = await fetch(`${rest.url}/rest/v1/curiosity_content`, {
      method: 'POST',
      headers: { apikey: rest.key, Authorization: `Bearer ${rest.key}`, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { written: 0, error: `Supabase wrote nothing (${response.status}): ${(await response.text()).slice(0, 200)}` };
    return { written: rows.length };
  } catch (error) {
    return { written: 0, error: error instanceof Error ? error.message : String(error) };
  }
}
