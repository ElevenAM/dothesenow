-- 039: Critical Fixes
-- 1. Add FK from dtn_memberships.user_id → profiles(id) for PostgREST joins
-- 2. Create dtn_contact_imports table (skipped due to duplicate 033 prefix)
-- 3. Add external CRM columns to mktg_contacts (from skipped 034)
-- 4. Create approval stats RPC (replaces 3 sequential count queries)

-- ═══════════════════════════════════════════════════════════════════
-- 1. Memberships → profiles FK (fixes Tasks page crash)
-- ═══════════════════════════════════════════════════════════════════
-- The existing dtn_memberships_user_id_fkey targets auth.users(id).
-- PostgREST needs a direct FK to profiles(id) for the join hint.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dtn_memberships_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE dtn_memberships
      ADD CONSTRAINT dtn_memberships_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id);
  END IF;
END $$;

-- Guard: tasks profile FKs (already applied via 033_fix_tasks_profile_fkeys, but guard anyway)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dtn_daily_tasks_assigned_to_profiles_fkey'
  ) THEN
    ALTER TABLE dtn_daily_tasks
      ADD CONSTRAINT dtn_daily_tasks_assigned_to_profiles_fkey
      FOREIGN KEY (assigned_to) REFERENCES profiles(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dtn_daily_tasks_created_by_profiles_fkey'
  ) THEN
    ALTER TABLE dtn_daily_tasks
      ADD CONSTRAINT dtn_daily_tasks_created_by_profiles_fkey
      FOREIGN KEY (created_by) REFERENCES profiles(id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- 2. Contact imports table (from skipped 033_contact_imports.sql)
-- ═══════════════════════════════════════════════════════════════════

-- 2a. Resolve any existing duplicate (org_id, email) pairs before creating unique index
WITH dupes AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY org_id, email
           ORDER BY updated_at DESC, created_at DESC
         ) AS rn
  FROM mktg_contacts
  WHERE email IS NOT NULL AND deleted_at IS NULL
)
UPDATE mktg_contacts
SET deleted_at = now()
WHERE id IN (SELECT id FROM dupes WHERE rn > 1);

-- 2b. Unique index for email-based dedup (required for CSV import upsert)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_org_email
  ON mktg_contacts (org_id, email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- 2c. Contact imports tracking table
CREATE TABLE IF NOT EXISTS dtn_contact_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial', 'cancelled')),
  total_rows INT,
  max_rows INT NOT NULL DEFAULT 10000,
  imported_rows INT NOT NULL DEFAULT 0,
  skipped_rows INT NOT NULL DEFAULT 0,
  error_rows INT NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]',
  column_mapping JSONB,
  storage_path TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_imports_org ON dtn_contact_imports (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_imports_status ON dtn_contact_imports (org_id, status)
  WHERE status IN ('pending', 'processing');

-- Updated_at trigger (safe: DROP IF EXISTS first)
DROP TRIGGER IF EXISTS set_updated_at ON dtn_contact_imports;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON dtn_contact_imports
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

ALTER TABLE dtn_contact_imports ENABLE ROW LEVEL SECURITY;

-- RLS policies (DROP IF EXISTS before create)
DROP POLICY IF EXISTS "Service role full access on contact_imports" ON dtn_contact_imports;
CREATE POLICY "Service role full access on contact_imports"
  ON dtn_contact_imports FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Members can read own org imports" ON dtn_contact_imports;
CREATE POLICY "Members can read own org imports"
  ON dtn_contact_imports FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

DROP POLICY IF EXISTS "Members can insert own org imports" ON dtn_contact_imports;
CREATE POLICY "Members can insert own org imports"
  ON dtn_contact_imports FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

DROP POLICY IF EXISTS "Members can cancel own org imports" ON dtn_contact_imports;
CREATE POLICY "Members can cancel own org imports"
  ON dtn_contact_imports FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );


-- ═══════════════════════════════════════════════════════════════════
-- 3. Contact external IDs (from skipped 034_contact_external_ids.sql)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TABLE mktg_contacts ADD COLUMN external_ids JSONB NOT NULL DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE mktg_contacts ADD COLUMN external_updated_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE mktg_contacts ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'local';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add CHECK constraint if not present
DO $$ BEGIN
  ALTER TABLE mktg_contacts ADD CONSTRAINT mktg_contacts_sync_status_check
    CHECK (sync_status IN ('local', 'synced', 'conflict', 'pending_push', 'pending_pull'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Functional index for HubSpot contact lookup
CREATE INDEX IF NOT EXISTS idx_contacts_hubspot_id
  ON mktg_contacts (org_id, (external_ids->>'hubspot_id'))
  WHERE external_ids->>'hubspot_id' IS NOT NULL;

-- Index for finding contacts that need sync
CREATE INDEX IF NOT EXISTS idx_contacts_sync_status
  ON mktg_contacts (org_id, sync_status)
  WHERE sync_status != 'local' AND deleted_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════
-- 4. Approval stats RPC (replaces 3 sequential count queries)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_approval_stats(
  p_org_id UUID,
  p_department_id UUID DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT (now() - interval '7 days')
)
RETURNS TABLE(pending BIGINT, approved_7d BIGINT, rejected_7d BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE status = 'approved' AND reviewed_at >= p_since) AS approved_7d,
    COUNT(*) FILTER (WHERE status = 'rejected' AND reviewed_at >= p_since) AS rejected_7d
  FROM dtn_approval_queue
  WHERE org_id = p_org_id
    AND (p_department_id IS NULL OR department_id = p_department_id);
$$;
