/**
 * Throwaway, local PostgreSQL check of supabase/migrations/008_project_milestones.sql.
 *
 * Runs the repository's real SQL files against PGlite — PostgreSQL compiled to
 * WebAssembly, in memory, gone when the script exits. Nothing here can reach
 * Supabase: there is no URL, key or network involved.
 *
 * To make RLS meaningful it recreates the two Supabase pieces the migrations
 * rely on: an `auth.users` table and `auth.uid()` reading the JWT `sub` claim
 * (what Supabase's own function does), plus a non-owner `authenticated` role.
 * The live database's user-ownership columns on the ten original tables come
 * from a migration that is not in this repository, so `liveOwnershipStandIn`
 * below reproduces that documented state (user_id NOT NULL DEFAULT auth.uid(),
 * RLS, four own-row policies) before 008 is applied.
 *
 * Run: npm i --no-save @electric-sql/pglite tsx && npx tsx scripts/verify-project-milestones-sql.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const sqlFile = (...parts: string[]) => readFileSync(join(process.cwd(), 'supabase', ...parts), 'utf8');

let failures = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log('✓', msg);
  else {
    failures += 1;
    console.error('FAIL:', msg);
  }
}

const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';
const ORIGINAL_TABLES = [
  'goals', 'projects', 'tasks', 'inbox_items', 'ideas', 'daily_priorities',
  'weekly_priorities', 'monthly_priorities', 'task_history', 'app_settings',
];

const liveOwnershipStandIn = ORIGINAL_TABLES.map((t) => `
  alter table ${t} add column if not exists user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;
  alter table ${t} enable row level security;
  create policy "${t}_select_own" on ${t} for select using (auth.uid() = user_id);
  create policy "${t}_insert_own" on ${t} for insert with check (auth.uid() = user_id);
  create policy "${t}_update_own" on ${t} for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "${t}_delete_own" on ${t} for delete using (auth.uid() = user_id);
`).join('\n');

async function main() {
  const db = new PGlite();
  const version = (await db.query<{ v: string }>('select version() as v')).rows[0].v;
  console.log(`PostgreSQL under test: ${version.split(',')[0]} (in-memory PGlite — not Supabase)\n`);

  const claim = (user: string) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
  /** Run as the RLS-bound `authenticated` role, signed in as `user`. */
  const as = async <T>(user: string, run: () => Promise<T>): Promise<T> => {
    await claim(user);
    await db.exec('set role authenticated');
    try {
      return await run();
    } finally {
      await db.exec('reset role');
    }
  };
  const rejects = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return false;
    } catch {
      return true;
    }
  };
  const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

  /* -------------------------------------------------------------- */
  /* The database as it exists today (before 008)                    */
  /* -------------------------------------------------------------- */
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role authenticated nologin;
  `);
  await db.query('insert into auth.users (id) values ($1), ($2)', [USER_A, USER_B]);
  await claim(USER_A);
  await db.exec(sqlFile('schema.sql'));
  for (const m of ['002_completed_at.sql', '003_task_timer.sql', '004_daily_wellbeing.sql', '005_task_subtasks.sql', '006_timer_sessions.sql', '007_milestones.sql']) {
    await db.exec(sqlFile('migrations', m));
  }
  await db.exec(liveOwnershipStandIn);
  const grants = `
    grant usage on schema public to authenticated;
    grant usage on schema auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `;
  await db.exec(grants);

  // 56 learning rows in the `milestones` table, with every date precision.
  const dates = ['2015', '2024', '2025-02-28', '2025-08', '2026-09', '2026-10', '2026-10-01'];
  for (let i = 0; i < 56; i += 1) {
    await db.query(
      `insert into milestones (id, user_id, title, category, description, date, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [`learning-${String(i).padStart(2, '0')}`, USER_A, `Learning ${i}`, ['ai-tool', 'framework', 'platform', 'extension', 'language', 'concept', 'habit', 'other'][i % 8],
        i % 3 ? `note ${i}` : null, dates[i % dates.length], `2026-10-0${(i % 7) + 1}T10:00:00Z`],
    );
  }
  // Pre-existing project/task data for user A.
  await db.query(`insert into projects (id, user_id, name) values ('p-old', $1, 'Existing project')`, [USER_A]);
  await db.query(`insert into tasks (id, user_id, title, project_id) values ('t-old-1', $1, 'Existing task', 'p-old'), ('t-old-2', $1, 'Loose task', null)`, [USER_A]);

  const learningsFingerprint = () => one<{ n: number; ids: string; full: string }>(`
    select count(*)::int as n,
           md5(string_agg(id, ',' order by id)) as ids,
           md5(string_agg(concat_ws('|', id, user_id, title, category, description, date, created_at), E'\\n' order by id)) as full
    from milestones`);
  const tasksFingerprint = () => one<{ full: string }>(`
    select md5(string_agg(concat_ws('|', id, user_id, title, project_id, status, created_at), E'\\n' order by id)) as full from tasks`);
  const learningsBefore = await learningsFingerprint();
  const tasksBefore = await tasksFingerprint();
  const milestonesPoliciesBefore = (await db.query(`select policyname, qual, with_check from pg_policies where tablename = 'milestones' order by policyname`)).rows;

  /* -------------------------------------------------------------- */
  /* Apply 008 — twice                                              */
  /* -------------------------------------------------------------- */
  const migration = sqlFile('migrations', '008_project_milestones.sql');
  ok(/NOT APPLIED TO PRODUCTION/.test(migration), 'The migration is labelled as prepared, not applied to production');
  ok(!/\b(drop|truncate|rename)\b[^;]*\bmilestones\b/i.test(migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')),
     'The executable SQL never drops, truncates or renames the milestones (Learnings) table');
  await db.exec(migration);
  ok(!(await rejects(() => db.exec(migration))), 'Applying 008 a second time succeeds (idempotent)');
  await db.exec(grants); // what Supabase's default privileges give a new table

  /* -------------------------------------------------------------- */
  /* Structure                                                       */
  /* -------------------------------------------------------------- */
  const columns = (await db.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
    `select column_name, data_type, is_nullable, column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'project_milestones' order by ordinal_position`)).rows;
  const col = (name: string) => columns.find((c) => c.column_name === name);
  ok(columns.map((c) => c.column_name).join(',') === 'id,user_id,project_id,name,description,target_date,position,created_at',
     `project_milestones has exactly the planned columns (${columns.map((c) => c.column_name).join(', ')})`);
  ok(col('id')?.data_type === 'text' && col('project_id')?.data_type === 'text' && col('project_id')?.is_nullable === 'NO',
     'id and project_id are text (like every other id); project_id is NOT NULL');
  ok(col('user_id')?.data_type === 'uuid' && col('user_id')?.is_nullable === 'NO' && /auth\.uid\(\)/.test(col('user_id')?.column_default ?? ''),
     'user_id uuid NOT NULL DEFAULT auth.uid()');
  ok(col('target_date')?.data_type === 'date' && col('position')?.data_type === 'integer' && col('position')?.column_default === '0',
     'target_date is a real date; position integer default 0');
  const taskCol = await one<{ data_type: string; is_nullable: string }>(
    `select data_type, is_nullable from information_schema.columns where table_name = 'tasks' and column_name = 'project_milestone_id'`);
  ok(taskCol?.data_type === 'text' && taskCol?.is_nullable === 'YES', 'tasks.project_milestone_id is TEXT NULL');

  const fks = (await db.query<{ conname: string; src: string; target: string; confdeltype: string }>(`
    select conname, conrelid::regclass::text as src, confrelid::regclass::text as target, confdeltype
    from pg_constraint where contype = 'f' and (conrelid = 'project_milestones'::regclass
      or (conrelid = 'tasks'::regclass and confrelid = 'project_milestones'::regclass))`)).rows;
  ok(fks.some((f) => f.src === 'project_milestones' && f.target === 'projects' && f.confdeltype === 'c'),
     'project_milestones.project_id → projects(id) ON DELETE CASCADE');
  ok(fks.some((f) => f.src === 'tasks' && f.target === 'project_milestones' && f.confdeltype === 'n'),
     'tasks.project_milestone_id → project_milestones(id) ON DELETE SET NULL');
  ok(fks.filter((f) => f.src === 'tasks').length === 1, 'Re-running did not add a duplicate foreign key');

  const rls = await one<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where relname = 'project_milestones'`);
  const policies = (await db.query<{ policyname: string; cmd: string; qual: string | null; with_check: string | null }>(
    `select policyname, cmd, qual, with_check from pg_policies where tablename = 'project_milestones' order by policyname`)).rows;
  ok(rls?.relrowsecurity === true, 'RLS is enabled on project_milestones');
  ok(policies.map((p) => p.policyname).join(',') ===
     'project_milestones_delete_own,project_milestones_insert_own,project_milestones_select_own,project_milestones_update_own',
     'Exactly the four own-row policies exist (no duplicates after the second run)');
  ok(policies.every((p) => [p.qual, p.with_check].filter(Boolean).every((expr) => /auth\.uid\(\) = user_id/.test(String(expr)))),
     'Every policy expression is auth.uid() = user_id');
  ok(policies.find((p) => p.cmd === 'UPDATE')?.with_check !== null, 'The update policy has both USING and WITH CHECK');
  const indexes = (await db.query<{ indexname: string }>(`select indexname from pg_indexes where tablename in ('project_milestones', 'tasks') and indexname like '%milestone%' and indexname not like '%_pkey' order by 1`)).rows;
  ok(indexes.map((i) => i.indexname).join(',') === 'project_milestones_user_project_position_idx,tasks_project_milestone_idx',
     `Indexes created once each (${indexes.map((i) => i.indexname).join(', ')})`);

  /* -------------------------------------------------------------- */
  /* Nothing that existed was changed                                */
  /* -------------------------------------------------------------- */
  const learningsAfter = await learningsFingerprint();
  ok(learningsAfter.n === 56 && learningsAfter.ids === learningsBefore.ids && learningsAfter.full === learningsBefore.full,
     `The 56 learning rows (milestones table) are byte-identical after 008 — ids md5 ${learningsAfter.ids}`);
  ok(JSON.stringify((await db.query(`select policyname, qual, with_check from pg_policies where tablename = 'milestones' order by policyname`)).rows) === JSON.stringify(milestonesPoliciesBefore),
     'The milestones (Learnings) table keeps its four policies unchanged');
  ok((await tasksFingerprint()).full === tasksBefore.full, 'Existing task rows are unchanged');
  ok((await one<{ n: number }>(`select count(*)::int as n from tasks where project_milestone_id is not null`)).n === 0,
     'Every existing task has project_milestone_id = NULL ("no milestone")');
  ok((await one<{ n: number }>(`select count(*)::int as n from project_milestones`)).n === 0,
     'project_milestones starts empty — no learning row was copied into it');

  /* -------------------------------------------------------------- */
  /* Behaviour under RLS, as real users                              */
  /* -------------------------------------------------------------- */
  await as(USER_A, async () => {
    await db.exec(`insert into projects (id, name) values ('p1', 'Website'), ('p2', 'Book')`);
    await db.exec(`insert into project_milestones (id, project_id, name, position) values ('m1', 'p1', 'Design', 0), ('m2', 'p1', 'Launch', 1)`);
    await db.exec(`insert into tasks (id, title, project_id, project_milestone_id) values
      ('t1', 'Wireframes', 'p1', 'm1'), ('t2', 'Pick fonts', 'p1', null)`);
  });
  ok((await one<{ user_id: string }>(`select user_id from project_milestones where id = 'm1'`)).user_id === USER_A,
     'A milestone inserted without user_id is owned by auth.uid() (the default)');

  const seenByB = await as(USER_B, () => db.query(`select id from project_milestones`));
  ok(seenByB.rows.length === 0, 'User B cannot see user A\u2019s milestones');
  const updByB = await as(USER_B, () => db.query(`update project_milestones set name = 'hijacked' where id = 'm1'`));
  const delByB = await as(USER_B, () => db.query(`delete from project_milestones where id = 'm1'`));
  ok((updByB.affectedRows ?? 0) === 0 && (delByB.affectedRows ?? 0) === 0
     && (await one<{ name: string }>(`select name from project_milestones where id = 'm1'`)).name === 'Design',
     'User B can neither update nor delete user A\u2019s milestone');
  ok(await as(USER_B, () => rejects(() => db.exec(`insert into project_milestones (id, user_id, project_id, name) values ('mx', '${USER_A}', 'p1', 'Spoof')`))),
     'User B cannot insert a milestone owned by user A (WITH CHECK)');
  ok(await as(USER_A, () => rejects(() => db.exec(`update project_milestones set user_id = '${USER_B}' where id = 'm1'`)))
     && (await one<{ user_id: string }>(`select user_id from project_milestones where id = 'm1'`)).user_id === USER_A,
     'A milestone cannot be handed to another user, even by its owner (UPDATE … WITH CHECK)');

  await as(USER_A, async () => {
    ok(await rejects(() => db.exec(`insert into project_milestones (id, project_id, name) values ('bad1', 'p1', '   ')`)), 'A blank milestone name is rejected');
    ok(await rejects(() => db.exec(`insert into project_milestones (id, project_id, name, position) values ('bad2', 'p1', 'X', -1)`)), 'A negative position is rejected');
    ok(await rejects(() => db.exec(`insert into project_milestones (id, project_id, name) values ('bad3', 'no-such-project', 'X')`)), 'A milestone needs an existing project');
    ok(await rejects(() => db.exec(`insert into tasks (id, title, project_id, project_milestone_id) values ('bad4', 'X', 'p1', 'no-such-milestone')`)), 'A task cannot reference a missing milestone');
  });

  // Deleting a milestone keeps its tasks and clears their link.
  await as(USER_A, () => db.exec(`delete from project_milestones where id = 'm1'`));
  const t1 = await one<{ project_id: string | null; project_milestone_id: string | null }>(`select project_id, project_milestone_id from tasks where id = 't1'`);
  ok(t1 !== undefined && t1.project_id === 'p1' && t1.project_milestone_id === null,
     'Deleting a milestone keeps its task (still in the project) with project_milestone_id = NULL');

  // Deleting a project: its milestones go, its tasks stay (existing behaviour: project_id → NULL).
  await as(USER_A, async () => {
    await db.exec(`insert into project_milestones (id, project_id, name) values ('m3', 'p2', 'Draft')`);
    await db.exec(`insert into tasks (id, title, project_id, project_milestone_id) values ('t3', 'Outline', 'p2', 'm3')`);
    await db.exec(`delete from projects where id = 'p2'`);
  });
  const t3 = await one<{ project_id: string | null; project_milestone_id: string | null }>(`select project_id, project_milestone_id from tasks where id = 't3'`);
  ok((await one<{ n: number }>(`select count(*)::int as n from project_milestones where id = 'm3'`)).n === 0
     && t3 !== undefined && t3.project_id === null && t3.project_milestone_id === null,
     'Deleting a project removes its milestones; its tasks are kept with project and milestone cleared');

  // Documented limitation: the same-project rule is app-enforced, not DB-enforced.
  const crossProjectAccepted = !(await as(USER_A, () => rejects(() => db.exec(
    `insert into tasks (id, title, project_id, project_milestone_id) values ('t4', 'Mismatch', 'p-old', 'm2')`))));
  ok(crossProjectAccepted, 'As documented, the database alone does not enforce "milestone belongs to the task\u2019s project" (the app does)');

  /* -------------------------------------------------------------- */
  /* The optional / rollback snippets in the file are valid SQL      */
  /* -------------------------------------------------------------- */
  const commented = (marker: RegExp, until: RegExp) => {
    const lines = migration.split('\n');
    const start = lines.findIndex((l) => marker.test(l));
    const out: string[] = [];
    for (let i = start + 1; i < lines.length && !until.test(lines[i]); i += 1) {
      const m = /^--   (.*)$/.exec(lines[i]);
      if (m && !m[1].startsWith('--')) out.push(m[1]);
    }
    return out.join('\n');
  };
  const optional = commented(/OPTIONAL, NOT ENABLED/, /^-- With MATCH SIMPLE/);
  await db.exec('begin');
  try {
    await db.exec(`delete from tasks where id = 't4'`);
    await db.exec(optional);
    ok(await rejects(() => db.exec(`savepoint s; insert into tasks (id, user_id, title, project_id, project_milestone_id) values ('t5', '${USER_A}', 'Mismatch', 'p-old', 'm2')`)),
       'The documented optional composite FK (not enabled) is valid and would reject a cross-project milestone');
    await db.exec('rollback to savepoint s');
  } finally {
    await db.exec('rollback');
  }
  const rollback = commented(/^-- ROLLBACK/, /^-- The app falls back/);
  await db.exec('begin');
  try {
    await db.exec(rollback);
    ok((await one<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_name = 'project_milestones'`)).n === 0
       && (await learningsFingerprint()).full === learningsBefore.full,
       'The documented rollback is valid, removes only 008\u2019s objects and leaves the learnings untouched');
  } finally {
    await db.exec('rollback');
  }

  await db.close();
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nMigration 008 verified locally (PGlite). Nothing was executed against Supabase.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
