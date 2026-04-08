-- Phase 9A: Results Dashboard — Experiments, results, and channel performance
-- Creates dtn_experiments + dtn_experiment_results tables with RLS.
-- Adds experiment_uuid FK to dtn_daily_tasks.
-- Adds generated_by + UNIQUE constraint to mktg_weekly_reviews.
-- Creates get_channel_performance RPC with auth check.

BEGIN;

-- =============================================================================
-- 1. NEW TABLE: dtn_experiments
-- =============================================================================

CREATE TABLE dtn_experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  strategy_doc_id UUID REFERENCES mktg_strategy_docs(id),
  title TEXT NOT NULL,
  hypothesis TEXT,
  description TEXT,
  backlog_ref TEXT,                -- legacy positional ID e.g. "ExperimentBacklog.3"
  strategy_section_ref TEXT,      -- e.g. "Channels.ContentSEO"
  status TEXT NOT NULL DEFAULT 'backlog'
    CHECK (status IN ('backlog', 'running', 'completed', 'won', 'lost')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  success_metric TEXT,            -- e.g. "organic traffic > 500/week"
  success_target NUMERIC,
  baseline_value NUMERIC,
  planned_duration_days INTEGER,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_dtn_experiments_org_status
  ON dtn_experiments(org_id, status);

CREATE INDEX idx_dtn_experiments_org_section
  ON dtn_experiments(org_id, strategy_section_ref)
  WHERE strategy_section_ref IS NOT NULL;

CREATE INDEX idx_dtn_experiments_org_backlog_ref
  ON dtn_experiments(org_id, backlog_ref)
  WHERE backlog_ref IS NOT NULL;

-- updated_at trigger (reuse existing function)
CREATE TRIGGER update_dtn_experiments_timestamp
  BEFORE UPDATE ON dtn_experiments
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

-- =============================================================================
-- 2. NEW TABLE: dtn_experiment_results
-- =============================================================================

CREATE TABLE dtn_experiment_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  experiment_id UUID NOT NULL REFERENCES dtn_experiments(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  week_start DATE,
  metrics JSONB NOT NULL DEFAULT '{}',
  metric_value NUMERIC,           -- primary success metric value
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_dtn_experiment_results_exp_time
  ON dtn_experiment_results(experiment_id, recorded_at DESC);

CREATE INDEX idx_dtn_experiment_results_org_week
  ON dtn_experiment_results(org_id, week_start)
  WHERE week_start IS NOT NULL;

-- =============================================================================
-- 3. ALTER dtn_daily_tasks: add experiment_uuid FK
-- =============================================================================

ALTER TABLE dtn_daily_tasks
  ADD COLUMN experiment_uuid UUID REFERENCES dtn_experiments(id);

CREATE INDEX idx_daily_tasks_experiment_uuid
  ON dtn_daily_tasks(experiment_uuid)
  WHERE experiment_uuid IS NOT NULL;

-- =============================================================================
-- 4. ALTER mktg_weekly_reviews: add generated_by + UNIQUE constraint
-- =============================================================================

ALTER TABLE mktg_weekly_reviews
  ADD COLUMN generated_by TEXT CHECK (generated_by IN ('user', 'claude', 'system'));

-- Idempotency: prevent duplicate retrospectives for the same org + week
ALTER TABLE mktg_weekly_reviews
  ADD CONSTRAINT uq_weekly_reviews_org_week UNIQUE (org_id, week_start);

-- =============================================================================
-- 5. RLS: dtn_experiments
-- =============================================================================

ALTER TABLE dtn_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON dtn_experiments
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Members select own org experiments" ON dtn_experiments
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY "Members insert own org experiments" ON dtn_experiments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY "Members update own org experiments" ON dtn_experiments
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

-- =============================================================================
-- 6. RLS: dtn_experiment_results
-- =============================================================================

ALTER TABLE dtn_experiment_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON dtn_experiment_results
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Members select own org experiment results" ON dtn_experiment_results
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY "Members insert own org experiment results" ON dtn_experiment_results
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

-- =============================================================================
-- 7. RPC: get_channel_performance
-- =============================================================================
-- Aggregates dtn_daily_tasks by strategy_section_ref for a date range.
-- Includes authorization check: caller must be a member of the target org.
-- Note: duration_minutes is an estimated planning field, not actual execution
-- time, so it is intentionally excluded from this aggregation.

CREATE OR REPLACE FUNCTION public.get_channel_performance(
  p_org_id UUID,
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  strategy_section_ref TEXT,
  total_tasks BIGINT,
  completed BIGINT,
  failed BIGINT,
  skipped BIGINT,
  completion_rate NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Authorization: caller must be a member of the target org
  IF NOT EXISTS (
    SELECT 1 FROM public.dtn_memberships
    WHERE user_id = auth.uid() AND org_id = p_org_id AND is_active = true
  ) AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Access denied: not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    t.strategy_section_ref,
    COUNT(*)::BIGINT AS total_tasks,
    COUNT(*) FILTER (WHERE t.status = 'completed')::BIGINT AS completed,
    COUNT(*) FILTER (WHERE t.status = 'failed')::BIGINT AS failed,
    COUNT(*) FILTER (WHERE t.status = 'skipped')::BIGINT AS skipped,
    ROUND(
      COUNT(*) FILTER (WHERE t.status = 'completed')::NUMERIC
      / NULLIF(COUNT(*), 0) * 100, 1
    ) AS completion_rate
  FROM public.dtn_daily_tasks t
  WHERE t.org_id = p_org_id
    AND t.strategy_section_ref IS NOT NULL
    AND t.deleted_at IS NULL
    AND t.scheduled_date BETWEEN p_date_from AND p_date_to
  GROUP BY t.strategy_section_ref
  ORDER BY total_tasks DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_channel_performance(UUID, DATE, DATE)
  TO authenticated, service_role;

-- =============================================================================
-- 8. Realtime: enable for dtn_experiments
-- =============================================================================

ALTER TABLE dtn_experiments REPLICA IDENTITY FULL;

COMMIT;
