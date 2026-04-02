-- Migration 005: Realtime on strategy/contacts + strategy version safety
-- Phase 3: Core Views

-- ============================================================
-- 1. Enable Realtime on strategy docs and contacts
-- ============================================================

ALTER TABLE mktg_strategy_docs REPLICA IDENTITY FULL;
ALTER TABLE mktg_contacts REPLICA IDENTITY FULL;
ALTER TABLE mktg_outreach_log REPLICA IDENTITY FULL;

-- Add tables to realtime publication so clients receive change events
ALTER PUBLICATION supabase_realtime ADD TABLE mktg_strategy_docs;
ALTER PUBLICATION supabase_realtime ADD TABLE mktg_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE mktg_outreach_log;

-- ============================================================
-- 2. Unique partial index: prevent two active docs of same type per org
--    This is the safety net for concurrent strategy doc edits.
-- ============================================================

CREATE UNIQUE INDEX idx_mktg_strategy_one_active_per_type
  ON mktg_strategy_docs (org_id, doc_type)
  WHERE is_active = true;

-- ============================================================
-- 3. update_strategy_doc() — atomic version control
--    Deactivates current version + inserts new in one transaction.
--    Serialized via FOR UPDATE to prevent concurrent version conflicts.
-- ============================================================

CREATE OR REPLACE FUNCTION update_strategy_doc(
  p_org_id UUID,
  p_doc_type TEXT,
  p_title TEXT,
  p_content TEXT,
  p_change_summary TEXT DEFAULT NULL,
  p_changed_by TEXT DEFAULT 'user',
  p_tags TEXT[] DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_current_id UUID;
  v_current_version INT;
  v_new_id UUID;
BEGIN
  -- Verify the caller is an active member of this org
  IF NOT EXISTS (
    SELECT 1 FROM dtn_memberships
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorized to modify strategy documents for this organization';
  END IF;

  -- Lock and fetch current active doc for this type
  SELECT id, version INTO v_current_id, v_current_version
  FROM mktg_strategy_docs
  WHERE org_id = p_org_id
    AND doc_type = p_doc_type
    AND is_active = true
  FOR UPDATE;

  -- Deactivate current version (if exists)
  IF v_current_id IS NOT NULL THEN
    UPDATE mktg_strategy_docs
    SET is_active = false
    WHERE id = v_current_id;
  END IF;

  -- Insert new version
  v_new_id := uuid_generate_v4();
  INSERT INTO mktg_strategy_docs (
    id, org_id, doc_type, title, content, version,
    previous_version_id, change_summary, changed_by, tags, is_active
  ) VALUES (
    v_new_id, p_org_id, p_doc_type, p_title, p_content,
    COALESCE(v_current_version, 0) + 1,
    v_current_id, p_change_summary, p_changed_by, p_tags, true
  );

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
