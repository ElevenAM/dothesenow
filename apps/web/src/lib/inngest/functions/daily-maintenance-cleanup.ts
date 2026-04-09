import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily maintenance cron combining three cleanup tasks:
 * 1. Webhook subscriptions: deactivate with failure_count >= 5
 * 2. Sync log retention: delete entries older than 90 days
 * 3. Stale imports: fail imports stuck in 'processing' for > 1 hour
 */
export const dailyMaintenanceCleanup = inngest.createFunction(
  {
    id: "daily-maintenance-cleanup",
    triggers: [{ cron: "0 4 * * *" }], // 4am UTC daily
    retries: 1,
  },
  async ({ step }) => {
    const supabase = createAdminClient();

    // Task 1: Deactivate failed webhook subscriptions
    const webhookCleanup = await step.run("cleanup-webhooks", async () => {
      const { data, error } = await supabase
        .from("dtn_webhook_subscriptions")
        .update({ is_active: false })
        .eq("is_active", true)
        .gte("failure_count", 5)
        .select("id");

      if (error) {
        console.error("[maintenance] Webhook cleanup failed:", error.message);
        return { deactivated: 0 };
      }

      const count = data?.length ?? 0;
      if (count > 0) {
        console.log(`[maintenance] Deactivated ${count} failed webhook subscriptions`);
      }
      return { deactivated: count };
    });

    // Task 2: Delete old sync logs (keep last 90 days)
    const syncLogCleanup = await step.run("cleanup-sync-logs", async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      const cutoff = cutoffDate.toISOString();

      const { error, count } = await supabase
        .from("dtn_sync_log")
        .delete({ count: "exact" })
        .lt("created_at", cutoff);

      if (error) {
        console.error("[maintenance] Sync log cleanup failed:", error.message);
        return { deleted: 0 };
      }

      if ((count ?? 0) > 0) {
        console.log(`[maintenance] Deleted ${count} old sync log entries`);
      }
      return { deleted: count ?? 0 };
    });

    // Task 3: Fail stale imports (stuck in processing > 1 hour)
    const importCleanup = await step.run("cleanup-stale-imports", async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("dtn_contact_imports")
        .update({
          status: "failed",
          errors: [{ row_number: 0, field: "_system", reason: "Import timed out after 1 hour" }],
          completed_at: new Date().toISOString(),
        })
        .eq("status", "processing")
        .lt("updated_at", oneHourAgo)
        .select("id");

      if (error) {
        console.error("[maintenance] Stale import cleanup failed:", error.message);
        return { failed: 0 };
      }

      const count = data?.length ?? 0;
      if (count > 0) {
        console.log(`[maintenance] Failed ${count} stale imports`);
      }
      return { failed: count };
    });

    return {
      webhooks: webhookCleanup,
      syncLogs: syncLogCleanup,
      imports: importCleanup,
    };
  },
);
