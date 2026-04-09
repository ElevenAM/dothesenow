-- Phase 3: HubSpot CRM Integration — Event Dedup
-- Prevents processing the same HubSpot webhook event twice

CREATE TABLE dtn_hubspot_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  object_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, event_id)
);

CREATE INDEX idx_hubspot_events_org ON dtn_hubspot_events (org_id, created_at DESC);

ALTER TABLE dtn_hubspot_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on hubspot_events"
  ON dtn_hubspot_events FOR ALL
  USING (auth.role() = 'service_role');
