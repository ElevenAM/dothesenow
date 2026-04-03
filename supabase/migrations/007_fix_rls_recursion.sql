-- Migration 007: Fix infinite RLS recursion on dtn_memberships
--
-- Root cause: The "Members see own memberships" policy on dtn_memberships
-- subqueries dtn_memberships itself. When Postgres evaluates the policy,
-- the subquery triggers the same policy again → infinite recursion.
-- All 19 other org-scoped policies also subquery dtn_memberships, which
-- triggers the recursive policy indirectly.
--
-- Fix: Create a SECURITY DEFINER function that returns the user's org_ids
-- without going through RLS, then replace all inline subqueries with it.
--
-- This migration runs as a single transaction; partial failure rolls back
-- all changes.

-- ============================================================
-- 1. Helper function: get_user_org_ids()
--    Returns org_ids for the authenticated user, bypassing RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM dtn_memberships
  WHERE user_id = auth.uid() AND is_active = true;
$$;

REVOKE ALL ON FUNCTION public.get_user_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO authenticated, service_role;

-- ============================================================
-- 2. Drop all 20 affected policies
-- ============================================================

-- From 002_multi_tenant.sql
DROP POLICY IF EXISTS "Members see own orgs" ON dtn_organizations;
DROP POLICY IF EXISTS "Members see own memberships" ON dtn_memberships;
DROP POLICY IF EXISTS "Members access departments" ON dtn_departments;
DROP POLICY IF EXISTS "Members access daily tasks" ON dtn_daily_tasks;
DROP POLICY IF EXISTS "Members access approvals" ON dtn_approval_queue;
DROP POLICY IF EXISTS "Members access social creds" ON dtn_social_credentials;
DROP POLICY IF EXISTS "Members access blog posts" ON dtn_blog_posts;
DROP POLICY IF EXISTS "Members access subscriptions" ON dtn_subscriptions;
DROP POLICY IF EXISTS "Members access contacts" ON mktg_contacts;
DROP POLICY IF EXISTS "Members access outreach" ON mktg_outreach_log;
DROP POLICY IF EXISTS "Members access campaigns" ON mktg_campaigns;
DROP POLICY IF EXISTS "Members access strategy docs" ON mktg_strategy_docs;
DROP POLICY IF EXISTS "Members access competitors" ON mktg_competitors;
DROP POLICY IF EXISTS "Members access insights" ON mktg_insights;
DROP POLICY IF EXISTS "Members access freelancers" ON mktg_freelancers;
DROP POLICY IF EXISTS "Members access tasks" ON mktg_tasks;
DROP POLICY IF EXISTS "Members access submissions" ON mktg_task_submissions;
DROP POLICY IF EXISTS "Members access messages" ON mktg_task_messages;
DROP POLICY IF EXISTS "Members access weekly reviews" ON mktg_weekly_reviews;

-- From 004_profiles_and_invite_limit.sql
DROP POLICY IF EXISTS "Users can read profiles within their orgs" ON profiles;

-- ============================================================
-- 3. Recreate all 20 policies using get_user_org_ids()
-- ============================================================

-- dtn_organizations: SELECT
CREATE POLICY "Members see own orgs" ON dtn_organizations
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    id IN (SELECT public.get_user_org_ids())
  );

-- dtn_memberships: SELECT (was self-referencing, now uses helper)
CREATE POLICY "Members see own memberships" ON dtn_memberships
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- dtn_departments: ALL
CREATE POLICY "Members access departments" ON dtn_departments
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- dtn_daily_tasks: ALL
CREATE POLICY "Members access daily tasks" ON dtn_daily_tasks
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- dtn_approval_queue: ALL
CREATE POLICY "Members access approvals" ON dtn_approval_queue
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- dtn_social_credentials: ALL
CREATE POLICY "Members access social creds" ON dtn_social_credentials
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- dtn_blog_posts: ALL
CREATE POLICY "Members access blog posts" ON dtn_blog_posts
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- dtn_subscriptions: SELECT only
CREATE POLICY "Members access subscriptions" ON dtn_subscriptions
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- mktg_contacts: ALL
CREATE POLICY "Members access contacts" ON mktg_contacts
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- mktg_outreach_log: ALL
CREATE POLICY "Members access outreach" ON mktg_outreach_log
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- mktg_campaigns: ALL
CREATE POLICY "Members access campaigns" ON mktg_campaigns
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- mktg_strategy_docs: ALL
CREATE POLICY "Members access strategy docs" ON mktg_strategy_docs
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- mktg_competitors: ALL
CREATE POLICY "Members access competitors" ON mktg_competitors
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- mktg_insights: ALL
CREATE POLICY "Members access insights" ON mktg_insights
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- mktg_freelancers: ALL
CREATE POLICY "Members access freelancers" ON mktg_freelancers
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- mktg_tasks: ALL
CREATE POLICY "Members access tasks" ON mktg_tasks
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- mktg_task_submissions: ALL
CREATE POLICY "Members access submissions" ON mktg_task_submissions
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- mktg_task_messages: ALL
CREATE POLICY "Members access messages" ON mktg_task_messages
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- mktg_weekly_reviews: ALL
CREATE POLICY "Members access weekly reviews" ON mktg_weekly_reviews
  FOR ALL USING (
    auth.uid() IS NOT NULL AND
    org_id IN (SELECT public.get_user_org_ids())
  );

-- profiles: SELECT (rewritten to use helper instead of self-join)
CREATE POLICY "Users can read profiles within their orgs"
  ON profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      id = auth.uid()
      OR id IN (
        SELECT m.user_id FROM dtn_memberships m
        WHERE m.org_id IN (SELECT public.get_user_org_ids())
          AND m.is_active = true
          AND m.user_id IS NOT NULL
      )
    )
  );

-- ============================================================
-- 4. INSERT policies for onboarding flow
-- ============================================================

-- Any authenticated user can create an organization
CREATE POLICY "Authenticated users can create orgs" ON dtn_organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Users can insert themselves as owner of an org
CREATE POLICY "Users can create own membership as owner" ON dtn_memberships
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND role = 'owner'
  );
