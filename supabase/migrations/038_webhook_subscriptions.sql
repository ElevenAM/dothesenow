-- Phase 4/5: Webhook Subscriptions
-- Stores outbound webhook subscriptions for Zapier/API consumers

CREATE TABLE dtn_webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,         -- 'task.created', 'contact.updated', etc.
  target_url TEXT NOT NULL,
  vault_secret_id UUID NOT NULL,    -- HMAC signing secret in Vault (no plaintext)
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for webhook dispatch lookups
CREATE INDEX idx_webhook_subs_dispatch ON dtn_webhook_subscriptions (org_id, event_type, is_active)
  WHERE is_active = true;

-- Updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON dtn_webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

-- RLS
ALTER TABLE dtn_webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on webhook_subscriptions"
  ON dtn_webhook_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Members can read own org webhook subscriptions"
  ON dtn_webhook_subscriptions FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

CREATE POLICY "Members can manage own org webhook subscriptions"
  ON dtn_webhook_subscriptions FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

CREATE POLICY "Members can update own org webhook subscriptions"
  ON dtn_webhook_subscriptions FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );
