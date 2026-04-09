-- Add direct FK constraints from dtn_daily_tasks to profiles table
-- so PostgREST can resolve the profile joins via FK hints.
-- The existing FKs (assigned_to → auth.users, created_by → auth.users) remain.

ALTER TABLE dtn_daily_tasks
  ADD CONSTRAINT dtn_daily_tasks_assigned_to_profiles_fkey
  FOREIGN KEY (assigned_to) REFERENCES profiles(id);

ALTER TABLE dtn_daily_tasks
  ADD CONSTRAINT dtn_daily_tasks_created_by_profiles_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id);
