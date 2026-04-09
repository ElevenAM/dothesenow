-- Phase 2: HubSpot Sync Prep
-- Adds external IDs and sync status columns to mktg_contacts

-- 1. New columns for external CRM integration
ALTER TABLE mktg_contacts ADD COLUMN external_ids JSONB NOT NULL DEFAULT '{}';
ALTER TABLE mktg_contacts ADD COLUMN external_updated_at TIMESTAMPTZ;
ALTER TABLE mktg_contacts ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'local'
  CHECK (sync_status IN ('local', 'synced', 'conflict', 'pending_push', 'pending_pull'));

-- 2. Functional index for HubSpot contact lookup
CREATE INDEX idx_contacts_hubspot_id
  ON mktg_contacts (org_id, (external_ids->>'hubspot_id'))
  WHERE external_ids->>'hubspot_id' IS NOT NULL;

-- 3. Index for finding contacts that need sync
CREATE INDEX idx_contacts_sync_status
  ON mktg_contacts (org_id, sync_status)
  WHERE sync_status != 'local' AND deleted_at IS NULL;
