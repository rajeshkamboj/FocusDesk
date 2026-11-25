-- Nullable link: manual priority entries remain supported.
alter table public.daily_priorities
  add column if not exists task_id text null references public.tasks(id) on delete set null;
create index if not exists daily_priorities_task_id_idx on public.daily_priorities(task_id);
