-- OAuth 2.1 support for MCP server (Claude Cowork connector)
-- Enables authorization code flow with PKCE alongside existing API key auth.
-- Supports Dynamic Client Registration (RFC 7591) for seamless setup.

-- ─── Registered OAuth clients (via DCR) ──────────────────────────

CREATE TABLE dtn_mcp_oauth_clients (
  client_id     TEXT PRIMARY KEY,
  secret_hash   TEXT NOT NULL,
  client_name   TEXT NOT NULL DEFAULT 'MCP Client',
  redirect_uris TEXT[] NOT NULL,
  grant_types   TEXT[] NOT NULL DEFAULT '{authorization_code,refresh_token}',
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'client_secret_post',
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_revoked    BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE dtn_mcp_oauth_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON dtn_mcp_oauth_clients
  FOR ALL USING (auth.role() = 'service_role');

-- ─── Authorization codes (short-lived, single-use) ─────────────

CREATE TABLE dtn_mcp_oauth_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash     TEXT NOT NULL UNIQUE,
  client_id     TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  redirect_uri  TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256'
    CHECK (code_challenge_method = 'S256'),
  scopes        TEXT[] NOT NULL DEFAULT '{mcp}',
  used_at       TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_oauth_codes_expires ON dtn_mcp_oauth_codes (expires_at)
  WHERE used_at IS NULL;

ALTER TABLE dtn_mcp_oauth_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON dtn_mcp_oauth_codes
  FOR ALL USING (auth.role() = 'service_role');

-- ─── Access / refresh tokens ───────────────────────────────────

CREATE TABLE dtn_mcp_oauth_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token_hash     TEXT NOT NULL UNIQUE,
  refresh_token_hash    TEXT NOT NULL UNIQUE,
  access_token_prefix   TEXT NOT NULL,
  client_id             TEXT NOT NULL,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id                UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  scopes                TEXT[] NOT NULL DEFAULT '{mcp}',
  access_expires_at     TIMESTAMPTZ NOT NULL,
  refresh_expires_at    TIMESTAMPTZ NOT NULL,
  is_revoked            BOOLEAN NOT NULL DEFAULT false,
  last_used_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_oauth_tokens_user_org
  ON dtn_mcp_oauth_tokens (user_id, org_id)
  WHERE is_revoked = false;

CREATE INDEX idx_mcp_oauth_tokens_refresh
  ON dtn_mcp_oauth_tokens (refresh_token_hash)
  WHERE is_revoked = false;

ALTER TABLE dtn_mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON dtn_mcp_oauth_tokens
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "users_read_own" ON dtn_mcp_oauth_tokens
  FOR SELECT USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM dtn_memberships
      WHERE dtn_memberships.org_id = dtn_mcp_oauth_tokens.org_id
        AND dtn_memberships.user_id = auth.uid()
        AND dtn_memberships.is_active = true
    )
  );
