-- Phase 2: Contact CSV Import + HubSpot Sync Prep
-- Creates dtn_contact_imports table and adds email dedup index to mktg_contacts

-- 1. Resolve any existing duplicate (org_id, email) pairs before creating unique index
-- This DO UPDATE keeps the most recently updated row and soft-deletes the rest.
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

-- 2. Unique index for email-based dedup (required for CSV import upsert)
CREATE UNIQUE INDEX idx_contacts_org_email
  ON mktg_contacts (org_id, email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- 3. Contact imports tracking table
CREATE TABLE dtn_contact_imports (
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

-- 4. Indexes
CREATE INDEX idx_contact_imports_org ON dtn_contact_imports (org_id, created_at DESC);
CREATE INDEX idx_contact_imports_status ON dtn_contact_imports (org_id, status)
  WHERE status IN ('pending', 'processing');

-- 5. Updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON dtn_contact_imports
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

-- 6. RLS
ALTER TABLE dtn_contact_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on contact_imports"
  ON dtn_contact_imports FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Members can read own org imports"
  ON dtn_contact_imports FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

CREATE POLICY "Members can insert own org imports"
  ON dtn_contact_imports FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

-- Members can update status to 'cancelled' only
CREATE POLICY "Members can cancel own org imports"
  ON dtn_contact_imports FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );
