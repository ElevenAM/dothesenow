-- Migration 011: Harden Freelancer RLS Policies
-- Phase [2A] — Database Schema Hardening
--
-- Problem: Freelancer RLS policies from migration 001 use email-based lookups
-- instead of org-scoped get_user_org_ids(). Also no DELETE policies exist on
-- any table (ARCH-007).
--
-- This migration:
--   1. Drops old email-based freelancer policies
--   2. Replaces with org-scoped policies using get_user_org_ids()
--   3. Adds DELETE policies to org-scoped tables

-- =============================================================================
-- 1. DROP OLD FREELANCER POLICIES
-- =============================================================================

-- mktg_tasks: 2 freelancer policies
DROP POLICY IF EXISTS "Freelancers see assigned tasks" ON mktg_tasks;
DROP POLICY IF EXISTS "Freelancers see open tasks" ON mktg_tasks;

-- mktg_task_submissions: 1 freelancer policy
DROP POLICY IF EXISTS "Freelancers manage own submissions" ON mktg_task_submissions;

-- mktg_task_messages: 1 freelancer policy
DROP POLICY IF EXISTS "Freelancers see task messages" ON mktg_task_messages;


-- =============================================================================
-- 2. CREATE ORG-SCOPED FREELANCER POLICIES
-- =============================================================================

-- Freelancers can see tasks assigned to them (via org membership + assignment)
CREATE POLICY "Freelancers see assigned tasks"
  ON mktg_tasks FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
    AND assigned_to IN (
      SELECT id FROM mktg_freelancers
      WHERE org_id IN (SELECT public.get_user_org_ids())
        AND email = auth.jwt()->>'email'
    )
    AND status IN ('claimed', 'in_progress', 'review', 'revision', 'completed')
  );

-- Freelancers can see open tasks within their org
CREATE POLICY "Freelancers see open tasks"
  ON mktg_tasks FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
    AND status = 'open'
  );

-- Freelancers manage submissions for their own freelancer profile within org
CREATE POLICY "Freelancers manage own submissions"
  ON mktg_task_submissions FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
    AND freelancer_id IN (
      SELECT id FROM mktg_freelancers
      WHERE org_id IN (SELECT public.get_user_org_ids())
        AND email = auth.jwt()->>'email'
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
    AND freelancer_id IN (
      SELECT id FROM mktg_freelancers
      WHERE org_id IN (SELECT public.get_user_org_ids())
        AND email = auth.jwt()->>'email'
    )
  );

-- Freelancers see messages on tasks they're assigned to within their org
CREATE POLICY "Freelancers see task messages"
  ON mktg_task_messages FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
    AND task_id IN (
      SELECT id FROM mktg_tasks
      WHERE org_id IN (SELECT public.get_user_org_ids())
        AND assigned_to IN (
          SELECT id FROM mktg_freelancers
          WHERE org_id IN (SELECT public.get_user_org_ids())
            AND email = auth.jwt()->>'email'
        )
    )
  );


-- =============================================================================
-- 3. ADD DELETE POLICIES (ARCH-007)
-- =============================================================================
-- Currently all org-scoped tables use FOR ALL policies which already cover
-- DELETE operations. Verify by checking: the "Members access *" policies are
-- all FOR ALL, meaning SELECT, INSERT, UPDATE, DELETE are all covered.
--
-- However, some tables only have SELECT policies for members:
--   - dtn_organizations: SELECT + INSERT + UPDATE only (no DELETE — intentional,
--     org deletion should be admin-only via service role)
--   - dtn_memberships: SELECT + INSERT only (no DELETE — intentional, membership
--     removal via service role functions)
--   - dtn_subscriptions: SELECT only (no write — managed by Stripe webhooks)
--
-- The FOR ALL tables already cover DELETE. No additional policies needed.
-- This comment documents the intentional design for ARCH-007.

-- =============================================================================
-- ROLLBACK INSTRUCTIONS
-- =============================================================================
-- To rollback this migration:
--
-- DROP POLICY IF EXISTS "Freelancers see assigned tasks" ON mktg_tasks;
-- DROP POLICY IF EXISTS "Freelancers see open tasks" ON mktg_tasks;
-- DROP POLICY IF EXISTS "Freelancers manage own submissions" ON mktg_task_submissions;
-- DROP POLICY IF EXISTS "Freelancers see task messages" ON mktg_task_messages;
--
-- Then re-create the original email-based policies from migration 001:
--
-- CREATE POLICY "Freelancers see assigned tasks" ON mktg_tasks
--   FOR SELECT USING (
--     auth.role() = 'authenticated' AND
--     assigned_to IN (SELECT id FROM mktg_freelancers WHERE email = auth.jwt()->>'email') AND
--     status IN ('claimed', 'in_progress', 'review', 'revision', 'completed'));
--
-- CREATE POLICY "Freelancers see open tasks" ON mktg_tasks
--   FOR SELECT USING (auth.role() = 'authenticated' AND status = 'open');
--
-- CREATE POLICY "Freelancers manage own submissions" ON mktg_task_submissions
--   FOR ALL USING (
--     auth.role() = 'authenticated' AND
--     freelancer_id IN (SELECT id FROM mktg_freelancers WHERE email = auth.jwt()->>'email'));
--
-- CREATE POLICY "Freelancers see task messages" ON mktg_task_messages
--   FOR SELECT USING (
--     auth.role() = 'authenticated' AND
--     task_id IN (SELECT id FROM mktg_tasks WHERE assigned_to IN (
--       SELECT id FROM mktg_freelancers WHERE email = auth.jwt()->>'email')));
