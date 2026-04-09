import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgContext } from "./context.js";
import type {
  ExternalMetric,
  CreateExternalMetricInput,
  MetricTrendPoint,
  MetricsSummary,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const TABLE = "dtn_external_metrics";

// ─── Write queries (admin client) ───────────────────────────

/**
 * Bulk upsert metrics using ON CONFLICT on the dedup constraint.
 * The DB trigger normalizes dimensions JSONB key order automatically.
 */
export async function ingestMetrics(
  adminClient: SupabaseClient,
  orgId: string,
  metrics: CreateExternalMetricInput[],
): Promise<{ inserted: number; updated: number }> {
  if (metrics.length === 0) return { inserted: 0, updated: 0 };

  const rows = metrics.map((m) => ({
    org_id: orgId,
    source: m.source,
    metric_type: m.metric_type ?? null,
    metric_name: m.metric_name,
    metric_value: m.metric_value,
    dimensions: m.dimensions ?? {},
    period_start: m.period_start,
    period_end: m.period_end,
    raw_data: m.raw_data ?? null,
    experiment_id: m.experiment_id ?? null,
  }));

  // Supabase upsert with onConflict matching the UNIQUE constraint
  const { data, error } = await adminClient
    .from(TABLE)
    .upsert(rows, {
      onConflict: "org_id,source,metric_name,period_start,period_end,dimensions",
    })
    .select("id");

  if (error) {
    throw new QueryError(error.message, TABLE, "ingestMetrics", orgId, error);
  }

  // Supabase upsert doesn't distinguish inserts from updates in response,
  // so we return total count as "inserted" (semantically "upserted")
  return { inserted: data?.length ?? 0, updated: 0 };
}

// ─── Read queries ───────────────────────────────────────────

export async function getMetricsSummary(
  ctx: OrgContext,
  opts?: {
    source?: string;
    periodStart?: string;
    periodEnd?: string;
  },
): Promise<MetricsSummary[]> {
  // Use a raw query to aggregate since Supabase JS doesn't support GROUP BY directly.
  // Fall back to fetching and aggregating in application code.
  let query = ctx.client
    .from(TABLE)
    .select("source, metric_name, metric_value, period_start")
    .eq("org_id", ctx.orgId)
    .order("period_start", { ascending: false });

  if (opts?.source) query = query.eq("source", opts.source);
  if (opts?.periodStart) query = query.gte("period_start", opts.periodStart);
  if (opts?.periodEnd) query = query.lte("period_end", opts.periodEnd);

  const { data, error } = await query.limit(1000);

  if (error) {
    throw new QueryError(error.message, TABLE, "getMetricsSummary", ctx.orgId, error);
  }

  // Aggregate in application code
  const map = new Map<string, MetricsSummary>();
  for (const row of data ?? []) {
    const key = `${row.source}::${row.metric_name}`;
    const existing = map.get(key);
    if (existing) {
      existing.total_value += Number(row.metric_value);
      existing.count++;
      if (row.period_start > existing.latest_period_start) {
        existing.latest_period_start = row.period_start;
      }
    } else {
      map.set(key, {
        source: row.source,
        metric_name: row.metric_name,
        total_value: Number(row.metric_value),
        count: 1,
        latest_period_start: row.period_start,
      });
    }
  }

  return Array.from(map.values());
}

export async function getMetricsForExperiment(
  ctx: OrgContext,
  experimentId: string,
): Promise<ExternalMetric[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("experiment_id", experimentId)
    .order("period_start", { ascending: false });

  if (error) {
    throw new QueryError(error.message, TABLE, "getMetricsForExperiment", ctx.orgId, error);
  }

  return (data ?? []) as ExternalMetric[];
}

export async function getMetricsTrend(
  ctx: OrgContext,
  metricName: string,
  source: string,
  periodStart: string,
  periodEnd: string,
): Promise<MetricTrendPoint[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("period_start, period_end, metric_value")
    .eq("org_id", ctx.orgId)
    .eq("metric_name", metricName)
    .eq("source", source)
    .gte("period_start", periodStart)
    .lte("period_end", periodEnd)
    .order("period_start", { ascending: true });

  if (error) {
    throw new QueryError(error.message, TABLE, "getMetricsTrend", ctx.orgId, error);
  }

  return (data ?? []) as MetricTrendPoint[];
}

/**
 * Get metrics for a given week range (used by weekly retrospective).
 */
export async function getMetricsForWeek(
  ctx: OrgContext,
  weekStart: string,
  weekEnd: string,
): Promise<ExternalMetric[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .gte("period_start", weekStart)
    .lte("period_end", weekEnd)
    .order("source", { ascending: true });

  if (error) {
    throw new QueryError(error.message, TABLE, "getMetricsForWeek", ctx.orgId, error);
  }

  return (data ?? []) as ExternalMetric[];
}
