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
 * The integrity rules are deliberately probed as the table OWNER as well as
 * under RLS. Foreign key checks run with the owner's rights and bypass RLS,
 * so a cross-user write that RLS would hide is the only way to prove the
 * constraint — and not the policy — is what refuses it.
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
  /** Rejected by what? A refusal is only proof if the message names the expected constraint. */
  const refusedBy = async (run: () => Promise<unknown>, constraintName: string) => {
    try {
      await run();
      return 'not rejected';
    } catch (error) {
      const message = String((error as Error).message);
      return message.includes(`"${constraintName}"`) ? constraintName : `unexpected: ${message.split('\n')[0]}`;
    }
  };
  const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

  /** Constraint metadata with the column names resolved, both sides of a foreign key. */
  const constraint = async (table: string, name: string) => {
    const result = await db.query<{
      conname: string; contype: string; confdeltype: string | null; confmatchtype: string | null;
      convalidated: boolean; columns: string; refcolumns: string | null; reftable: string | null;
    }>(`
      select c.conname, c.contype, c.confdeltype, c.confmatchtype, c.convalidated,
             (select string_agg(a.attname, ',' order by k.ord)
                from unnest(c.conkey) with ordinality as k(attnum, ord)
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as columns,
             (select string_agg(a.attname, ',' order by k.ord)
                from unnest(c.confkey) with ordinality as k(attnum, ord)
                join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as refcolumns,
             (select rel.relname::text from pg_class rel where rel.oid = c.confrelid) as reftable
      from pg_constraint c
      where c.conrelid = $1::regclass and c.conname = $2`, [table, name]);
    return result.rows[0];
  };
  const constraintCount = async (table: string, filter: string) =>
    (await db.query<{ n: number }>(
      `select count(*)::int as n from pg_constraint where conrelid = $1::regclass and ${filter}`, [table])).rows[0].n;

  /* -------------------------------------------------------------- */
  /* Preconditions: the migration must refuse an unready database    */
  /* -------------------------------------------------------------- */
  const migrationSql = sqlFile('migrations', '008_project_milestones.sql');
  {
    const scratch = new PGlite();
    await scratch.exec(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table projects (id text primary key, name text not null);
      create table tasks (id text primary key, project_id text references projects (id) on delete set null);
    `);
    const refused = await (async () => {
      try { await scratch.exec(migrationSql); return null; } catch (error) { return String((error as Error).message); }
    })();
    ok(refused !== null && /projects\.user_id is missing/.test(refused),
       'Without projects.user_id the migration stops with a clear message instead of half-applying');
    ok((await scratch.query(`select count(*)::int as n from pg_constraint where conname = 'projects_id_user_id_key'`)).rows[0].n === 0
       && (await scratch.query(`select count(*)::int as n from information_schema.tables where table_name = 'project_milestones'`)).rows[0].n === 0
       && (await scratch.query(`select count(*)::int as n from information_schema.columns where table_name = 'tasks' and column_name = 'project_milestone_id'`)).rows[0].n === 0,
       'A refused run creates nothing: no constraint, no table, no column');
    ok(/current_setting\('server_version_num'\)::integer/.test(migrationSql) && /<\s*150000/.test(migrationSql)
       && /PostgreSQL 15 or newer/.test(migrationSql),
       'The migration guards the PostgreSQL 15 minimum that ON DELETE SET NULL (column list) needs (the branch itself cannot be exercised on this server)');
    await scratch.close();
  }

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
  const migration = migrationSql;
  ok(/NOT APPLIED TO PRODUCTION/.test(migration), 'The migration is labelled as prepared, not applied to production');
  // Executable statements only — the commented rollback/optional blocks are checked separately below.
  const executable = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  ok(!/\b(drop|truncate)\s+table\s+(if\s+exists\s+)?(public\.)?milestones\b/i.test(executable)
     && !/\balter\s+table\s+(if\s+exists\s+)?(public\.)?milestones\b/i.test(executable)
     && !/\brename\s+to\b/i.test(executable),
     'The executable SQL never drops, alters, truncates or renames the milestones (Learnings) table — or anything else');
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

  // The five constraints that make the invariants the database's job, not the app's.
  const ownerUnique = await constraint('projects', 'projects_id_user_id_key');
  ok(ownerUnique?.contype === 'u' && ownerUnique.columns === 'id,user_id' && ownerUnique.convalidated,
     'projects (id, user_id) UNIQUE exists and is validated — the target of the ownership foreign key');
  ok(await constraintCount('projects', `contype = 'u'`) === 1,
     'It is the only extra unique constraint on projects (the primary key is untouched)');

  const ownershipFk = await constraint('project_milestones', 'project_milestones_project_user_fkey');
  ok(ownershipFk?.contype === 'f' && ownershipFk.reftable === 'projects'
     && ownershipFk.columns === 'project_id,user_id' && ownershipFk.refcolumns === 'id,user_id'
     && ownershipFk.confdeltype === 'c' && ownershipFk.convalidated,
     'project_milestones (project_id, user_id) → projects (id, user_id) ON DELETE CASCADE — the project must exist AND belong to the same user');
  ok(await constraintCount('project_milestones', `contype = 'f' and confrelid = 'projects'::regclass`) === 1,
     'It replaced the single-column project_id foreign key rather than sitting next to it');

  const milestoneKey = await constraint('project_milestones', 'project_milestones_id_project_key');
  ok(milestoneKey?.contype === 'u' && milestoneKey.columns === 'id,project_id',
     'project_milestones (id, project_id) UNIQUE exists — the target of the task foreign key');

  const linkFk = await constraint('tasks', 'tasks_project_milestone_fkey');
  ok(linkFk?.contype === 'f' && linkFk.reftable === 'project_milestones'
     && linkFk.columns === 'project_milestone_id' && linkFk.refcolumns === 'id'
     && linkFk.confdeltype === 'n' && linkFk.convalidated,
     'tasks (project_milestone_id) → project_milestones (id) ON DELETE SET NULL — clears the link whatever project_id says');

  const sameProjectFk = await constraint('tasks', 'tasks_project_milestone_same_project_fkey');
  ok(sameProjectFk?.contype === 'f' && sameProjectFk.reftable === 'project_milestones'
     && sameProjectFk.columns === 'project_milestone_id,project_id' && sameProjectFk.refcolumns === 'id,project_id'
     && sameProjectFk.confdeltype === 'n' && sameProjectFk.confmatchtype === 's' && sameProjectFk.convalidated,
     'tasks (project_milestone_id, project_id) → project_milestones (id, project_id) ON DELETE SET NULL, MATCH SIMPLE');
  ok(await constraintCount('tasks', `contype = 'f' and confrelid = 'project_milestones'::regclass`) === 2,
     'Those are the only two keys from tasks to project_milestones, and re-running added no duplicates');
  ok(await constraintCount('tasks', `contype = 'f' and confrelid = 'projects'::regclass and conname = 'tasks_project_id_fkey'`) === 1,
     'The pre-existing tasks.project_id → projects(id) ON DELETE SET NULL is untouched');

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
  ok(indexes.map((i) => i.indexname).join(',') ===
     'project_milestones_id_project_key,project_milestones_user_project_position_idx,tasks_project_milestone_idx',
     `Indexes created once each (${indexes.map((i) => i.indexname).join(', ')})`);
  const projectIndexes = (await db.query<{ indexname: string; indexdef: string }>(
    `select indexname, indexdef from pg_indexes where tablename = 'projects' order by 1`)).rows;
  ok(projectIndexes.map((i) => i.indexname).join(',') === 'projects_id_user_id_key,projects_pkey',
     `projects gained exactly one index (${projectIndexes.map((i) => i.indexname).join(', ')})`);
  ok(/create unique index/i.test(projectIndexes.find((i) => i.indexname === 'projects_id_user_id_key')?.indexdef ?? '')
     && /\(id, user_id\)/.test(projectIndexes.find((i) => i.indexname === 'projects_id_user_id_key')?.indexdef ?? ''),
     'That index is UNIQUE on (id, user_id) and nothing else changed on projects');

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

  // A project owned by the other user, created as the owner so RLS is out of
  // the way: only the foreign key can stop these writes.
  await db.exec(`insert into projects (id, user_id, name) values ('pb1', '${USER_B}', 'B’s project')`);
  await db.exec(`insert into project_milestones (id, user_id, project_id, name) values ('mb1', '${USER_B}', 'pb1', 'B milestone')`);

  await as(USER_A, async () => {
    ok(await rejects(() => db.exec(`insert into project_milestones (id, project_id, name) values ('bad1', 'p1', '   ')`)), 'A blank milestone name is rejected');
    ok(await rejects(() => db.exec(`insert into project_milestones (id, project_id, name, position) values ('bad2', 'p1', 'X', -1)`)), 'A negative position is rejected');
    ok(await rejects(() => db.exec(`insert into project_milestones (id, project_id, name) values ('bad3', 'no-such-project', 'X')`)), 'A milestone needs an existing project');
    ok(await rejects(() => db.exec(`insert into tasks (id, title, project_id, project_milestone_id) values ('bad4', 'X', 'p1', 'no-such-milestone')`)), 'A task cannot reference a missing milestone');
    ok(await rejects(() => db.exec(`insert into tasks (id, title, project_id, project_milestone_id) values ('bad5', 'X', 'p1', 'mb1')`)),
       'A task in p1 cannot point at another project’s milestone');
  });

  // Ownership, with RLS bypassed: the foreign key alone has to refuse these.
  ok(await refusedBy(() => db.exec(
       `insert into project_milestones (id, user_id, project_id, name) values ('spoof1', '${USER_B}', 'p1', 'Spoof')`),
       'project_milestones_project_user_fkey') === 'project_milestones_project_user_fkey',
     'Even with RLS bypassed, a milestone cannot claim user A’s project for user B (foreign key, not policy)');
  ok(await refusedBy(() => db.exec(
       `insert into project_milestones (id, user_id, project_id, name) values ('spoof2', '${USER_A}', 'pb1', 'Spoof')`),
       'project_milestones_project_user_fkey') === 'project_milestones_project_user_fkey',
     'Even with RLS bypassed, user A cannot hang a milestone on user B’s project');
  ok(await refusedBy(() => db.exec(
       `update project_milestones set project_id = 'pb1' where id = 'm2'`),
       'project_milestones_project_user_fkey') === 'project_milestones_project_user_fkey',
     'A milestone cannot be moved to another user’s project');
  ok(await refusedBy(() => db.exec(
       `insert into tasks (id, user_id, title, project_id, project_milestone_id) values ('spoof3', '${USER_A}', 'Spoof', 'p1', 'mb1')`),
       'tasks_project_milestone_same_project_fkey') === 'tasks_project_milestone_same_project_fkey',
     'Even with RLS bypassed, a task cannot carry a milestone from a different project');

  // Same-project rule, enforced by the database rather than only by the app.
  ok(await refusedBy(() => db.exec(
       `insert into tasks (id, title, project_id, project_milestone_id) values ('t4', 'Mismatch', 'p-old', 'm2')`),
       'tasks_project_milestone_same_project_fkey') === 'tasks_project_milestone_same_project_fkey',
     'A task in one project cannot reference a milestone of another project');
  // Moving a task between projects must clear its milestone in the same
  // statement — MATCH SIMPLE only checks rows where both columns are set.
  ok(await refusedBy(() => db.exec(`update tasks set project_id = 'p-old' where id = 't1'`),
       'tasks_project_milestone_same_project_fkey') === 'tasks_project_milestone_same_project_fkey',
     'Moving a task to another project while keeping its milestone is refused');
  await db.exec(`update tasks set project_id = 'p-old', project_milestone_id = null where id = 't1'`);
  ok((await one<{ project_id: string | null; project_milestone_id: string | null }>(`select project_id, project_milestone_id from tasks where id = 't1'`)).project_id === 'p-old',
     'Moving the project and clearing the milestone in one statement is accepted');
  await db.exec(`update tasks set project_id = 'p1', project_milestone_id = 'm1' where id = 't1'`);

  // Nullable behaviour is preserved on both sides.
  ok(!(await rejects(() => db.exec(`insert into tasks (id, title, project_id, project_milestone_id) values ('t-plain', 'In a project, no milestone', 'p1', null)`))),
     'A task can be in a project with no milestone');
  ok(!(await rejects(() => db.exec(`insert into tasks (id, title) values ('t-free', 'No project, no milestone')`))),
     'A task can have neither a project nor a milestone');
  ok(!(await rejects(() => db.exec(`update tasks set project_milestone_id = null where id = 't-plain'`))),
     'The link can be cleared on its own');

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

  // Regression: with only the composite key, the cascade nulls tasks.project_id
  // first, MATCH SIMPLE then stops checking that row, and the milestone delete
  // finds nothing to clear — leaving a link to a milestone that no longer
  // exists. The single-column key is what prevents this.
  const dangling = (await db.query<{ id: string }>(`
    select t.id from tasks t
      left join project_milestones m on m.id = t.project_milestone_id
      where t.project_milestone_id is not null and m.id is null order by t.id`)).rows;
  ok(dangling.length === 0,
     `No task is left pointing at a milestone that no longer exists${dangling.length ? ` (found: ${dangling.map((d) => d.id).join(', ')})` : ''}`);
  const orphanedMilestones = (await db.query<{ id: string }>(`
    select m.id from project_milestones m
      left join projects p on p.id = m.project_id
      where p.id is null or p.user_id <> m.user_id`)).rows;
  ok(orphanedMilestones.length === 0,
     'No milestone survives its project, and none belongs to a different user than its project');

  // The one combination MATCH SIMPLE still allows, and which the app refuses
  // ("Choose a project before choosing a milestone"). Pinned here so a future
  // change to either side is a deliberate one.
  const projectLessAccepted = !(await as(USER_A, () => rejects(() => db.exec(
    `insert into tasks (id, title, project_id, project_milestone_id) values ('t4', 'Milestone, no project', null, 'm2')`))));
  ok(projectLessAccepted, 'MATCH SIMPLE still allows a milestone on a project-less task — the app refuses it, and the migration says so');
  // The migration's own prose, unwrapped, so the wording is what is checked
  // and not where a line happens to break.
  const prose = migration.split('\n').map((l) => l.replace(/^\s*--\s?/, '')).join(' ').replace(/\s+/g, ' ');
  ok(/WHAT THE DATABASE STILL ALLOWS/.test(prose)
     && /a task with a milestone \*and no project\*/.test(prose)
     && /MATCH FULL on the tasks foreign key forbids/.test(prose)
     && /CHECK \(project_milestone_id IS NULL OR project_id IS NOT NULL\) breaks project deletion/.test(prose)
     && /deferred CONSTRAINT TRIGGER fails the same way/.test(prose)
     && /Choose a project before choosing a milestone/.test(prose),
     'The migration documents that residual case, the app rule that covers it, and each rejected alternative');

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

  // Re-running converges, even on a table an earlier draft left without them:
  // create table if not exists would skip it, so the DO blocks must add them.
  await db.exec('begin');
  try {
    await db.exec(`
      alter table tasks drop constraint tasks_project_milestone_fkey;
      alter table tasks drop constraint tasks_project_milestone_same_project_fkey;
      alter table project_milestones drop constraint project_milestones_id_project_key;
      alter table project_milestones drop constraint project_milestones_project_user_fkey;
    `);
    await db.exec(migration);
    ok((await constraint('project_milestones', 'project_milestones_project_user_fkey'))?.columns === 'project_id,user_id'
       && (await constraint('project_milestones', 'project_milestones_id_project_key'))?.columns === 'id,project_id'
       && (await constraint('tasks', 'tasks_project_milestone_fkey'))?.columns === 'project_milestone_id'
       && (await constraint('tasks', 'tasks_project_milestone_same_project_fkey'))?.columns === 'project_milestone_id,project_id',
       'Re-running on a table missing the constraints adds them back (self-healing, still idempotent)');
  } finally {
    await db.exec('rollback');
  }

  // The optional generated-column block: valid SQL, closes the last case, and
  // — unlike a CHECK or a deferred trigger — it does not break project deletion.
  const optional = commented(/OPTIONAL, NOT ENABLED/, /^-- Together with foreign key B/);
  ok(optional.includes('generated always as') && optional.includes('tasks_project_milestone_needs_project_fkey'),
     'The optional block was extracted from the migration (not restated in this script)');
  await db.exec('begin');
  try {
    // t4 is exactly the row this constraint exists to forbid, so the ALTER
    // has to refuse to apply until it is gone.
    ok(await refusedBy(() => db.exec(`savepoint sp0; ${optional}`), 'tasks_project_milestone_needs_project_fkey')
         !== 'not rejected',
       'The optional block validates existing rows: it refuses to apply while an offending task exists');
    await db.exec('rollback to savepoint sp0');
    await db.exec(`delete from tasks where id = 't4'`);
    await db.exec(optional);
    ok(await refusedBy(() => db.exec(
         `savepoint s1; insert into tasks (id, user_id, title, project_milestone_id) values ('t5', '${USER_A}', 'Milestone, no project', 'm2')`),
         'tasks_project_milestone_needs_project_fkey') === 'tasks_project_milestone_needs_project_fkey',
       'With it enabled, a milestone on a project-less task is refused too');
    await db.exec('rollback to savepoint s1');
    ok(!(await rejects(() => db.exec(
         `savepoint s2; insert into tasks (id, user_id, title, project_id, project_milestone_id) values ('t6', '${USER_A}', 'Fine', 'p1', 'm2'); rollback to savepoint s2`))),
       'With it enabled, an ordinary task with a matching milestone still inserts');
    ok(!(await rejects(() => db.exec(`savepoint s3; delete from projects where id = 'p1'; rollback to savepoint s3`))),
       'With it enabled, deleting a project still works (a CHECK constraint would abort here)');
  } finally {
    await db.exec('rollback');
  }
  /* -------------------------------------------------------------- */
  /* The alternatives the migration rejects really do fail           */
  /* -------------------------------------------------------------- */
  // The file claims each stronger option breaks something. Those are empirical
  // claims, so they are measured here rather than asserted in prose.
  {
    const alt = new PGlite();
    const altError = async (sql: string) => {
      try { await alt.exec(sql); return null; } catch (error) { return String((error as Error).message); }
    };
    await alt.exec(`
      create table projects (id text primary key, user_id uuid not null);
      create table project_milestones (id text primary key, user_id uuid not null, project_id text not null);
      create table tasks (
        id text primary key,
        project_id text references projects (id) on delete set null,
        project_milestone_id text
      );
      insert into projects values ('p1', '${USER_A}'), ('p2', '${USER_A}');
      insert into project_milestones values ('m1', '${USER_A}', 'p1'), ('m2', '${USER_A}', 'p2');
      alter table projects add constraint projects_id_user_id_key unique (id, user_id);
      alter table project_milestones add constraint project_milestones_id_project_key unique (id, project_id);
      alter table tasks add constraint tasks_project_milestone_fkey
        foreign key (project_milestone_id) references project_milestones (id) on delete set null;
      alter table tasks add constraint tasks_project_milestone_same_project_fkey
        foreign key (project_milestone_id, project_id) references project_milestones (id, project_id)
        on delete set null (project_milestone_id);
      -- the two ordinary shapes the app produces every day:
      insert into tasks (id, project_id) values ('in-a-project-no-milestone', 'p1');
      insert into tasks (id, project_id, project_milestone_id) values ('linked', 'p2', 'm2');
    `);

    const matchFull = await altError(`
      alter table tasks add constraint tasks_match_full
        foreign key (project_milestone_id, project_id) references project_milestones (id, project_id)
        match full on delete set null (project_milestone_id)`);
    ok(matchFull !== null && /violates foreign key constraint "tasks_match_full"/.test(matchFull),
       'MATCH FULL is not an option: it rejects the ordinary "in a project, no milestone" task');

    await alt.exec(`alter table tasks
      add constraint tasks_project_milestone_needs_project
      check (project_milestone_id is null or project_id is not null)`);
    const checkDelete = await altError(`delete from projects where id = 'p2'`);
    ok(checkDelete !== null && /violates check constraint "tasks_project_milestone_needs_project"/.test(checkDelete),
       'A CHECK constraint is not an option: it aborts project deletion on the in-between row');
    await alt.exec(`alter table tasks drop constraint tasks_project_milestone_needs_project`);

    await alt.exec(`
      create function tasks_project_milestone_guard() returns trigger language plpgsql as $$
      begin
        if new.project_milestone_id is not null and new.project_id is null then
          raise exception 'a task milestone needs a project';
        end if;
        return new;
      end $$;
      create constraint trigger tasks_project_milestone_guard
        after insert or update on tasks deferrable initially deferred
        for each row execute function tasks_project_milestone_guard();
    `);
    const guardRejects = await altError(`insert into tasks (id, project_milestone_id) values ('bad', 'm1')`);
    const guardDelete = await altError(`delete from projects where id = 'p2'`);
    ok(guardRejects !== null && /a task milestone needs a project/.test(guardRejects),
       'A deferred constraint trigger would catch the bad row…');
    ok(guardDelete !== null && /a task milestone needs a project/.test(guardDelete),
       '…but it is not an option either: it fires on the row as queued, so project deletion still aborts');
    await alt.close();
  }

  const rollback = commented(/^-- ROLLBACK/, /^-- The app falls back/);
  await db.exec('begin');
  try {
    await db.exec(rollback);
    ok((await one<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_name = 'project_milestones'`)).n === 0
       && (await one<{ n: number }>(`select count(*)::int as n from information_schema.columns where table_name = 'tasks' and column_name = 'project_milestone_id'`)).n === 0
       && (await constraintCount('projects', `conname = 'projects_id_user_id_key'`)) === 0
       && (await constraintCount('projects', `contype = 'p'`)) === 1
       && (await learningsFingerprint()).full === learningsBefore.full,
       'The documented rollback is valid, removes exactly 008\u2019s objects, keeps the projects primary key and leaves the learnings untouched');
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
