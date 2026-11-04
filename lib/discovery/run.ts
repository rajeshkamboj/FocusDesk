/**
 * The scheduled discovery runner for the Literature collection.
 *
 * This is a *thin* orchestration layer over the existing Curiosity machinery: it
 * picks the adapters for a collection, runs them independently, gives each one its
 * own cursor, then hands everything to `persistCollectionRun` (which uses the
 * reservoir's own validation, deduplication and store).
 *
 * WHY IT IS SCHEDULED AND NOT PER-PAGE-VIEW
 * Nothing here is reachable from a React component or a route handler. The only
 * callers are `scripts/discover-literature.ts` and the
 * `discovery-literature.yml` workflow, so a reader's page load can never trigger an
 * outbound request to a third party.
 *
 * ISOLATION
 * Every adapter runs inside its own try/catch and converts any throw into a failed
 * `SourceReport`. One unreachable source therefore produces one red line in the run
 * log and zero lost work from the others — the property the audit asked for.
 */

import type { CandidateDraft } from '../curiosity/reservoir';
import { getCandidateStore, type CandidateStore } from '../curiosity/reservoir';
import type { DiscoveryTrigger } from '../curiosity/types';
import {
  summarizeSourceReports,
  type KnowledgeCollection,
  type SourceReport,
} from './collection';
import { persistCollectionRun, type PersistCollectionResult } from './persist';
import type { AdapterContext, DiscoveryAdapter } from './sources/types';
import { gutenbergAdapter } from './sources/gutenberg';
import { standardEbooksAdapter } from './sources/standard-ebooks';
import { wikisourceAdapter } from './sources/wikisource';

export const LITERATURE_ADAPTERS: readonly DiscoveryAdapter[] = [
  gutenbergAdapter,
  standardEbooksAdapter,
  wikisourceAdapter,
];

export function adaptersForCollection(collection: KnowledgeCollection): readonly DiscoveryAdapter[] {
  if (collection === 'literature') return LITERATURE_ADAPTERS;
  return [];
}

export interface RunCollectionOptions {
  collection: 'literature';
  trigger?: DiscoveryTrigger;
  now?: Date;
  store?: CandidateStore;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  /** Restrict the run to named adapters (used by the harness and manual runs). */
  onlySources?: readonly string[];
  maxRecordsPerSource?: number;
  /** Skip the cursor round-trip; useful for a one-off manual run. */
  useCursors?: boolean;
}

export interface CollectionRunOutcome {
  collection: 'literature';
  ranAt: string;
  drafts: CandidateDraft[];
  reports: SourceReport[];
  persistence: PersistCollectionResult;
  summary: string;
  /** The cursor values this run leaves behind, keyed by adapter id. */
  nextCursors: Record<string, string>;
}

/** Run one adapter, converting any throw (and any hang-up) into a report. */
export async function runAdapter(
  adapter: DiscoveryAdapter,
  context: AdapterContext,
): Promise<{ drafts: CandidateDraft[]; report: SourceReport }> {
  if (!adapter.enabled()) {
    return {
      drafts: [],
      report: {
        sourceId: adapter.id,
        sourceName: adapter.name,
        status: 'disabled',
        fetched: 0,
        accepted: 0,
        rejected: 0,
        duplicates: 0,
        note: 'switched off by configuration',
        finishedAt: context.nowIso,
      },
    };
  }
  try {
    const outcome = await adapter.run(context);
    return { drafts: outcome.drafts, report: outcome.report };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      drafts: [],
      report: {
        sourceId: adapter.id,
        sourceName: adapter.name,
        status: 'failed',
        fetched: 0,
        accepted: 0,
        rejected: 0,
        duplicates: 0,
        // The adapter is at fault, not the reader: keep the message short and free
        // of URLs that might carry a token.
        note: `adapter threw: ${message.slice(0, 160)}`,
        finishedAt: context.nowIso,
      },
    };
  }
}

