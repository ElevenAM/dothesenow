import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActiveOrgs,
  getMetricsForWeek,
  ingestMetrics,
} from "@dothesenow/queries";
import { filterOrgsByLocalHour, localDateString } from "../utils";
import type { ExternalMetric, CreateExternalMetricInput } from "@dothesenow/types";

/**
 * Sunday cron: aggregate the past week's external metrics per org.
 * Computes totals by (source, metric_name) and stores as weekly_aggregate rows.
 * These feed into the weekly retrospective and strategy refinement pipelines.
 */
export const metricsWeeklyAggregatorCron = inngest.createFunction(
  {
    id: "metrics-weekly-aggregator-cron",
    triggers: [{ cron: "0 * * * 0" }], // Every hour on Sundays
    retries: 1,
  },
  async ({ step }) => {
    const supabase = createAdminClient();

    const orgs = await step.run("find-orgs-at-6pm", async () => {
      const allOrgs = await getActiveOrgs(supabase);
      return filterOrgsByLocalHour(allOrgs, 18); // 6pm local
    });

    if (orgs.length === 0) return { sent: 0 };

    await step.sendEvent(
      "fan-out-weekly-aggregate",
      orgs.map((org) => ({
        name: "metrics/weekly-aggregate" as const,
        data: { org_id: org.id },
      })),
    );

    return { sent: orgs.length };
  },
);

export const metricsWeeklyAggregatorHandler = inngest.createFunction(
  {
    id: "metrics-weekly-aggregator-handler",
    triggers: [{ event: "metrics/weekly-aggregate" }],
    concurrency: [{ limit: 5 }],
    retries: 1,
  },
  async ({ event, step }) => {
    const { org_id } = event.data;
    const supabase = createAdminClient();

    const result = await step.run("aggregate-and-store", async () => {
      const ctx = { client: supabase, orgId: org_id };

      // Compute week range (Monday to Sunday)
      const { data: orgRow } = await supabase
        .from("dtn_organizations")
        .select("timezone")
        .eq("id", org_id)
        .single();

      const tz = orgRow?.timezone ?? "America/New_York";
      const todayStr = localDateString(tz);
      const today = new Date(todayStr + "T12:00:00Z");
      const dayOfWeek = today.getUTCDay();
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() - ((dayOfWeek + 6) % 7));
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);

      const weekStart = monday.toISOString().split("T")[0];
      const weekEnd = sunday.toISOString().split("T")[0];

      // Fetch all metrics for the week
      const metrics = await getMetricsForWeek(ctx, weekStart, weekEnd);

      if (metrics.length === 0) return { aggregated: 0 };

      // Aggregate by (source, metric_name)
      const aggregates = new Map<string, { source: string; metric_name: string; total: number; count: number }>();

      for (const m of metrics) {
        // Skip existing weekly_aggregate rows
        if (m.source === "weekly_aggregate") continue;

        const key = `${m.source}::${m.metric_name}`;
        const existing = aggregates.get(key);
        if (existing) {
          existing.total += Number(m.metric_value);
          existing.count++;
        } else {
          aggregates.set(key, {
            source: m.source,
            metric_name: m.metric_name,
            total: Number(m.metric_value),
            count: 1,
          });
        }
      }

      // Store as weekly_aggregate metrics
      const aggregateMetrics: CreateExternalMetricInput[] = [];
      for (const agg of aggregates.values()) {
        aggregateMetrics.push({
          source: "weekly_aggregate",
          metric_type: "summary",
          metric_name: `${agg.source}:${agg.metric_name}:total`,
          metric_value: agg.total,
          dimensions: { original_source: agg.source },
          period_start: weekStart,
          period_end: weekEnd,
        });
      }

      if (aggregateMetrics.length > 0) {
        await ingestMetrics(supabase, org_id, aggregateMetrics);
      }

      return { aggregated: aggregateMetrics.length };
    });

    return result;
  },
);
