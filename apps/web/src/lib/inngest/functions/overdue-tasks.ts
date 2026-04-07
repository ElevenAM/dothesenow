import { inngest } from "../client";
import { filterOrgsByLocalHour } from "../utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgs } from "@dothesenow/queries";
import { getOverdueTasks } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import type { DailyTask } from "@dothesenow/types";

/** Hours overdue → escalation tier */
export function classifyEscalation(hoursOverdue: number): "reminder" | "escalate" | "force_flag" | null {
  if (hoursOverdue >= 72) return "force_flag";
  if (hoursOverdue >= 48) return "escalate";
  if (hoursOverdue >= 24) return "reminder";
  return null;
}

/**
 * Overdue task detection — runs hourly, fans out by timezone.
 * Only processes orgs where the current local time is ~9am.
 *
 * Escalation tiers:
 * - >24hr overdue → reminder in outcome_notes
 * - >48hr overdue → admin escalation flag
 * - >72hr overdue → force-flag in dashboard
 */
export const overdueTaskDetection = inngest.createFunction(
  { id: "overdue-task-detection", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    const supabase = createAdminClient();

    // Step 1: Get orgs where it's currently 9am local time
    const orgs = await step.run("get-orgs-for-hour", async () => {
      const allOrgs = await getActiveOrgs(supabase);
      return filterOrgsByLocalHour(allOrgs, 9);
    });

    if (orgs.length === 0) {
      console.log("[inngest:overdue] No orgs at 9am local — skipping");
      return { processed: 0 };
    }

    console.log(`[inngest:overdue] Processing ${orgs.length} orgs at their local 9am`);

    let totalProcessed = 0;

    // Step 2+3: For each matching org, detect and classify overdue tasks
    for (const org of orgs) {
      const result = await step.run(`process-org-${org.id}`, async () => {
        const ctx: OrgContext = { client: supabase, orgId: org.id };
        const now = new Date();
        // Use tomorrow as the boundary since getOverdueTasks uses .lt() (strictly less than).
        // This ensures tasks scheduled for today are included.
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split("T")[0];

        const overdueTasks = await getOverdueTasks(ctx, tomorrowStr);
        if (overdueTasks.length === 0) return { orgId: org.id, updated: 0 };

        let updated = 0;

        for (const task of overdueTasks) {
          const scheduledAt = new Date(`${task.scheduled_date}T23:59:59Z`);
          const hoursOverdue = (now.getTime() - scheduledAt.getTime()) / (1000 * 60 * 60);
          const tier = classifyEscalation(hoursOverdue);

          if (!tier) continue;

          // Skip if the task already has this tier's flag or a higher one
          const genCtx = (task.generation_context as Record<string, unknown>) ?? {};
          if (tier === "reminder" && (genCtx.admin_escalated || genCtx.force_flagged)) continue;
          if (tier === "escalate" && genCtx.force_flagged) continue;
          if (tier === "force_flag" && genCtx.force_flagged) continue;

          const updates = buildEscalationUpdate(task, tier, hoursOverdue);
          const { error } = await supabase
            .from("dtn_daily_tasks")
            .update(updates)
            .eq("id", task.id)
            .eq("org_id", org.id);

          if (error) {
            console.error(`[inngest:overdue] Failed to update task ${task.id}:`, error.message);
          } else {
            updated++;
          }
        }

        console.log(`[inngest:overdue] Org ${org.id}: ${updated}/${overdueTasks.length} tasks escalated`);
        return { orgId: org.id, updated };
      });

      totalProcessed += result.updated;
    }

    return { processed: totalProcessed, orgs: orgs.length };
  },
);

function buildEscalationUpdate(
  task: DailyTask,
  tier: "reminder" | "escalate" | "force_flag",
  hoursOverdue: number,
): Record<string, unknown> {
  const genContext = (task.generation_context as Record<string, unknown>) ?? {};

  switch (tier) {
    case "reminder":
      return {
        outcome_notes: `Overdue by ${Math.round(hoursOverdue)}h — reminder sent`,
      };
    case "escalate":
      return {
        outcome_notes: `Overdue by ${Math.round(hoursOverdue)}h — escalated to admin`,
        generation_context: { ...genContext, admin_escalated: true, escalated_at: new Date().toISOString() },
      };
    case "force_flag":
      return {
        outcome_notes: `Overdue by ${Math.round(hoursOverdue)}h — force-flagged in dashboard`,
        generation_context: { ...genContext, force_flagged: true, force_flagged_at: new Date().toISOString() },
      };
  }
}
