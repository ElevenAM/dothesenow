-- Phase 3: HubSpot CRM Integration — Sync Infrastructure
-- Creates dtn_hubspot_field_mappings and dtn_sync_log tables

-- 1. HubSpot field mappings (per-org customizable field mapping)
CREATE TABLE dtn_hubspot_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  hubspot_property TEXT NOT NULL,
  dtn_field TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'bidirectional'
    CHECK (direction IN ('hubspot_to_dtn', 'dtn_to_hubspot', 'bidirectional')),
  transform_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, hubspot_property)
);

CREATE INDEX idx_hubspot_mappings_org ON dtn_hubspot_field_mappings (org_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON dtn_hubspot_field_mappings
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

ALTER TABLE dtn_hubspot_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on hubspot_field_mappings"
  ON dtn_hubspot_field_mappings FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Members can read own org field mappings"
  ON dtn_hubspot_field_mappings FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

-- 2. Generic sync log (reusable for HubSpot, GA, future integrations)
CREATE TABLE dtn_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('initial', 'incremental')),
  direction TEXT NOT NULL DEFAULT 'bidirectional',
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  records_processed INT NOT NULL DEFAULT 0,
  records_created INT NOT NULL DEFAULT 0,
  records_updated INT NOT NULL DEFAULT 0,
  records_failed INT NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_log_org_type ON dtn_sync_log (org_id, integration_type, created_at DESC);

ALTER TABLE dtn_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on sync_log"
  ON dtn_sync_log FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Members can read own org sync logs"
  ON dtn_sync_log FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );
