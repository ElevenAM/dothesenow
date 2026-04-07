-- Phase 4B: Expand from 2-tier (free/premium) to 5-tier pricing + add credit columns
-- ORDERING IS CRITICAL: DROP constraint → UPDATE rows → ADD new constraint

BEGIN;

-- 1. Drop old plan CHECK constraint
ALTER TABLE dtn_organizations DROP CONSTRAINT IF EXISTS dtn_organizations_plan_check;

-- 2. Grandfather existing premium users → starter
UPDATE dtn_organizations SET plan = 'starter' WHERE plan = 'premium';
UPDATE dtn_subscriptions SET plan = 'starter' WHERE plan = 'premium';

-- 3. Add new 5-tier CHECK constraint
ALTER TABLE dtn_organizations ADD CONSTRAINT dtn_organizations_plan_check
  CHECK (plan IN ('free', 'starter', 'growth', 'team', 'enterprise'));

-- 4. Add credit tracking columns
ALTER TABLE dtn_organizations
  ADD COLUMN ai_credits_remaining INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN ai_credits_reset_at TIMESTAMPTZ;

-- 5. Set initial credits based on current plan
UPDATE dtn_organizations SET ai_credits_remaining = CASE plan
  WHEN 'starter' THEN 50
  WHEN 'growth' THEN 200
  WHEN 'team' THEN 500
  WHEN 'enterprise' THEN -1
  ELSE 0
END;

-- 6. Update invite_team_member() to use PLAN_LIMITS instead of hardcoded plan names.
--    Uses a lookup approach so new tiers don't require RPC changes.
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

  -- Plan-based member limits
  v_limit := CASE v_plan
    WHEN 'free' THEN 2
    WHEN 'starter' THEN 5
    WHEN 'growth' THEN 10
    ELSE -1  -- team, enterprise = unlimited
  END;

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

COMMIT;
