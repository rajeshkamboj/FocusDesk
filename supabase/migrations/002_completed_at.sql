-- Migration: authoritative completed_at timestamps for tasks
--
-- Makes sure completed_at is stamped with the server clock when a task
-- transitions to 'completed', and cleared when it moves back out. This
-- avoids trusting the browser clock while keeping the optimistic UI in
-- the frontend — the final value persisted to the row is the server one.
--
-- Safe to run repeatedly (IF NOT EXISTS guards). Existing completed rows
-- with NULL completed_at are left alone (legacy data).

-- Ensure the column exists (idempotent — schema.sql already creates it,
-- but databases created before the field was added will have it added).
alter table if exists tasks
  add column if not exists completed_at timestamptz;

create or replace function tasks_set_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    -- Only stamp when the caller didn't provide their own timestamp, so
    -- bulk imports / restores that already carry completed_at aren't
    -- overwritten with "now".
    if new.completed_at is null then
      new.completed_at := now();
    end if;
  elsif new.status is distinct from 'completed' and old.status = 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_set_completed_at on tasks;
create trigger trg_tasks_set_completed_at
before update on tasks
for each row
execute function tasks_set_completed_at();
