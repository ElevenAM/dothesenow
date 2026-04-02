-- Migration 004: Profiles table + invite_team_member function
-- Phase 2: Team & Permissions

-- ============================================================
-- 1. Profiles table (resolves user emails without admin API)
-- ============================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_profiles_email ON profiles(email);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read profiles within their orgs"
  ON profiles FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      id = auth.uid()
      OR id IN (
        SELECT m2.user_id FROM dtn_memberships m1
        JOIN dtn_memberships m2 ON m1.org_id = m2.org_id
        WHERE m1.user_id = auth.uid() AND m1.is_active = true AND m2.is_active = true
      )
    )
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role full access"
  ON profiles FOR ALL
  USING (auth.role() = 'service_role');

-- updated_at trigger
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

-- ============================================================
-- 2. Auth trigger: auto-populate profile on signup
-- ============================================================

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 3. Backfill existing users
-- ============================================================

INSERT INTO profiles (id, email, display_name)
SELECT id, email, COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. invite_team_member() — atomic limit check + insert
--    Serialized via FOR UPDATE to prevent concurrent invites
--    exceeding the plan member limit.
-- ============================================================

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
  -- Lock the org row to serialize concurrent invites
  SELECT plan INTO v_plan
  FROM dtn_organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Verify the caller is an active owner or admin of this org
  IF NOT EXISTS (
    SELECT 1 FROM dtn_memberships
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND is_active = true
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to invite members to this organization';
  END IF;

  -- Plan member limits (free=2, premium=unlimited)
  IF v_plan = 'free' THEN
    v_limit := 2;
  ELSIF v_plan = 'premium' THEN
    v_limit := -1;
  ELSE
    RAISE EXCEPTION 'Unknown plan: %', v_plan;
  END IF;

  -- Count only accepted members (not pending invites)
  SELECT COUNT(*) INTO v_count
  FROM dtn_memberships
  WHERE org_id = p_org_id AND is_active = true AND user_id IS NOT NULL;

  IF v_limit != -1 AND v_count >= v_limit THEN
    RAISE EXCEPTION 'Member limit reached for % plan. Upgrade to add more members.', v_plan;
  END IF;

  -- Check for existing active member or pending invite with this email
  IF EXISTS (
    SELECT 1 FROM dtn_memberships
    WHERE org_id = p_org_id
      AND invited_email = p_invited_email
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'This email has already been invited or is a member';
  END IF;

  -- Also check if user with this email is already an active member
  IF EXISTS (
    SELECT 1 FROM dtn_memberships m
    JOIN profiles p ON p.id = m.user_id
    WHERE m.org_id = p_org_id
      AND p.email = p_invited_email
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'This email is already a member of this organization';
  END IF;

  -- Insert pending membership
  v_id := uuid_generate_v4();
  INSERT INTO dtn_memberships (id, org_id, user_id, role, invited_by, invited_email, invited_at, accepted_at, is_active)
  VALUES (v_id, p_org_id, NULL, p_role, p_invited_by, p_invited_email, now(), NULL, true);

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
