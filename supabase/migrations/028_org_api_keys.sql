-- Claude Plugin: Per-org API keys for remote MCP access.
-- Stores hashed keys with full key in Vault for secure multi-tenant auth.
BEGIN;

-- ─── 1. New table: per-org API keys ────────────────────────────

CREATE TABLE IF NOT EXISTS dtn_org_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL,           -- First 12 chars for display ("dtn_mcp_abc1...")
  key_hash TEXT NOT NULL,             -- SHA-256 hash for lookup
  vault_secret_id UUID,               -- Full key stored in Vault
  label TEXT NOT NULL DEFAULT '',     -- User-given name ("Liam's MacBook")
  scopes TEXT[] NOT NULL DEFAULT '{mcp}',
  created_by UUID REFERENCES auth.users(id),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,             -- Optional expiry (NULL = no expiry)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique hash for O(1) lookup during API key validation
CREATE UNIQUE INDEX idx_dtn_org_api_keys_hash ON dtn_org_api_keys(key_hash);

-- Org index for listing keys
CREATE INDEX idx_dtn_org_api_keys_org ON dtn_org_api_keys(org_id);

-- Timestamp trigger (reuses existing function from earlier migrations)
CREATE TRIGGER update_dtn_org_api_keys_timestamp
  BEFORE UPDATE ON dtn_org_api_keys
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

-- ─── 2. RLS: members read own org keys, writes via admin client ─

ALTER TABLE dtn_org_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON dtn_org_api_keys
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Members read own org API keys" ON dtn_org_api_keys
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    org_id IN (
      SELECT org_id FROM dtn_memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

COMMIT;
