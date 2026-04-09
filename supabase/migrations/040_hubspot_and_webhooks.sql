-- 040: Non-critical infra — HubSpot sync + external metrics + webhooks
-- These tables support integrations not yet blocking any page loads.

-- ═══════════════════════════════════════════════════════════════════
-- 1. HubSpot field mappings (from skipped 035)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dtn_hubspot_field_mappings (
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

CREATE INDEX IF NOT EXISTS idx_hubspot_mappings_org ON dtn_hubspot_field_mappings (org_id);

DROP TRIGGER IF EXISTS set_updated_at ON dtn_hubspot_field_mappings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON dtn_hubspot_field_mappings
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

ALTER TABLE dtn_hubspot_field_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on hubspot_field_mappings" ON dtn_hubspot_field_mappings;
CREATE POLICY "Service role full access on hubspot_field_mappings"
  ON dtn_hubspot_field_mappings FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Members can read own org field mappings" ON dtn_hubspot_field_mappings;
CREATE POLICY "Members can read own org field mappings"
  ON dtn_hubspot_field_mappings FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );


-- ═══════════════════════════════════════════════════════════════════
-- 2. Sync log (from skipped 035)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dtn_sync_log (
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

CREATE INDEX IF NOT EXISTS idx_sync_log_org_type ON dtn_sync_log (org_id, integration_type, created_at DESC);

ALTER TABLE dtn_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on sync_log" ON dtn_sync_log;
CREATE POLICY "Service role full access on sync_log"
  ON dtn_sync_log FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Members can read own org sync logs" ON dtn_sync_log;
CREATE POLICY "Members can read own org sync logs"
  ON dtn_sync_log FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );


-- ═══════════════════════════════════════════════════════════════════
-- 3. HubSpot events dedup (from skipped 036)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dtn_hubspot_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  object_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_hubspot_events_org ON dtn_hubspot_events (org_id, created_at DESC);

ALTER TABLE dtn_hubspot_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on hubspot_events" ON dtn_hubspot_events;
CREATE POLICY "Service role full access on hubspot_events"
  ON dtn_hubspot_events FOR ALL
  USING (auth.role() = 'service_role');


-- ═══════════════════════════════════════════════════════════════════
-- 4. External metrics (from skipped 037)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION normalize_dimensions_jsonb()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.dimensions IS NOT NULL AND NEW.dimensions != '{}'::jsonb THEN
    NEW.dimensions := NEW.dimensions::text::jsonb;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS dtn_external_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  metric_type TEXT,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '{}',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_data JSONB,
  experiment_id UUID REFERENCES dtn_experiments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_normalize_dimensions ON dtn_external_metrics;
CREATE TRIGGER trg_normalize_dimensions
  BEFORE INSERT OR UPDATE ON dtn_external_metrics
  FOR EACH ROW EXECUTE FUNCTION normalize_dimensions_jsonb();

DO $$ BEGIN
  ALTER TABLE dtn_external_metrics
    ADD CONSTRAINT uq_external_metrics_dedup
    UNIQUE (org_id, source, metric_name, period_start, period_end, dimensions);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_external_metrics_org_source ON dtn_external_metrics (org_id, source, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_external_metrics_experiment ON dtn_external_metrics (experiment_id)
  WHERE experiment_id IS NOT NULL;

ALTER TABLE dtn_external_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on external_metrics" ON dtn_external_metrics;
CREATE POLICY "Service role full access on external_metrics"
  ON dtn_external_metrics FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Members can read own org metrics" ON dtn_external_metrics;
CREATE POLICY "Members can read own org metrics"
  ON dtn_external_metrics FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

DROP POLICY IF EXISTS "Members can insert own org metrics" ON dtn_external_metrics;
CREATE POLICY "Members can insert own org metrics"
  ON dtn_external_metrics FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );


-- ═══════════════════════════════════════════════════════════════════
-- 5. Webhook subscriptions (from skipped 038)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dtn_webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  target_url TEXT NOT NULL,
  vault_secret_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_dispatch ON dtn_webhook_subscriptions (org_id, event_type, is_active)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS set_updated_at ON dtn_webhook_subscriptions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON dtn_webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

ALTER TABLE dtn_webhook_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on webhook_subscriptions" ON dtn_webhook_subscriptions;
CREATE POLICY "Service role full access on webhook_subscriptions"
  ON dtn_webhook_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Members can read own org webhook subscriptions" ON dtn_webhook_subscriptions;
CREATE POLICY "Members can read own org webhook subscriptions"
  ON dtn_webhook_subscriptions FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

DROP POLICY IF EXISTS "Members can manage own org webhook subscriptions" ON dtn_webhook_subscriptions;
CREATE POLICY "Members can manage own org webhook subscriptions"
  ON dtn_webhook_subscriptions FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

DROP POLICY IF EXISTS "Members can update own org webhook subscriptions" ON dtn_webhook_subscriptions;
CREATE POLICY "Members can update own org webhook subscriptions"
  ON dtn_webhook_subscriptions FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );
