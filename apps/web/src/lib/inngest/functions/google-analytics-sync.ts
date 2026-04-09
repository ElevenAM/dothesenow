import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createSyncLog,
  updateSyncLog,
  ingestMetrics,
} from "@dothesenow/queries";
import { GoogleAnalyticsClient } from "@/lib/integrations/google-analytics/client";
import { GA_DAILY_METRICS, mapGAReportToMetrics } from "@/lib/integrations/google-analytics/mapper";

/**
 * Daily cron: fan out GA sync to all orgs with active Google Analytics.
 * Runs at 6am UTC daily to capture the previous day's data.
 */
export const googleAnalyticsSyncCron = inngest.createFunction(
  {
    id: "google-analytics-sync-cron",
    triggers: [{ cron: "0 6 * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    const supabase = createAdminClient();

    const orgs = await step.run("find-ga-orgs", async () => {
      const { data } = await supabase
        .from("dtn_org_integrations")
        .select("org_id")
        .eq("integration_type", "google_analytics")
        .eq("is_active", true);

      return (data ?? []).map((row) => row.org_id as string);
    });

    if (orgs.length === 0) return { sent: 0 };

    await step.sendEvent(
      "fan-out-ga-sync",
      orgs.map((orgId) => ({
        name: "metrics/ga-sync.daily" as const,
        data: { org_id: orgId },
      })),
    );

    return { sent: orgs.length };
  },
);

/**
 * Per-org GA sync handler: pulls yesterday's metrics from GA4 Data API.
 */
export const googleAnalyticsSyncHandler = inngest.createFunction(
  {
    id: "google-analytics-sync-handler",
    triggers: [{ event: "metrics/ga-sync.daily" }],
    concurrency: [{ limit: 3 }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { org_id } = event.data;
    const supabase = createAdminClient();

    const syncLog = await step.run("create-sync-log", async () => {
      return createSyncLog(supabase, org_id, {
        integration_type: "google_analytics",
        sync_type: "incremental",
        direction: "inbound",
      });
    });

    const result = await step.run("fetch-and-ingest", async () => {
      const client = new GoogleAnalyticsClient(supabase, org_id);

      // Pull yesterday's data
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split("T")[0];

      const metricNames = GA_DAILY_METRICS.map((m) => m.name);

      const report = await client.runReport({
        dateRanges: [{ startDate: dateStr, endDate: dateStr }],
        metrics: GA_DAILY_METRICS,
        dimensions: [
          { name: "date" },
          { name: "sessionDefaultChannelGroup" },
        ],
      });

      const metrics = mapGAReportToMetrics(
        report,
        metricNames,
        { startDate: dateStr, endDate: dateStr },
      );

      if (metrics.length === 0) {
        return { ingested: 0 };
      }

      const ingested = await ingestMetrics(supabase, org_id, metrics);
      return { ingested: ingested.inserted };
    });

    await step.run("finalize", async () => {
      await updateSyncLog(supabase, syncLog.id, {
        status: "completed",
        records_processed: result.ingested,
        records_created: result.ingested,
        completed_at: new Date().toISOString(),
      });
    });

    return result;
  },
);
