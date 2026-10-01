/**
 * Headless check of degraded-load resilience.
 *
 * A database that is missing one table (a migration that was never run) used
 * to reject the whole load and leave the app looking empty. This exercises the
 * opposite guarantee: the collections the backend can serve still arrive, and
 * the failure is reported as a single issue.
 *
 * Run: npx tsx scripts/verify-resilience.ts
 * (tsx is fetched on demand, like the other scripts here.)
 */

import { loadDataLenient, mergeLoaded } from '../lib/store/load';
import { emptyData } from '../lib/store/defaults';
import type { AppRepository } from '../lib/store/repository';
import type { Task } from '../lib/types';

const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('✓', msg);
};

const task: Task = {
  id: 't1',
  title: 'Ship the resilience fix',
  status: 'today',
  priority: 'high',
  tags: [],
  postponementCount: 0,
  archived: false,
  createdAt: new Date().toISOString(),
};

const missing = (what: string) => async (): Promise<never> => {
  throw new Error(`Supabase read from ${what} failed: relation "public.${what}" does not exist`);
};

/** A backend where `wellbeing_days` was never created. */
const partiallyMigrated = {
  kind: 'supabase',
  tasks: { list: async () => [task] },
  projects: { list: async () => [] },
  goals: { list: async () => [] },
  inbox: { list: async () => [] },
  ideas: { list: async () => [] },
  dailyPriorities: { list: async () => [] },
  weeklyPriorities: { list: async () => [] },
  monthlyPriorities: { list: async () => [] },
  taskHistory: { list: async () => [] },
  wellbeingDays: { list: missing('wellbeing_days') },
  settings: { get: async () => emptyData().settings },
} as unknown as AppRepository;

async function main() {
  const { loaded, issues } = await loadDataLenient(partiallyMigrated);

  ok(loaded.tasks?.length === 1, 'The collection that exists still loads');
  ok(loaded.wellbeingDays === undefined, 'The missing collection is not invented');
  ok(issues.length === 1 && issues[0].key === 'wellbeingDays', 'The failure is reported as one issue');
  ok(issues[0].fix.includes('004_daily_wellbeing.sql'), 'The issue names the migration that fixes it');

  const merged = mergeLoaded(emptyData(), loaded);
  ok(merged.tasks.length === 1, 'A partial load still shows the data the user has');
  ok(merged.wellbeingDays.length === 0, 'The failed collection contributes no phantom records');

  // Re-loading after the migration is applied: everything arrives, no issues.
  const migrated = {
    ...partiallyMigrated,
    wellbeingDays: { list: async () => [] },
  } as unknown as AppRepository;
  const second = await loadDataLenient(migrated);
  ok(second.issues.length === 0, 'Once the schema is complete, the load is clean');
  ok(second.loaded.wellbeingDays !== undefined, 'The repaired collection loads');

  // A collection that fails on a reload must not wipe what is already on screen.
  const previous = mergeLoaded(emptyData(), { tasks: [task], wellbeingDays: [] });
  const failedReload = await loadDataLenient(partiallyMigrated);
  const afterReload = mergeLoaded(previous, failedReload.loaded);
  ok(
    afterReload.wellbeingDays.length === 0 && afterReload.tasks.length === 1,
    'A failed collection on reload keeps the data already in memory',
  );

  console.log('\nAll resilience checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
