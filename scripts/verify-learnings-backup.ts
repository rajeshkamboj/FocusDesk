/**
 * Check a real FocusDesk JSON export against the Phase 3 Learnings migration
 * path — locally and read-only. The file is never modified and nothing is
 * sent anywhere: the export is run through the exact code the app uses
 * (normalizeAppData + LocalRepository import/export over in-memory storage).
 *
 * Usage:
 *   npx tsx scripts/verify-learnings-backup.ts <pace-export.json> [expected-count] [expected-ids-md5]
 *
 * Defaults: expected-count 56, expected-ids-md5 3722577b5cbaf446809164a602d2b81c
 * (the Phase 3 rollback point). Because the exact recipe behind that MD5 is
 * not recorded, several common ones are printed; a mismatch there is only a
 * warning. The hard checks are that every record comes out byte-identical.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LocalRepository } from '../lib/store/local-repository';
import { normalizeAppData } from '../lib/store/normalize';
import { precisionOf } from '../lib/learnings';
import type { Learning } from '../lib/types';

const [file, expectedCountArg, expectedMd5Arg] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npx tsx scripts/verify-learnings-backup.ts <pace-export.json> [expected-count] [expected-ids-md5]');
  process.exit(2);
}
const expectedCount = Number(expectedCountArg ?? 56);
const expectedMd5 = expectedMd5Arg ?? '3722577b5cbaf446809164a602d2b81c';
const md5 = (s: string) => createHash('md5').update(s).digest('hex');

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log('✓', msg);
  else {
    failures += 1;
    console.error('FAIL:', msg);
  }
};

async function main() {
  const raw = readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const key = Array.isArray(parsed.milestones) ? 'milestones' : Array.isArray(parsed.learnings) ? 'learnings' : null;
  if (!key) {
    console.error('The file has neither `milestones` nor `learnings` — is it a FocusDesk export?');
    process.exit(1);
  }
  const source = parsed[key] as Learning[];
  console.log(`File: ${file}\nLearning records found under \`${key}\`${key === 'milestones' ? ' (pre-Phase-3 export)' : ''}: ${source.length}\n`);

  const ids = source.map((l) => String(l.id));
  const sorted = [...ids].sort();
  ok(source.length === expectedCount, `Record count is ${expectedCount}`);
  ok(new Set(ids).size === ids.length, 'Every id is unique');
  ok(source.every((l) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(l.date))), 'Every date is YYYY, YYYY-MM or YYYY-MM-DD');

  const recipes: Record<string, string> = {
    'sorted ids, newline-joined + trailing newline (e.g. `jq -r … | sort | md5sum`)': md5(sorted.join('\n') + '\n'),
    'sorted ids, newline-joined': md5(sorted.join('\n')),
    'sorted ids, comma-joined (e.g. md5(string_agg(id, \',\' order by id)))': md5(sorted.join(',')),
    'sorted ids, concatenated (string_agg(id, \'\' order by id))': md5(sorted.join('')),
  };
  console.log('\nIds MD5 by recipe:');
  for (const [name, value] of Object.entries(recipes)) console.log(`  ${value}  ${name}${value === expectedMd5 ? '   ← matches the rollback point' : ''}`);
  if (!Object.values(recipes).includes(expectedMd5)) {
    console.warn(`  (none equals ${expectedMd5} — compare with the recipe you used; the byte-identity checks below are what matter)`);
  }

  const byPrecision = { year: 0, month: 0, day: 0 };
  for (const l of source) byPrecision[precisionOf(String(l.date))] += 1;
  console.log(`\nDates: ${byPrecision.year} year-only · ${byPrecision.month} month · ${byPrecision.day} exact day\n`);

  // 1. The load/import normalization.
  const normalized = normalizeAppData(JSON.parse(raw));
  ok(JSON.stringify(normalized.learnings) === JSON.stringify(source), 'normalizeAppData: learnings are byte-identical to the file\u2019s records (same order, fields, dates, ids)');
  ok(normalized.projectMilestones.length === (Array.isArray(parsed.projectMilestones) ? parsed.projectMilestones.length : 0),
     'normalizeAppData: no learning record became a Project Milestone');

  // 2. A full local import → export round trip, in memory.
  const map = new Map<string, string>();
  const repo = new LocalRepository({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) });
  await repo.importData(JSON.parse(raw));
  const exported = await repo.exportData();
  ok(JSON.stringify(exported.learnings) === JSON.stringify(source), 'Import → export round trip: learnings byte-identical');
  ok(!('milestones' in exported), 'The re-export uses `learnings` only (no duplicate `milestones` copy)');
  ok(md5([...exported.learnings.map((l) => l.id)].sort().join(',')) === recipes['sorted ids, comma-joined (e.g. md5(string_agg(id, \',\' order by id)))'],
     'Ids MD5 unchanged after the round trip');

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nThe export passes through the Phase 3 code unchanged. (Read-only: the file was not modified.)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
