/**
 * Scheduled literature discovery.
 *
 * Run by `.github/workflows/discovery-literature.yml` once a day, and by hand:
 *
 *   npx tsx scripts/discover-literature.ts --trigger=cli
 *   npx tsx scripts/discover-literature.ts --sources=gutenberg,wikisource --max=6
 *
 * Never called from the app. This is the only path that talks to Project Gutenberg,
 * Standard Ebooks and Wikisource, which is what keeps a reader's page load free of
 * outbound requests.
 *
 * Exit codes are chosen so a scheduler can act on them:
 *   0 — at least one source worked and the run persisted what it found
 *   2 — the sources worked but the store refused the write (usually a migration)
 *   3 — every source failed (the run is not a success just because it did not crash)
 */

import { runCollectionDiscovery } from '../lib/discovery/run';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main(): Promise<void> {
  const trigger = (arg('trigger') ?? 'cli') as 'cron' | 'admin' | 'cli' | 'publish-replenish';
  const onlySources = arg('sources')?.split(',').map((value) => value.trim()).filter(Boolean);
  const maxRecords = arg('max') ? Number(arg('max')) : undefined;

  const outcome = await runCollectionDiscovery({
    collection: 'literature',
    trigger,
    onlySources,
    maxRecordsPerSource: Number.isFinite(maxRecords) ? maxRecords : undefined,
  });

  console.log(outcome.summary);
  console.log('');
  console.log('Sources');
  for (const report of outcome.reports) {
    const counts = `${report.fetched} fetched, ${report.accepted} accepted, ${report.rejected} rejected, ${report.duplicates} duplicate`;
    console.log(`  ${report.status.padEnd(8)} ${report.sourceId.padEnd(18)} ${counts}${report.note ? ` — ${report.note}` : ''}`);
  }
  console.log('');
  console.log(`Persisted: ${outcome.persistence.persisted ? 'yes' : 'no'}${outcome.persistence.unmigrated ? ' (curiosity_candidates is not migrated — apply supabase/migrations/011_curiosity_candidates.sql)' : ''}`);
  console.log(`Written this run: ${outcome.persistence.written} row(s); duplicates rejected: ${outcome.persistence.metrics.duplicateRejections}`);
  if (outcome.persistence.notes.length > 0) {
    console.log('');
    console.log('Notes');
    for (const note of outcome.persistence.notes.slice(0, 20)) console.log(`  - ${note}`);
  }

  const anyWorked = outcome.reports.some((report) => report.status === 'ok' || report.status === 'partial');
  if (!anyWorked) {
    console.error('');
    console.error('Every literature source failed or was disabled; nothing was discovered.');
    process.exit(3);
  }
  if (!outcome.persistence.persisted) {
    console.error('');
    console.error('Discovery succeeded but the reservoir write failed.');
    process.exit(2);
  }
}

void main();