/**
 * Discover, validate, deduplicate and persist one collection.
 *
 * Never throws. A total store failure still returns a full report so the scheduled
 * job can exit non-zero with a reason instead of an unhandled stack trace.
 */
export async function runCollectionDiscovery(options: RunCollectionOptions): Promise<CollectionRunOutcome> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const store = options.store ?? getCandidateStore();
  const adapters = adaptersForCollection(options.collection).filter((adapter) =>
    options.onlySources ? options.onlySources.includes(adapter.id) : true,
  );

  const cursors = options.useCursors === false ? {} : await store.readCursors().catch(() => ({} as Record<string, string>));
  const drafts: CandidateDraft[] = [];
  const reports: SourceReport[] = [];
  const nextCursors: Record<string, string> = {};

  // Sequential on purpose: the sources share a rate limiter keyed by host, and a
  // burst of parallel requests is exactly what their terms ask clients not to do.
  for (const adapter of adapters) {
    const cursorKey = `discovery:${options.collection}:${adapter.id}`;
    const { drafts: adapterDrafts, report } = await runAdapter(adapter, {
      fetchImpl: options.fetchImpl,
      sleepImpl: options.sleepImpl,
      nowIso,
      maxRecords: options.maxRecordsPerSource,
      cursor: cursors[cursorKey],
    });
    drafts.push(...adapterDrafts);
    reports.push(report);
    const advanced = advanceCursor(adapter.id, cursors[cursorKey], adapterDrafts.length, report);
    if (advanced !== undefined) nextCursors[adapter.id] = advanced;
  }

  const persistence = await persistCollectionRun({
    collection: options.collection,
    drafts,
    reports,
    trigger: options.trigger ?? 'cron',
    nowIso,
    store,
    strictness: 'catalogue',
  });

  if (options.useCursors !== false) {
    for (const [adapterId, value] of Object.entries(nextCursors)) {
      try {
        await store.writeCursor(
          `discovery:${options.collection}:${adapterId}`,
          options.collection === 'literature' ? 'book' : 'one-thing',
          value,
        );
      } catch {
        persistence.notes.push(`cursor for ${adapterId} could not be saved; the next run will repeat this window`);
      }
    }
  }

  const counts = summarizeSourceReports(reports);
  const summary = [
    `${options.collection}: ${counts.sources} source${counts.sources === 1 ? '' : 's'}`,
    `${counts.accepted} accepted`,
    `${persistence.written} written`,
    `${persistence.metrics.duplicateRejections} duplicate`,
    `${counts.failed} failed`,
    persistence.unmigrated ? 'NOT PERSISTED (migration missing)' : persistence.persisted ? 'persisted' : 'NOT PERSISTED',
  ].join(' · ');

  return {
    collection: options.collection,
    ranAt: nowIso,
    drafts,
    reports,
    persistence,
    summary,
    nextCursors,
  };
}

/**
 * How far a source advanced. Kept as a pure function so the paging rules can be
 * tested without any adapter running — and so a source that failed does **not**
 * move its cursor forward, which would skip a window forever.
 */
export function advanceCursor(
  adapterId: string,
  previous: string | undefined,
  acceptedCount: number,
  report: SourceReport,
): string | undefined {
  if (report.status === 'failed' || report.status === 'disabled') return undefined;
  const previousNumber = Number(previous);
  const base = Number.isFinite(previousNumber) ? previousNumber : 0;
  switch (adapterId) {
    case 'gutenberg':
      // Ids, not pages: advance past the window that was scanned.
      return String(base + Math.max(1, report.fetched + Math.max(1, acceptedCount)));
    case 'standard-ebooks':
    case 'openstax':
      // Position in a rotating catalogue.
      return String(base + Math.max(1, acceptedCount));
    case 'wikipedia-science':
    case 'wikidata':
    case 'nasa':
    case 'europepmc':
    case 'wikisource':
      // Topic rotation.
      return String(base + 1);
    default:
      return String(base + Math.max(1, acceptedCount));
  }
}
