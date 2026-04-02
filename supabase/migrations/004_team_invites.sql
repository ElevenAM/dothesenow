-- Migration 004: Team invite support
-- Adds indexes and PL/pgSQL functions for atomic plan-limit enforcement

-- Index for looking up pending invites by email
CREATE INDEX IF NOT EXISTS idx_dtn_memberships_invited_email
  ON dtn_memberships(invited_email) WHERE user_id IS NULL;

-- Prevent duplicate pending invites for same email+org
CREATE UNIQUE INDEX IF NOT EXISTS idx_dtn_memberships_pending_unique
  ON dtn_memberships(org_id, invited_email) WHERE user_id IS NULL;

-- Atomic invite insertion with plan limit check
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
  -- Lock the org row to prevent concurrent limit bypass
  SELECT plan INTO v_plan
    FROM dtn_organizations
    WHERE id = p_org_id
    FOR UPDATE;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Check plan limits (free = 2, premium = unlimited/-1)
  IF v_plan = 'free' THEN
    v_member_limit := 2;
  ELSE
    v_member_limit := -1;
  END IF;

  IF v_member_limit > 0 THEN
    -- Count active members + pending invites
    SELECT COUNT(*) INTO v_current_count
      FROM dtn_memberships
      WHERE org_id = p_org_id
        AND (is_active = true OR user_id IS NULL);

    IF v_current_count >= v_member_limit THEN
      RAISE EXCEPTION 'Member limit reached for your plan. Upgrade to add more members.';
    END IF;
  END IF;

  -- Check if email is already an active member
  IF EXISTS (
    SELECT 1 FROM dtn_memberships m
      JOIN auth.users u ON u.id = m.user_id
      WHERE m.org_id = p_org_id
        AND m.is_active = true
        AND LOWER(u.email) = LOWER(p_email)
  ) THEN
    RAISE EXCEPTION 'This user is already a member of your organization.';
  END IF;

  -- Insert the invite (unique index prevents duplicates)
  INSERT INTO dtn_memberships (org_id, invited_email, role, invited_by, invited_at, is_active)
    VALUES (p_org_id, LOWER(p_email), p_role, p_invited_by, now(), false)
    RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic invite acceptance with email verification and plan limit re-check
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
  -- Fetch the pending invite
  SELECT * INTO v_invite
    FROM dtn_memberships
    WHERE id = p_membership_id
      AND user_id IS NULL;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invite not found or already accepted.';
  END IF;

  -- Case-insensitive email match
  IF LOWER(v_invite.invited_email) != LOWER(p_user_email) THEN
    RAISE EXCEPTION 'This invite was sent to a different email address.';
  END IF;

  -- Lock the org row for limit re-check
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
    -- Count only active members (not pending invites) for acceptance check
    SELECT COUNT(*) INTO v_current_count
      FROM dtn_memberships
      WHERE org_id = v_invite.org_id
        AND is_active = true;

    IF v_current_count >= v_member_limit THEN
      RAISE EXCEPTION 'Organization has reached its member limit. Ask an admin to upgrade the plan.';
    END IF;
  END IF;

  -- Accept the invite
  UPDATE dtn_memberships
    SET user_id = p_user_id,
        accepted_at = now(),
        is_active = true
    WHERE id = p_membership_id
    RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
