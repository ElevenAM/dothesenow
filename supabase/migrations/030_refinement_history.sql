-- Phase 9B: Feedback Engine — Strategy Auto-Refinement
-- Creates dtn_refinement_runs table for tracking refinement pipeline executions.
-- Extends approval_queue item_type constraint with 'strategy_refinement'.
-- Adds composite index on dtn_daily_tasks for zero-day detection queries.

BEGIN;

-- =============================================================================
-- 1. NEW TABLE: dtn_refinement_runs
-- =============================================================================
-- One row per refinement execution (Inngest run). Stores the full context:
-- which strategy was refined, Claude's raw suggestions, the performance data
-- snapshot sent to the prompt (audit/replay), and per-suggestion decisions
-- after user review.

CREATE TABLE dtn_refinement_runs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  strategy_doc_id UUID NOT NULL REFERENCES mktg_strategy_docs(id),
  approval_id     UUID REFERENCES dtn_approval_queue(id),
  run_id          TEXT NOT NULL,                -- idempotency key e.g. "weekly-{org_id}-{date}"
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  raw_suggestions JSONB NOT NULL DEFAULT '[]',  -- Claude's full JSON output
  suggestion_count INTEGER NOT NULL DEFAULT 0,
  data_snapshot   JSONB NOT NULL DEFAULT '{}',  -- exact performance data sent to Claude
  decisions       JSONB,                        -- per-suggestion accept/reject/modify after review
  applied_doc_id  UUID REFERENCES mktg_strategy_docs(id), -- new strategy version on accept
  skipped_reason  TEXT,                         -- e.g. "insufficient_data"
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_refinement_runs_org
  ON dtn_refinement_runs(org_id, created_at DESC);

CREATE INDEX idx_refinement_runs_strategy
  ON dtn_refinement_runs(strategy_doc_id);

-- Idempotency: one run per org per run_id (prevents duplicate Inngest executions)
CREATE UNIQUE INDEX idx_refinement_runs_idempotent
  ON dtn_refinement_runs(org_id, run_id);

-- updated_at trigger (reuse existing function)
CREATE TRIGGER update_dtn_refinement_runs_timestamp
  BEFORE UPDATE ON dtn_refinement_runs
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();


-- =============================================================================
-- 2. RLS POLICIES
-- =============================================================================

ALTER TABLE dtn_refinement_runs ENABLE ROW LEVEL SECURITY;

-- Service role: full access (Inngest functions run as service_role)
CREATE POLICY "Service role full access"
  ON dtn_refinement_runs FOR ALL
  USING (auth.role() = 'service_role');

-- Org members: read-only access to runs in their orgs
CREATE POLICY "Members read refinement runs"
  ON dtn_refinement_runs FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );


-- =============================================================================
-- 3. REALTIME
-- =============================================================================
-- Enables UI to react as Inngest pipeline progresses through steps.

ALTER TABLE dtn_refinement_runs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE dtn_refinement_runs;


-- =============================================================================
-- 4. EXTEND APPROVAL QUEUE ITEM_TYPE
-- =============================================================================
-- Add 'strategy_refinement' to the CHECK constraint.

ALTER TABLE dtn_approval_queue
  DROP CONSTRAINT IF EXISTS dtn_approval_queue_item_type_check;

ALTER TABLE dtn_approval_queue
  ADD CONSTRAINT dtn_approval_queue_item_type_check
  CHECK (item_type IN (
    'social_post', 'blog_post', 'email_draft',
    'task_submission', 'strategy_change', 'blocker_decision',
    'strategy_refinement'
  ));


-- =============================================================================
-- 5. COMPOSITE INDEX ON dtn_daily_tasks FOR ZERO-DAY DETECTION
-- =============================================================================
-- The refinement pipeline needs to detect consecutive days with zero completed
-- tasks per channel. The get_channel_performance() RPC only returns aggregates.
-- This index supports the date-range + channel grouping query pattern:
--   SELECT strategy_section_ref, scheduled_date, COUNT(*)
--   FROM dtn_daily_tasks
--   WHERE org_id = $1 AND scheduled_date BETWEEN $2 AND $3
--     AND strategy_section_ref IS NOT NULL AND deleted_at IS NULL
--   GROUP BY strategy_section_ref, scheduled_date

CREATE INDEX idx_daily_tasks_org_date_channel
  ON dtn_daily_tasks(org_id, scheduled_date, strategy_section_ref)
  WHERE strategy_section_ref IS NOT NULL AND deleted_at IS NULL;

COMMIT;
