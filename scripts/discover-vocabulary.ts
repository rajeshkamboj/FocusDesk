/**
 * Scheduled vocabulary discovery for Speak Better.
 *
 * Run by `.github/workflows/vocabulary-discovery.yml` once a day, and by hand:
 *
 *   npx tsx scripts/discover-vocabulary.ts --trigger=cli
 *   npx tsx scripts/discover-vocabulary.ts --max=12 --anchors=6
 *   npx tsx scripts/discover-vocabulary.ts --offline --status-only
 *
 * Never called from the app. This is the only path that talks to Datamuse,
 * Wiktionary and Free Dictionary for vocabulary; a reader's page load reads the
 * reservoir and nothing else.
 *
 * WHAT IT WILL AND WILL NOT PUBLISH
 *   A word becomes a lesson only when all three hold:
 *     1. a lexical source answered for it (Wiktionary, Free Dictionary or both);
 *     2. a measured frequency score maps onto B2 or C1 under the stated table;
 *     3. an editor has written a gloss for it in
 *        `lib/curiosity/content/speak-better-vocabulary.ts`.
 *   A word without a gloss is stored as `needs-review` and is never shown to a
 *   reader. Expanding the curriculum therefore means writing glosses, not loosening
 *   the gate — which is the point.
 *
 * EXIT CODES, so the scheduler can act on them:
 *   0 — the run completed; something was approved or the reservoir is already stocked
 *   2 — the sources worked but the store refused the write (usually: migration 012)
 *   3 — every lexical source failed (a run is not a success because it did not crash)
 */

import { describeVocabularyRun, runVocabularyDiscovery, vocabularyReservoirStatus } from '../lib/discovery/vocabulary/pipeline';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** The publication day in Asia/Kolkata — the same key the publisher uses. */
function publicationDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function main(): Promise<void> {
  const now = new Date();
  const date = arg('date') ?? publicationDay(now);

  if (flag('status-only')) {
    const status = await vocabularyReservoirStatus();
    console.log(`Vocabulary reservoir: ${status.approved} approved, ${status.candidates} candidate rows, ${status.published} published`);
    return;
  }

  const published = arg('published')
    ?.split(',')
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);

  const outcome = await runVocabularyDiscovery({
    date,
    trigger: (arg('trigger') ?? 'cli') as 'cron' | 'admin' | 'cli',
    publishedWords: published,
    anchorsPerRun: arg('anchors') ? Number(arg('anchors')) : undefined,
    maxWordsPerRun: arg('max') ? Number(arg('max')) : undefined,
    offline: flag('offline'),
    now,
  });

  console.log(describeVocabularyRun({
    reports: outcome.reports,
    approved: outcome.approved.length,
    rejected: outcome.rejected.length,
    needsReview: outcome.needsReview.length,
    notes: outcome.notes,
  }));
  console.log('');

  console.log('Sources');
  for (const report of outcome.reports) {
    console.log(
      `  ${report.status.padEnd(8)} ${report.sourceId.padEnd(16)} ${String(report.fetched).padStart(3)} fetched, ${String(report.accepted).padStart(3)} accepted${report.note ? ` — ${report.note}` : ''}`,
    );
  }

  if (outcome.approved.length > 0) {
    console.log('');
    console.log('Approved');
    for (const entry of outcome.approved) {
      const basis = entry.lesson.discovery?.levelBasis === 'estimated-frequency'
        ? `${entry.level} from frequency ${entry.lesson.discovery.frequencyPerMillion ?? '?'}/million`
        : `${entry.level} assigned by the editor`;
      console.log(`  ${entry.lesson.word.word.padEnd(18)} ${basis}`);
    }
  }

  if (outcome.needsReview.length > 0) {
    console.log('');
    console.log('Awaiting an editorial gloss (stored, never published)');
    for (const entry of outcome.needsReview.slice(0, 20)) {
      console.log(`  - ${entry.word}: ${entry.reasons.slice(0, 2).join('; ')}`);
    }
  }

  if (outcome.rejected.length > 0) {
    console.log('');
    console.log('Rejected by the gates');
    for (const entry of outcome.rejected.slice(0, 15)) {
      console.log(`  - ${entry.word}: ${entry.reasons[0] ?? 'no reason recorded'}`);
    }
  }

  console.log('');
  console.log(`Approved lessons already in the reservoir: ${outcome.reservoirApproved}`);
  console.log(
    `Persisted: ${outcome.persisted ? 'yes' : 'no'}${outcome.unmigrated ? ' (curiosity_candidates does not accept category speak-better — apply supabase/migrations/012_vocabulary_candidates.sql)' : ''}`,
  );
  console.log(`Written this run: ${outcome.written} row(s)`);

  const attempted = outcome.reports.filter((report) => report.status !== 'skipped');
  const anyWorked = attempted.some((report) => report.status === 'ok' || report.status === 'partial');
  if (attempted.length > 0 && !anyWorked) {
    console.error('');
    console.error('Every lexical source failed; nothing was discovered and nothing was written.');
    process.exit(3);
  }
  if (!outcome.persisted && outcome.approved.length > 0) {
    console.error('');
    console.error('Discovery approved lessons but the reservoir write failed.');
    process.exit(2);
  }
  if (outcome.unmigrated) {
    // Exit non-zero when there was something to write and nowhere to put it. A run
    // with nothing to write is a normal quiet day, not a failure.
    console.error('');
    console.error('The reservoir is not migrated for vocabulary candidates.');
    process.exit(2);
  }
}

void main();
