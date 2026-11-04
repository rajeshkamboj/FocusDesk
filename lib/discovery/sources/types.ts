/**
 * The contract every discovery adapter implements.
 *
 * An adapter does exactly one thing: turn a source's own response into
 * `CandidateDraft`s plus a `SourceReport`. It does not validate (the shared gate
 * does), it does not deduplicate (the reservoir does) and it does not decide
 * eligibility (the rights policy does). Keeping those four jobs apart is what lets
 * one failing source be reported precisely instead of poisoning a run.
 */

import type { CandidateDraft } from '../../curiosity/reservoir';
import type { SourceReport } from '../collection';

export interface AdapterOutcome {
  drafts: CandidateDraft[];
  report: SourceReport;
}

export interface AdapterContext {
  /** Injected for tests; defaults to the real fetch. */
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  /** ISO instant of the run, so every record from one run shares a timestamp. */
  nowIso: string;
  /** Per-source page/record budget, so no single run outruns a rate limit. */
  maxRecords?: number;
  /** Cursor from the previous run, when the source supports paging. */
  cursor?: string;
}

export interface DiscoveryAdapter {
  /** Stable id, unique across all sources. Used in records, reports and cursors. */
  id: string;
  /** Reader-facing name, shown on the card as the source. */
  name: string;
  /** Which collection this adapter serves. */
  collection: 'literature' | 'science';
  /**
   * Whether the source is switched off by configuration. A disabled source is
   * reported as `disabled`, not as a failure — the distinction matters when
   * reading a run log.
   */
  enabled(): boolean;
  run(context: AdapterContext): Promise<AdapterOutcome>;
}

/** An empty, successful report — used when a source legitimately returns nothing. */
export function emptyReport(adapter: Pick<DiscoveryAdapter, 'id' | 'name'>, nowIso: string): SourceReport {
  return {
    sourceId: adapter.id,
    sourceName: adapter.name,
    status: 'ok',
    fetched: 0,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    finishedAt: nowIso,
  };
}

/** A failure report. Never throws, always carries the reason. */
export function failedReport(
  adapter: Pick<DiscoveryAdapter, 'id' | 'name'>,
  nowIso: string,
  note: string,
): SourceReport {
  return {
    sourceId: adapter.id,
    sourceName: adapter.name,
    status: 'failed',
    fetched: 0,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    note,
    finishedAt: nowIso,
  };
}

export function disabledReport(adapter: Pick<DiscoveryAdapter, 'id' | 'name'>, nowIso: string): SourceReport {
  return {
    sourceId: adapter.id,
    sourceName: adapter.name,
    status: 'disabled',
    fetched: 0,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    note: 'switched off by configuration',
    finishedAt: nowIso,
  };
}
