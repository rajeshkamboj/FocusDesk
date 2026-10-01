/**
 * Lenient data loading.
 *
 * The database can drift behind the code: a migration that was never run, a
 * table or column added after the tables were first created. Loading all
 * collections through a single `Promise.all` meant that one missing piece —
 * say the `wellbeing_days` table — rejected the whole batch, and the app came
 * up completely empty, as though every task and project had disappeared.
 * (The data was never gone; only the load was.)
 *
 * `loadDataLenient` asks for each collection on its own. Whatever the backend
 * can serve is returned; whatever it cannot is reported as a `LoadIssue`, so
 * the app keeps working and can tell the user which migration makes the
 * missing section whole again.
 */

import type { AppData } from '../types';
import type { AppRepository } from './repository';

export interface LoadIssue {
  /** The `AppData` collection that could not be loaded. */
  key: keyof AppData;
  /** Human-readable name of the affected feature. */
  label: string;
  /** The SQL file that creates the missing table/column (Supabase only). */
  fix: string;
  /** The backend's own error message, shown for troubleshooting. */
  message: string;
}

interface LoadSpec {
  key: keyof AppData;
  label: string;
  fix: string;
  load: (repo: AppRepository) => Promise<AppData[keyof AppData]>;
}

const SCHEMA = 'supabase/schema.sql';

const LOAD_SPECS: LoadSpec[] = [
  {
    key: 'tasks',
    label: 'Tasks',
    fix: 'supabase/schema.sql (for an existing database: supabase/migrations/002_completed_at.sql and 003_task_timer.sql)',
    load: (repo) => repo.tasks.list(),
  },
  { key: 'projects', label: 'Projects', fix: SCHEMA, load: (repo) => repo.projects.list() },
  { key: 'goals', label: 'Goals', fix: SCHEMA, load: (repo) => repo.goals.list() },
  { key: 'inbox', label: 'Inbox', fix: SCHEMA, load: (repo) => repo.inbox.list() },
  { key: 'ideas', label: 'Ideas', fix: SCHEMA, load: (repo) => repo.ideas.list() },
  { key: 'dailyPriorities', label: 'Daily priorities', fix: SCHEMA, load: (repo) => repo.dailyPriorities.list() },
  { key: 'weeklyPriorities', label: 'Weekly priorities', fix: SCHEMA, load: (repo) => repo.weeklyPriorities.list() },
  { key: 'monthlyPriorities', label: 'Monthly priorities', fix: SCHEMA, load: (repo) => repo.monthlyPriorities.list() },
  { key: 'taskHistory', label: 'Task history', fix: SCHEMA, load: (repo) => repo.taskHistory.list() },
  {
    key: 'wellbeingDays',
    label: 'Daily well-being',
    fix: 'supabase/migrations/004_daily_wellbeing.sql',
    load: (repo) => repo.wellbeingDays.list(),
  },
  { key: 'settings', label: 'Settings', fix: SCHEMA, load: (repo) => repo.settings.get() },
];

export interface LenientLoad {
  /** The collections the backend answered for, keyed by `AppData` field. */
  loaded: Partial<AppData>;
  /** The collections it could not answer for. */
  issues: LoadIssue[];
}

/**
 * Load every collection independently. Never rejects: a failure becomes a
 * `LoadIssue` instead of taking the rest of the data down with it.
 */
export async function loadDataLenient(repo: AppRepository): Promise<LenientLoad> {
  const results = await Promise.all(
    LOAD_SPECS.map(async (spec) => {
      try {
        return { spec, value: await spec.load(repo) };
      } catch (error) {
        return { spec, error };
      }
    }),
  );

  const loaded: Partial<AppData> = {};
  const issues: LoadIssue[] = [];

  for (const result of results) {
    if ('error' in result) {
      issues.push({
        key: result.spec.key,
        label: result.spec.label,
        fix: result.spec.fix,
        message: result.error instanceof Error ? result.error.message : String(result.error),
      });
      continue;
    }
    // One narrow cast: each spec knows which collection it loads, but the
    // list is typed uniformly, so TypeScript cannot correlate the two.
    (loaded as Record<string, unknown>)[result.spec.key] = result.value;
  }

  return { loaded, issues };
}

/**
 * Merge a lenient load into the data already in memory.
 *
 * A collection the backend answered for replaces the previous value (even if
 * it is now empty); a collection that failed keeps whatever the app had, so a
 * missing table can never blank the screen.
 */
export function mergeLoaded(previous: AppData, loaded: Partial<AppData>): AppData {
  const next = { ...previous } as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(loaded)) next[key] = value;
  return next as unknown as AppData;
}
