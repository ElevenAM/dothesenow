-- Fix SECURITY DEFINER views flagged by Supabase security advisor.
-- Recreate with security_invoker = true so they respect the querying user's RLS policies.

DROP VIEW IF EXISTS public.dtn_daily_tasks_summary;
CREATE VIEW public.dtn_daily_tasks_summary
WITH (security_invoker = true)
AS
 SELECT org_id,
    scheduled_date,
    executor_type,
    count(*) AS total,
    count(*) FILTER (WHERE status = 'completed'::text) AS completed,
    count(*) FILTER (WHERE status = 'pending'::text) AS pending,
    count(*) FILTER (WHERE status = 'in_progress'::text) AS in_progress,
    count(*) FILTER (WHERE status = 'failed'::text) AS failed
   FROM dtn_daily_tasks
  WHERE deleted_at IS NULL
  GROUP BY org_id, scheduled_date, executor_type
  ORDER BY scheduled_date DESC;

DROP VIEW IF EXISTS public.mktg_pipeline_summary;
CREATE VIEW public.mktg_pipeline_summary
WITH (security_invoker = true)
AS
 SELECT org_id,
    lifecycle_stage,
    contact_type,
    count(*) AS count,
    count(*) FILTER (WHERE last_engaged > (now() - '7 days'::interval)) AS engaged_last_7d,
    count(*) FILTER (WHERE last_engaged > (now() - '30 days'::interval)) AS engaged_last_30d,
    avg(lead_score) AS avg_lead_score
   FROM mktg_contacts
  WHERE status = 'active'::text AND deleted_at IS NULL
  GROUP BY org_id, lifecycle_stage, contact_type
  ORDER BY org_id, lifecycle_stage, contact_type;
