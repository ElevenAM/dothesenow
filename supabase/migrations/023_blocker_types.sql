-- Phase 7A: Blocker Resolution Agent
-- Creates dtn_blockers table for blocker tracking, classification, and resolution.
-- Also extends dtn_approval_queue.item_type for blocker_decision entries.
BEGIN;

-- ─── 1. New table: blocker tracking ────────────────────────────

CREATE TABLE IF NOT EXISTS dtn_blockers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES dtn_daily_tasks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  reported_by UUID REFERENCES auth.users(id),

  -- Classification (null until classified)
  blocker_type TEXT CHECK (blocker_type IN (
    'knowledge_gap', 'dependency', 'skill_gap',
    'resource_constraint', 'decision_needed'
  )),
  blocker_type_secondary TEXT CHECK (blocker_type_secondary IN (
    'knowledge_gap', 'dependency', 'skill_gap',
    'resource_constraint', 'decision_needed'
  )),
  classification_confidence REAL,
  classification_reasoning TEXT,

  -- Resolution lifecycle
  resolution_status TEXT NOT NULL DEFAULT 'reported' CHECK (resolution_status IN (
    'reported', 'classifying', 'classified', 'resolving',
    'resolved', 'escalated', 'dismissed', 'failed'
  )),
  resolution_output TEXT,
  resolution_metadata JSONB NOT NULL DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),

  -- Escalation (PagerDuty-style 24/48/72hr)
  escalation_level INT NOT NULL DEFAULT 0,
  last_escalated_at TIMESTAMPTZ,

  -- Inngest correlation
  inngest_run_id TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 2. Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dtn_blockers_task
  ON dtn_blockers(task_id);

CREATE INDEX IF NOT EXISTS idx_dtn_blockers_org_status
  ON dtn_blockers(org_id, resolution_status);

-- Partial index for escalation queries: only unresolved blockers
CREATE INDEX IF NOT EXISTS idx_dtn_blockers_unresolved
  ON dtn_blockers(resolution_status, escalation_level)
  WHERE resolution_status NOT IN ('resolved', 'dismissed');

-- ─── 3. Updated_at trigger ──────────────────────────────────────

CREATE TRIGGER update_dtn_blockers_timestamp
  BEFORE UPDATE ON dtn_blockers
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

-- ─── 4. RLS: service role full, members read + insert + update own org ─

ALTER TABLE dtn_blockers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON dtn_blockers
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Members read own org blockers" ON dtn_blockers
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    org_id IN (
      SELECT org_id FROM dtn_memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Members report blockers in own org" ON dtn_blockers
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND
    org_id IN (
      SELECT org_id FROM dtn_memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Members update own org blockers" ON dtn_blockers
  FOR UPDATE USING (
    auth.role() = 'authenticated' AND
    org_id IN (
      SELECT org_id FROM dtn_memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- ─── 5. Extend approval_queue item_type for blocker decisions ───

ALTER TABLE dtn_approval_queue
  DROP CONSTRAINT IF EXISTS dtn_approval_queue_item_type_check;

ALTER TABLE dtn_approval_queue
  ADD CONSTRAINT dtn_approval_queue_item_type_check
  CHECK (item_type IN (
    'social_post', 'blog_post', 'email_draft',
    'task_submission', 'strategy_change', 'blocker_decision'
  ));

COMMIT;
