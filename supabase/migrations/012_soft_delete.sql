-- Migration 012: Soft Delete
-- Phase [2A] — Database Schema Hardening
--
-- Adds deleted_at column to key tables with partial indexes for live rows.
-- Updates RLS SELECT policies to exclude soft-deleted rows.
-- Creates per-table soft delete functions (not generic — per EM review C3).
--
-- Tables: dtn_daily_tasks, mktg_contacts, mktg_strategy_docs, mktg_campaigns
-- Note: dtn_organizations intentionally excluded — no FK cascade on soft delete
--       would leave ~15 child tables with orphaned live rows.

-- =============================================================================
-- 1. ADD deleted_at COLUMNS + PARTIAL INDEXES
-- =============================================================================

ALTER TABLE dtn_daily_tasks ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX idx_dtn_daily_tasks_live ON dtn_daily_tasks (org_id, scheduled_date)
  WHERE deleted_at IS NULL;

ALTER TABLE mktg_contacts ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX idx_mktg_contacts_live ON mktg_contacts (org_id)
  WHERE deleted_at IS NULL;

ALTER TABLE mktg_strategy_docs ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX idx_mktg_strategy_docs_live ON mktg_strategy_docs (org_id, doc_type)
  WHERE deleted_at IS NULL;

ALTER TABLE mktg_campaigns ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX idx_mktg_campaigns_live ON mktg_campaigns (org_id)
  WHERE deleted_at IS NULL;


-- =============================================================================
-- 2. UPDATE RLS SELECT POLICIES TO EXCLUDE SOFT-DELETED ROWS
-- =============================================================================
-- The existing "Members access *" policies are FOR ALL. We need to replace
-- them with separate SELECT (filters deleted_at) and non-SELECT (INSERT,
-- UPDATE, DELETE — no deleted_at filter needed) policies.
--
-- Only the 4 tables with deleted_at need this change.

-- --- dtn_daily_tasks ---
DROP POLICY IF EXISTS "Members access daily tasks" ON dtn_daily_tasks;

CREATE POLICY "Members select live daily tasks"
  ON dtn_daily_tasks FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
    AND deleted_at IS NULL
  );

CREATE POLICY "Members modify daily tasks"
  ON dtn_daily_tasks FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY "Members update daily tasks"
  ON dtn_daily_tasks FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY "Members delete daily tasks"
  ON dtn_daily_tasks FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

-- --- mktg_contacts ---
DROP POLICY IF EXISTS "Members access contacts" ON mktg_contacts;

CREATE POLICY "Members select live contacts"
  ON mktg_contacts FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
    AND deleted_at IS NULL
  );

CREATE POLICY "Members modify contacts"
  ON mktg_contacts FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY "Members update contacts"
  ON mktg_contacts FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY "Members delete contacts"
  ON mktg_contacts FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

-- --- mktg_strategy_docs ---
DROP POLICY IF EXISTS "Members access strategy docs" ON mktg_strategy_docs;

CREATE POLICY "Members select live strategy docs"
  ON mktg_strategy_docs FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
    AND deleted_at IS NULL
  );

CREATE POLICY "Members modify strategy docs"
  ON mktg_strategy_docs FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY "Members update strategy docs"
  ON mktg_strategy_docs FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY "Members delete strategy docs"
  ON mktg_strategy_docs FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

-- --- mktg_campaigns ---
DROP POLICY IF EXISTS "Members access campaigns" ON mktg_campaigns;

CREATE POLICY "Members select live campaigns"
  ON mktg_campaigns FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
    AND deleted_at IS NULL
  );

CREATE POLICY "Members modify campaigns"
  ON mktg_campaigns FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY "Members update campaigns"
  ON mktg_campaigns FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY "Members delete campaigns"
  ON mktg_campaigns FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );


-- =============================================================================
-- 3. PER-TABLE SOFT DELETE FUNCTIONS
-- =============================================================================
-- Each function:
--   - Verifies caller is a member of the target org (EM review: cross-tenant fix)
--   - Checks row exists and is not already deleted
--   - Sets deleted_at = now()
--   - SECURITY DEFINER with pinned search_path

