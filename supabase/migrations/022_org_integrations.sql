-- Phase 6C: Executor Integration Framework
-- Creates org-level integration storage, drops closed executor_type CHECK,
-- and extends submitted_by_type for Jasper approval queue entries.
BEGIN;

-- ─── 1. New table: org-level integration credentials ─────────

CREATE TABLE IF NOT EXISTS dtn_org_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  vault_secret_id UUID,
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT now(),
  connected_by UUID REFERENCES auth.users(id),
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, integration_type)
);

CREATE INDEX IF NOT EXISTS idx_dtn_org_integrations_org
  ON dtn_org_integrations(org_id);

CREATE TRIGGER update_dtn_org_integrations_timestamp
  BEFORE UPDATE ON dtn_org_integrations
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

-- ─── 2. RLS: members read, writes via admin client ───────────

ALTER TABLE dtn_org_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON dtn_org_integrations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Members read own org integrations" ON dtn_org_integrations
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    org_id IN (
      SELECT org_id FROM dtn_memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- ─── 3. Drop executor_type CHECK (registry is source of truth) ──

ALTER TABLE dtn_daily_tasks
  DROP CONSTRAINT IF EXISTS dtn_daily_tasks_executor_type_check;

-- ─── 4. Extend submitted_by_type CHECK for Jasper ────────────

ALTER TABLE dtn_approval_queue
  DROP CONSTRAINT IF EXISTS dtn_approval_queue_submitted_by_type_check;

ALTER TABLE dtn_approval_queue
  ADD CONSTRAINT dtn_approval_queue_submitted_by_type_check
  CHECK (submitted_by_type IN (
    'freelancer', 'n8n', 'claude_api', 'member', 'jasper_api'
  ));

COMMIT;
