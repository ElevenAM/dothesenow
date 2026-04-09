-- Phase 1: Document Upload & Management
-- Creates dtn_documents table and org-documents storage bucket

-- 1. Documents table
CREATE TABLE dtn_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,        -- MIME type
  file_size BIGINT NOT NULL,      -- bytes
  storage_path TEXT NOT NULL,     -- path in the storage bucket
  tags TEXT[] DEFAULT '{}',
  uploaded_by UUID REFERENCES auth.users(id),
  -- Polymorphic links (nullable)
  contact_id UUID REFERENCES mktg_contacts(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES mktg_campaigns(id) ON DELETE SET NULL,
  strategy_doc_id UUID REFERENCES mktg_strategy_docs(id) ON DELETE SET NULL,
  experiment_id UUID REFERENCES dtn_experiments(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX idx_documents_org_created ON dtn_documents (org_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_contact ON dtn_documents (contact_id)
  WHERE contact_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_documents_campaign ON dtn_documents (campaign_id)
  WHERE campaign_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_documents_strategy ON dtn_documents (strategy_doc_id)
  WHERE strategy_doc_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_documents_experiment ON dtn_documents (experiment_id)
  WHERE experiment_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_documents_tags ON dtn_documents USING GIN (tags)
  WHERE deleted_at IS NULL;

-- 3. Updated_at trigger (reuses existing mktg_update_timestamp function)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON dtn_documents
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

-- 4. RLS
ALTER TABLE dtn_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on documents"
  ON dtn_documents FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Members can read own org documents"
  ON dtn_documents FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
    AND deleted_at IS NULL
  );

CREATE POLICY "Members can insert own org documents"
  ON dtn_documents FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

CREATE POLICY "Members can update own org documents"
  ON dtn_documents FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

-- 5. Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('org-documents', 'org-documents', false, 52428800) -- 50MB
ON CONFLICT (id) DO NOTHING;

-- 6. Storage RLS policies (tenant isolation via path prefix: {org_id}/...)
CREATE POLICY "Org members can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'org-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  );

CREATE POLICY "Org members can read own documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'org-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  );

CREATE POLICY "Org members can delete own documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'org-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  );

CREATE POLICY "Service role full access on org-documents storage"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'org-documents'
    AND auth.role() = 'service_role'
  );
