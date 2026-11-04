/**
 * Persisting a collection run through the existing Curiosity reservoir.
 *
 * The whole point of this module is that Literature and Science **do not get
 * their own storage**. They write through `mergeCandidateDrafts`, the validation
 * gate and `CandidateStore` — the same functions the Curiosity discovery job uses
 * — so:
 *
 *   - deduplication is the reservoir's existing cross-record logic (canonical id,
 *     entity id, normalized identity, canonical URL, fingerprint, title aliases
 *     and shingle similarity), not a second implementation that can disagree;
 *   - the run log lands in `curiosity_discovery_runs`, so one table answers "when
 *     did anything last discover anything";
 *   - idempotency comes for free: `mergeCandidateDrafts` returns only the rows
 *     whose content actually changed, so re-running a discovery pass over
 *     unchanged upstream data writes nothing.
 *
 * A collection's own report (per-source success/failure) is attached to the run
 * notes, which is where an operator already looks.
 */

import {
  getCandidateStore,
  mergeCandidateDrafts,
  type CandidateDraft,
  type CandidateStore,
  type UpsertBatchMetrics,
} from '../curiosity/reservoir';
import { validateCandidate } from '../curiosity/reservoir';
import type { KnowledgeCandidate } from '../curiosity/types';
import {
  COLLECTION_VALIDATION,
  collectionAllowsCategory,
  describeCollectionRun,
  summarizeSourceReports,
  type CollectionRunHeader,
  type KnowledgeCollection,
  type SourceReport,
  type ValidationStrictness,
} from './collection';

export interface PersistCollectionOptions {
  collection: KnowledgeCollection;
  drafts: readonly CandidateDraft[];
  reports: readonly SourceReport[];
  trigger: CollectionRunHeader['trigger'];
  nowIso: string;
  store?: CandidateStore;
  strictness?: ValidationStrictness;
  /** Persist even when nothing changed (used by the harness to prove idempotency). */
  forceWrite?: boolean;
}

export interface PersistCollectionResult {
  /** Rows actually written (new or changed). Empty means a fully idempotent re-run. */
  written: number;
  merged: KnowledgeCandidate[];
  metrics: UpsertBatchMetrics;
  persisted: boolean;
  unmigrated: boolean;
  /** Notes for the operator: migration missing, store refused, invalid categories. */
  notes: string[];
  summary: string;
}

/**
 * Additional catalogue-level checks that run *before* the standard gate.
 *
 * The standard gate in `validateCandidate` is the Curiosity one and is not
 * weakened. These checks are additive: they reject a bibliographic or research
 * record that the generic gate would have accepted, and they never accept one it
 * would reject. The description-length floor is adjusted through the named
 * `catalogue` policy rather than by editing the shared gate.
 */
export function catalogueValidationNotes(draft: CandidateDraft, strictness: ValidationStrictness): string[] {
  const policy = COLLECTION_VALIDATION[strictness];
  const notes: string[] = [];
  const payload = draft.payload ?? {};

  if (/<[a-z][\s\S]*>/i.test(draft.description ?? '')) {
    notes.push('description contains HTML markup');
  }
  const kind = typeof payload.kind === 'string' ? payload.kind : '';
  if (policy.authorRequiredKinds.includes(kind)) {
    const author = typeof payload.author === 'string' ? payload.author.trim() : '';
    if (author.length < 2) notes.push('no named author');
  }
  if (policy.requireLanguage) {
    const language = typeof payload.language === 'string' ? payload.language.trim() : '';
    if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(language)) notes.push('no usable language code');
  }
  if (policy.requireRightsStatement) {
    const rights = typeof payload.rights === 'string' ? payload.rights : '';
    const licence = draft.license?.trim() ?? '';
    if (!rights && !licence) notes.push('no rights or licence statement');
  }
  return notes;
}

/**
 * Validate, deduplicate and persist one collection run.
 *
 * Never throws: a store failure is reported as `persisted: false` with the run
 * still summarised, because a scheduler that crashes hides the information the
 * operator needed.
 */
export async function persistCollectionRun(options: PersistCollectionOptions): Promise<PersistCollectionResult> {
  const store = options.store ?? getCandidateStore();
  const strictness = options.strictness ?? 'catalogue';
  const policy = COLLECTION_VALIDATION[strictness];
  const notes: string[] = [];
  const accepted: CandidateDraft[] = [];
  let rejected = 0;

  for (const draft of options.drafts) {
    if (!collectionAllowsCategory(options.collection, draft.category)) {
      rejected += 1;
      notes.push(`${draft.id}: category "${draft.category}" is not part of the ${options.collection} collection`);
      continue;
    }
    if ((draft.description ?? '').trim().length < policy.minDescriptionChars) {
      rejected += 1;
      notes.push(`${draft.id}: description shorter than ${policy.minDescriptionChars} characters`);
      continue;
    }
    const extra = catalogueValidationNotes(draft, strictness);
    if (extra.length > 0) {
      rejected += 1;
      notes.push(`${draft.id}: ${extra.join('; ')}`);
      continue;
    }
    // The shared gate runs last, unchanged, so a catalogue record still has to
    // satisfy every structural, URL, attribution and licence rule Curiosity uses.
    const outcome = validateCandidate({ ...draft, updatedAt: options.nowIso });
    if (!outcome.ok) {
      rejected += 1;
      notes.push(`${draft.id}: ${outcome.reasons.join('; ')}`);
      continue;
    }
    accepted.push(draft);
  }

  const existing = await store.readAll();
  const metrics = mergeCandidateDrafts(existing, accepted, options.nowIso);

  // Source-level accounting. `fetched` is the adapter's own number; what survived
  // the gate is this function's, and it is reported for the run as a whole rather
  // than invented per source — attributing one source's rejections to another
  // would be worse than admitting the run-level tally.
  const reports: SourceReport[] = options.reports.map((report) =>
    report.status === 'failed' || report.status === 'disabled' || report.status === 'skipped'
      ? report
      : { ...report },
  );
  void rejected;

  const header: CollectionRunHeader = {
    collection: options.collection,
    ranAt: options.nowIso,
    trigger: options.trigger,
    categoriesChecked: [...new Set(accepted.map((draft) => draft.category))],
    reports,
    notes,
  };
  const sourceSummary = summarizeSourceReports(reports);

  let persisted = true;
  let unmigrated = false;
  const writeResult = await store.writeUpsert(
    options.forceWrite ? metrics.merged.filter((candidate) => accepted.some((draft) => draft.id === candidate.id)) : metrics.toWrite,
  );
  persisted = writeResult.persisted;
  unmigrated = Boolean(writeResult.unmigrated);

  if (unmigrated) {
    notes.push('curiosity_candidates table not migrated; apply supabase/migrations/011_curiosity_candidates.sql to persist this collection');
  } else if (!persisted) {
    notes.push('the candidate store refused the write (check SUPABASE_SECRET_KEY or file permissions)');
  }

  try {
    await store.appendRunLog({
      ranAt: options.nowIso,
      trigger: options.trigger,
      categoriesChecked: [...header.categoriesChecked],
      lowStockCategories: [],
      eligibleByCategory: Object.fromEntries(
        [...new Set(metrics.merged.map((candidate) => candidate.category))]
          .map((category) => [category, metrics.merged.filter((c) => c.category === category && c.eligible).length]),
      ),
      newDiscovered: metrics.newDiscovered,
      duplicateRejections: metrics.duplicateRejections,
      validationFailures: metrics.validationFailures + rejected,
      sourceFailures: sourceSummary.failed,
      cooldownRelaxations: 0,
      notes: [
        describeCollectionRun(header),
        ...reports.map((report) => `${report.sourceId}: ${report.status}${report.note ? ` — ${report.note}` : ''}`),
        ...notes.slice(0, 12),
      ],
    });
  } catch {
    notes.push('the discovery run log could not be written; the records themselves were still validated');
  }

  return {
    written: metrics.toWrite.length,
    merged: metrics.merged,
    metrics,
    persisted,
    unmigrated,
    notes,
    summary: describeCollectionRun(header),
  };
}
