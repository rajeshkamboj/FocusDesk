/**
 * Scheduled science discovery.
 *
 * Run by `.github/workflows/curiosity-science-discovery.yml` once a day, and by hand:
 *
 *   npx tsx scripts/discover-science.ts --trigger=cli
 *   npx tsx scripts/discover-science.ts --disciplines=physics,biology --sources=openalex,europepmc
 *   npx tsx scripts/discover-science.ts --verify=off --max=4
 *
 * Never called from the app. This is the only path that talks to OpenAlex, Crossref,
 * Europe PMC and arXiv, which is what keeps a reader's page load free of outbound
 * requests and lets the publisher simply read the reservoir.
 *
 * Exit codes, chosen so a scheduler can act on them:
 *   0 — at least one source worked and the run persisted what it found
 *   2 — the sources worked but the store refused the write (usually a migration)
 *   3 — every source failed (a run is not a success just because it did not crash)
 */

import { describeScienceRun, runScienceDiscovery, type ScienceSourceId } from '../lib/discovery/science-run';
import { SCIENCE_DISCIPLINES, type ScienceDiscipline } from '../lib/discovery/science';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function parseDisciplines(value: string | undefined): readonly ScienceDiscipline[] | undefined {
  if (!value) return undefined;
  const requested = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const valid = requested.filter((entry): entry is ScienceDiscipline =>
    (SCIENCE_DISCIPLINES as readonly string[]).includes(entry),
  );
  return valid.length ? valid : undefined;
}

async function main(): Promise<void> {
  const trigger = (arg('trigger') ?? 'cli') as 'cron' | 'admin' | 'cli' | 'publish-replenish';
  const onlySources = arg('sources')?.split(',').map((value) => value.trim()).filter(Boolean) as ScienceSourceId[] | undefined;
  const max = arg('max') ? Number(arg('max')) : undefined;

  const outcome = await runScienceDiscovery({
    trigger,
    disciplines: parseDisciplines(arg('disciplines')),
    onlySources: onlySources?.length ? onlySources : undefined,
    keepPerDiscipline: Number.isFinite(max) ? max : undefined,
    verify: (arg('verify') ?? '').toLowerCase() !== 'off',
  });

  console.log(describeScienceRun(outcome));
  console.log('');
  console.log('Sources');
  for (const report of outcome.reports) {
    const counts = `${report.fetched} fetched, ${report.accepted} accepted, ${report.rejected} rejected`;
    console.log(`  ${report.status.padEnd(8)} ${report.sourceId.padEnd(12)} ${counts}${report.note ? ` — ${report.note}` : ''}`);
  }
  console.log('');
  console.log('Selected');
  for (const entry of outcome.selected) {
    console.log(
      `  ${entry.discipline.padEnd(10)} score ${String(entry.score).padStart(3)} · ${entry.provenance.padEnd(14)} · ${entry.record.title.slice(0, 88)}`,
    );
  }
  if (outcome.rejected.length > 0) {
    console.log('');
    console.log('Rejected by the gates');
    for (const entry of outcome.rejected.slice(0, 15)) {
      console.log(`  - ${entry.reason}: ${entry.title}`);
    }
  }
  console.log('');
  console.log(`Persisted: ${outcome.persisted ? 'yes' : 'no'}${outcome.unmigrated ? ' (curiosity_candidates is not migrated — apply supabase/migrations/011_curiosity_candidates.sql)' : ''}`);
  console.log(`Written this run: ${outcome.written} row(s)`);
  if (outcome.notes.length > 0) {
    console.log('');
    console.log('Notes');
    for (const note of outcome.notes.slice(0, 20)) console.log(`  - ${note}`);
  }

  const anyWorked = outcome.reports.some((report) => report.status === 'ok' || report.status === 'partial');
  if (!anyWorked) {
    console.error('');
    console.error('Every science source failed or was disabled; nothing was discovered.');
    process.exit(3);
  }
  if (!outcome.persisted) {
    console.error('');
    console.error('Discovery succeeded but the reservoir write failed.');
    process.exit(2);
  }
}

void main();