CREATE OR REPLACE FUNCTION public.soft_delete_task(p_task_id UUID, p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is a member of the target org
  IF p_org_id NOT IN (SELECT public.get_user_org_ids()) THEN
    RAISE EXCEPTION 'Access denied: not a member of this organization';
  END IF;

  UPDATE dtn_daily_tasks
  SET deleted_at = now()
  WHERE id = p_task_id AND org_id = p_org_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found or already deleted';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_contact(p_contact_id UUID, p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id NOT IN (SELECT public.get_user_org_ids()) THEN
    RAISE EXCEPTION 'Access denied: not a member of this organization';
  END IF;

  UPDATE mktg_contacts
  SET deleted_at = now()
  WHERE id = p_contact_id AND org_id = p_org_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found or already deleted';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_strategy_doc(p_doc_id UUID, p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id NOT IN (SELECT public.get_user_org_ids()) THEN
    RAISE EXCEPTION 'Access denied: not a member of this organization';
  END IF;

  UPDATE mktg_strategy_docs
  SET deleted_at = now()
  WHERE id = p_doc_id AND org_id = p_org_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Strategy doc not found or already deleted';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_campaign(p_campaign_id UUID, p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id NOT IN (SELECT public.get_user_org_ids()) THEN
    RAISE EXCEPTION 'Access denied: not a member of this organization';
  END IF;

  UPDATE mktg_campaigns
  SET deleted_at = now()
  WHERE id = p_campaign_id AND org_id = p_org_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found or already deleted';
  END IF;
END;
$$;

-- Grant execute to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.soft_delete_task(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_contact(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_strategy_doc(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_campaign(UUID, UUID) TO authenticated, service_role;


-- =============================================================================
-- 4. UPDATE SUMMARY VIEWS TO EXCLUDE SOFT-DELETED ROWS
-- =============================================================================
-- These views were created in migration 002. Without this fix, service_role
-- queries (which bypass RLS) would include soft-deleted rows in counts.
-- Authenticated users are already protected by RLS SELECT policies, but
-- views must also filter explicitly for service_role correctness.

CREATE OR REPLACE VIEW dtn_daily_tasks_summary AS
SELECT
  org_id,
  scheduled_date,
  executor_type,
  count(*) AS total,
  count(*) FILTER (WHERE status = 'completed') AS completed,
  count(*) FILTER (WHERE status = 'pending') AS pending,
  count(*) FILTER (WHERE status = 'in_progress') AS in_progress,
  count(*) FILTER (WHERE status = 'failed') AS failed
FROM dtn_daily_tasks
WHERE deleted_at IS NULL
GROUP BY org_id, scheduled_date, executor_type
ORDER BY scheduled_date DESC;

CREATE OR REPLACE VIEW mktg_pipeline_summary AS
SELECT
  org_id,
  lifecycle_stage,
  contact_type,
  count(*) AS count,
  count(*) FILTER (WHERE last_engaged > now() - interval '7 days') AS engaged_last_7d,
  count(*) FILTER (WHERE last_engaged > now() - interval '30 days') AS engaged_last_30d,
  avg(lead_score) AS avg_lead_score
FROM mktg_contacts
WHERE status = 'active' AND deleted_at IS NULL
GROUP BY org_id, lifecycle_stage, contact_type
ORDER BY org_id, lifecycle_stage, contact_type;


-- =============================================================================
-- ROLLBACK INSTRUCTIONS
-- =============================================================================
-- To rollback this migration (run in reverse order):
--
-- 1. Drop soft delete functions:
--    DROP FUNCTION IF EXISTS public.soft_delete_task(UUID, UUID);
--    DROP FUNCTION IF EXISTS public.soft_delete_contact(UUID, UUID);
--    DROP FUNCTION IF EXISTS public.soft_delete_strategy_doc(UUID, UUID);
--    DROP FUNCTION IF EXISTS public.soft_delete_campaign(UUID, UUID);
--
-- 2. Drop the split policies and restore the original FOR ALL policies:
--    -- dtn_daily_tasks
--    DROP POLICY IF EXISTS "Members select live daily tasks" ON dtn_daily_tasks;
--    DROP POLICY IF EXISTS "Members modify daily tasks" ON dtn_daily_tasks;
--    DROP POLICY IF EXISTS "Members update daily tasks" ON dtn_daily_tasks;
--    DROP POLICY IF EXISTS "Members delete daily tasks" ON dtn_daily_tasks;
--    CREATE POLICY "Members access daily tasks" ON dtn_daily_tasks
--      FOR ALL USING (auth.uid() IS NOT NULL AND org_id IN (SELECT public.get_user_org_ids()));
--    (Repeat for mktg_contacts, mktg_strategy_docs, mktg_campaigns)
--
-- 3. Drop partial indexes:
--    DROP INDEX IF EXISTS idx_dtn_daily_tasks_live;
--    DROP INDEX IF EXISTS idx_mktg_contacts_live;
--    DROP INDEX IF EXISTS idx_mktg_strategy_docs_live;
--    DROP INDEX IF EXISTS idx_mktg_campaigns_live;
--
-- 4. Drop deleted_at columns:
--    ALTER TABLE dtn_daily_tasks DROP COLUMN IF EXISTS deleted_at;
--    ALTER TABLE mktg_contacts DROP COLUMN IF EXISTS deleted_at;
--    ALTER TABLE mktg_strategy_docs DROP COLUMN IF EXISTS deleted_at;
--    ALTER TABLE mktg_campaigns DROP COLUMN IF EXISTS deleted_at;
