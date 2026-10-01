-- Migration: task timer — actual time tracking
--
-- Adds the fields needed to measure how long a task actually took, next to
-- (never instead of) the existing estimated_duration:
--
--   started_at              when the current timing segment began (Start/Resume)
--   paused_at               when the task was last paused
--   actual_duration_seconds accumulated/final active working time in seconds
--
-- The existing task `status` column already represents the timer lifecycle
-- ('in_progress' covers both running and paused), so no new status field is
-- introduced. `estimated_duration` (minutes) is untouched — estimate and
-- actual are stored side by side for later estimation-accuracy analysis.
--
-- Safe to run repeatedly (IF NOT EXISTS guards). No tables are recreated, no
-- data is modified, no RLS policies or auth settings are touched. Existing
-- tasks keep working: the new columns are nullable and default to "never
-- timed" (NULL).

alter table if exists tasks
  add column if not exists started_at timestamptz;

alter table if exists tasks
  add column if not exists paused_at timestamptz;

alter table if exists tasks
  add column if not exists actual_duration_seconds integer;
