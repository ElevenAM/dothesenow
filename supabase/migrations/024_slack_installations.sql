---
--- Phase [8A] — Slack Integration: Installations
---
--- Creates dtn_slack_installations table linking Slack workspaces to DTN orgs.
--- Bot tokens are stored in Supabase Vault via dtn_org_integrations
--- (integration_type = 'slack'). This table stores Slack-specific metadata
--- needed for event routing and user resolution.
---

CREATE TABLE IF NOT EXISTS dtn_slack_installations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  bot_user_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  installer_user_id UUID REFERENCES auth.users(id),
  bot_scopes TEXT[] NOT NULL DEFAULT '{}',
  user_cache JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, team_id),
  UNIQUE(team_id)
);

CREATE INDEX idx_slack_installations_org ON dtn_slack_installations(org_id);
CREATE INDEX idx_slack_installations_team ON dtn_slack_installations(team_id);

-- RLS (matches dtn_org_integrations pattern from migration 022)
ALTER TABLE dtn_slack_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on slack_installations"
  ON dtn_slack_installations FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Members can read own org installations"
  ON dtn_slack_installations FOR SELECT
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- Auto-update timestamp trigger
CREATE TRIGGER set_slack_installations_updated
  BEFORE UPDATE ON dtn_slack_installations
  FOR EACH ROW EXECUTE FUNCTION public.mktg_update_timestamp();
