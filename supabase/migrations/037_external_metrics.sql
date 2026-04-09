-- Phase 4: External Metrics Ingestion
-- Creates dtn_external_metrics table with JSONB normalization trigger

-- 1. JSONB key normalization function (ensures canonical key ordering for UNIQUE constraint)
CREATE OR REPLACE FUNCTION normalize_dimensions_jsonb()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.dimensions IS NOT NULL AND NEW.dimensions != '{}'::jsonb THEN
    NEW.dimensions := NEW.dimensions::text::jsonb;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. External metrics table
CREATE TABLE dtn_external_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL,             -- 'google_analytics', 'manual', 'api', 'seo_tool'
  metric_type TEXT,                 -- 'traffic', 'conversion', 'engagement', 'revenue'
  metric_name TEXT NOT NULL,        -- 'sessions', 'page_views', 'conversions', 'bounce_rate'
  metric_value NUMERIC NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '{}',  -- e.g. {"channel":"organic","country":"US"}
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_data JSONB,                   -- Full raw response for debugging
  experiment_id UUID REFERENCES dtn_experiments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. JSONB normalization trigger (runs before insert/update, guarantees canonical key order)
CREATE TRIGGER trg_normalize_dimensions
  BEFORE INSERT OR UPDATE ON dtn_external_metrics
  FOR EACH ROW EXECUTE FUNCTION normalize_dimensions_jsonb();

-- 4. Unique constraint for idempotent upsert
ALTER TABLE dtn_external_metrics
  ADD CONSTRAINT uq_external_metrics_dedup
  UNIQUE (org_id, source, metric_name, period_start, period_end, dimensions);

-- 5. Indexes
CREATE INDEX idx_external_metrics_org_source ON dtn_external_metrics (org_id, source, period_start DESC);
CREATE INDEX idx_external_metrics_experiment ON dtn_external_metrics (experiment_id)
  WHERE experiment_id IS NOT NULL;

-- 6. RLS
ALTER TABLE dtn_external_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on external_metrics"
  ON dtn_external_metrics FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Members can read own org metrics"
  ON dtn_external_metrics FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );

-- Members can insert manual metrics
CREATE POLICY "Members can insert own org metrics"
  ON dtn_external_metrics FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND org_id IN (SELECT get_user_org_ids())
  );
