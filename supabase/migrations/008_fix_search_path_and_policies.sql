-- Migration 008: Fix mutable search_path on SECURITY DEFINER functions,
-- add missing UPDATE policy on dtn_organizations, and fix SECURITY DEFINER views.
--
-- Issues addressed:
-- 1. 5 SECURITY DEFINER functions lack SET search_path (flagged by Supabase advisor)
-- 2. dtn_organizations has no UPDATE policy — breaks Stripe checkout flow
-- 3. 3 views run as superuser, bypassing RLS (tenant isolation risk)

-- ============================================================
-- 1. Pin search_path on SECURITY DEFINER functions
--    (CREATE OR REPLACE preserves grants and dependencies)
-- ============================================================

-- handle_new_user() — auth trigger for profile creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- invite_team_member() — atomic invite with plan limit check
CREATE OR REPLACE FUNCTION invite_team_member(
  p_org_id UUID,
  p_invited_by UUID,
  p_invited_email TEXT,
  p_role TEXT
) RETURNS UUID AS $$
DECLARE
  v_plan TEXT;
  v_limit INT;
  v_count INT;
  v_id UUID;
BEGIN
  SELECT plan INTO v_plan
  FROM dtn_organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM dtn_memberships
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND is_active = true
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to invite members to this organization';
  END IF;

  IF v_plan = 'free' THEN
    v_limit := 2;
  ELSIF v_plan = 'premium' THEN
    v_limit := -1;
  ELSE
    RAISE EXCEPTION 'Unknown plan: %', v_plan;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM dtn_memberships
  WHERE org_id = p_org_id AND is_active = true AND user_id IS NOT NULL;

  IF v_limit != -1 AND v_count >= v_limit THEN
    RAISE EXCEPTION 'Member limit reached for % plan. Upgrade to add more members.', v_plan;
  END IF;

  IF EXISTS (
    SELECT 1 FROM dtn_memberships
    WHERE org_id = p_org_id
      AND invited_email = p_invited_email
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'This email has already been invited or is a member';
  END IF;

  IF EXISTS (
    SELECT 1 FROM dtn_memberships m
    JOIN profiles p ON p.id = m.user_id
    WHERE m.org_id = p_org_id
      AND p.email = p_invited_email
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'This email is already a member of this organization';
  END IF;

  v_id := uuid_generate_v4();
  INSERT INTO dtn_memberships (id, org_id, user_id, role, invited_by, invited_email, invited_at, accepted_at, is_active)
  VALUES (v_id, p_org_id, NULL, p_role, p_invited_by, p_invited_email, now(), NULL, true);

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- check_and_insert_invite() — atomic invite with plan limit check (team invites)
CREATE OR REPLACE FUNCTION check_and_insert_invite(
  p_org_id UUID,
  p_email TEXT,
  p_role TEXT,
  p_invited_by UUID
) RETURNS dtn_memberships AS $$
DECLARE
  v_plan TEXT;
  v_member_limit INT;
  v_current_count INT;
  v_result dtn_memberships;
BEGIN
  SELECT plan INTO v_plan
    FROM dtn_organizations
    WHERE id = p_org_id
    FOR UPDATE;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF v_plan = 'free' THEN
    v_member_limit := 2;
  ELSE
    v_member_limit := -1;
  END IF;

  IF v_member_limit > 0 THEN
    SELECT COUNT(*) INTO v_current_count
      FROM dtn_memberships
      WHERE org_id = p_org_id
        AND (is_active = true OR user_id IS NULL);

    IF v_current_count >= v_member_limit THEN
      RAISE EXCEPTION 'Member limit reached for your plan. Upgrade to add more members.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM dtn_memberships m
      JOIN auth.users u ON u.id = m.user_id
      WHERE m.org_id = p_org_id
        AND m.is_active = true
        AND LOWER(u.email) = LOWER(p_email)
  ) THEN
    RAISE EXCEPTION 'This user is already a member of your organization.';
  END IF;

  INSERT INTO dtn_memberships (org_id, invited_email, role, invited_by, invited_at, is_active)
    VALUES (p_org_id, LOWER(p_email), p_role, p_invited_by, now(), false)
    RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- check_and_accept_invite() — atomic invite acceptance
CREATE OR REPLACE FUNCTION check_and_accept_invite(
  p_membership_id UUID,
  p_user_id UUID,
  p_user_email TEXT
) RETURNS dtn_memberships AS $$
DECLARE
  v_invite dtn_memberships;
  v_plan TEXT;
  v_member_limit INT;
  v_current_count INT;
  v_result dtn_memberships;
BEGIN
  SELECT * INTO v_invite
    FROM dtn_memberships
    WHERE id = p_membership_id
      AND user_id IS NULL;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invite not found or already accepted.';
  END IF;

  IF LOWER(v_invite.invited_email) != LOWER(p_user_email) THEN
    RAISE EXCEPTION 'This invite was sent to a different email address.';
  END IF;

  SELECT plan INTO v_plan
    FROM dtn_organizations
    WHERE id = v_invite.org_id
    FOR UPDATE;

  IF v_plan = 'free' THEN
    v_member_limit := 2;
  ELSE
    v_member_limit := -1;
  END IF;

  IF v_member_limit > 0 THEN
    SELECT COUNT(*) INTO v_current_count
      FROM dtn_memberships
      WHERE org_id = v_invite.org_id
        AND is_active = true;

    IF v_current_count >= v_member_limit THEN
      RAISE EXCEPTION 'Organization has reached its member limit. Ask an admin to upgrade the plan.';
    END IF;
  END IF;

  UPDATE dtn_memberships
    SET user_id = p_user_id,
        accepted_at = now(),
        is_active = true
    WHERE id = p_membership_id
    RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- update_strategy_doc() — atomic version control for strategy docs
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
  IF NOT EXISTS (
    SELECT 1 FROM dtn_memberships
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorized to modify strategy documents for this organization';
  END IF;

  SELECT id, version INTO v_current_id, v_current_version
  FROM mktg_strategy_docs
  WHERE org_id = p_org_id
    AND doc_type = p_doc_type
    AND is_active = true
  FOR UPDATE;

  IF v_current_id IS NOT NULL THEN
    UPDATE mktg_strategy_docs
    SET is_active = false
    WHERE id = v_current_id;
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- mktg_update_timestamp() — not SECURITY DEFINER but still flagged for mutable search_path
CREATE OR REPLACE FUNCTION mktg_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- 2. Missing UPDATE policy on dtn_organizations
--    Needed for Stripe checkout (stripe/actions.ts:67)
--    Owners/admins can update their org.
-- ============================================================

CREATE POLICY "Owners can update own org" ON dtn_organizations
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND
    id IN (SELECT public.get_user_org_ids())
  ) WITH CHECK (
    auth.uid() IS NOT NULL AND
    id IN (SELECT public.get_user_org_ids())
  );

-- ============================================================
-- 3. Fix SECURITY DEFINER views — set security_invoker = on
--    so they respect the caller's RLS policies
-- ============================================================

ALTER VIEW mktg_pipeline_summary SET (security_invoker = on);
ALTER VIEW mktg_freelancer_leaderboard SET (security_invoker = on);
ALTER VIEW dtn_daily_tasks_summary SET (security_invoker = on);
