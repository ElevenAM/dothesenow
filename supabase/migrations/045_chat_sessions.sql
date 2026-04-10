-- Migration 045: Chat Sessions & Messages
--
-- Adds tables for the dashboard chat interface that lets users interact
-- with their tasks, contacts, and strategy via natural language.
-- Uses the same MCP tools as the Claude Cowork/Desktop integration.
-- Each message turn deducts 1 credit from the org's balance.

-- =============================================================================
-- 1. CHAT SESSIONS TABLE
-- =============================================================================

CREATE TABLE dtn_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_sessions_org ON dtn_chat_sessions(org_id, updated_at DESC);
CREATE INDEX idx_chat_sessions_user ON dtn_chat_sessions(user_id, updated_at DESC);

ALTER TABLE dtn_chat_sessions ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY "Service role full access on chat_sessions"
  ON dtn_chat_sessions FOR ALL
  USING (auth.role() = 'service_role');

-- Authenticated users: can access sessions in their orgs
CREATE POLICY "Members access own org chat sessions"
  ON dtn_chat_sessions FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

-- =============================================================================
-- 2. CHAT MESSAGES TABLE
-- =============================================================================

CREATE TABLE dtn_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES dtn_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool_call', 'tool_result')),
  content TEXT NOT NULL,
  tool_name TEXT,
  tool_input JSONB,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_session ON dtn_chat_messages(session_id, created_at);

ALTER TABLE dtn_chat_messages ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY "Service role full access on chat_messages"
  ON dtn_chat_messages FOR ALL
  USING (auth.role() = 'service_role');

-- Authenticated users: access messages in their org's sessions
CREATE POLICY "Members access own org chat messages"
  ON dtn_chat_messages FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND session_id IN (
      SELECT id FROM dtn_chat_sessions
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND session_id IN (
      SELECT id FROM dtn_chat_sessions
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );
