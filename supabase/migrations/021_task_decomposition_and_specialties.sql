-- Phase 6B: Task decomposition engine — strategy linking + team specialties
-- Adds columns to dtn_daily_tasks for tracking which strategy/experiment generated each task.
-- Adds marketing specialties to dtn_memberships for AI-powered task assignment.

BEGIN;

-- =============================================================================
-- 1. TASK ↔ STRATEGY LINKING
-- =============================================================================

-- Proper FK to source strategy doc (nullable: manual tasks have no strategy link)
ALTER TABLE dtn_daily_tasks
  ADD COLUMN strategy_doc_id UUID REFERENCES mktg_strategy_docs(id);

-- Which GACCS section this task relates to (e.g., "Channels.ContentSEO", "ExperimentBacklog.3")
ALTER TABLE dtn_daily_tasks
  ADD COLUMN strategy_section_ref TEXT;

-- Experiment tracking for multi-day task sequences (positional ID from backlog, not a DB row)
ALTER TABLE dtn_daily_tasks
  ADD COLUMN experiment_id TEXT;

-- Estimated duration in minutes — bounded to prevent LLM hallucination
ALTER TABLE dtn_daily_tasks
  ADD COLUMN duration_minutes INTEGER CHECK (duration_minutes > 0 AND duration_minutes <= 180);

-- Recommended team role for assignment (e.g., "content_writer", "analytics")
-- Stored even when no team member matches, so the UI can show the suggestion
ALTER TABLE dtn_daily_tasks
  ADD COLUMN recommended_assignee_role TEXT;

-- Indexes for decomposition queries
CREATE INDEX idx_daily_tasks_strategy_doc
  ON dtn_daily_tasks(strategy_doc_id)
  WHERE strategy_doc_id IS NOT NULL;

CREATE INDEX idx_daily_tasks_experiment
  ON dtn_daily_tasks(org_id, experiment_id)
  WHERE experiment_id IS NOT NULL;

-- =============================================================================
-- 2. TEAM MARKETING SPECIALTIES
-- =============================================================================

-- Marketing specialties distinct from role (owner/admin/member) which controls permissions.
-- Values enforced at app layer for extensibility: content_writer, social_media, analytics,
-- design, growth_lead, seo, email_marketing, paid_ads, community
ALTER TABLE dtn_memberships
  ADD COLUMN specialties TEXT[] DEFAULT '{}';

COMMENT ON COLUMN dtn_memberships.specialties IS
  'Marketing specialties for AI task assignment. Distinct from role which controls permissions.';

COMMIT;
