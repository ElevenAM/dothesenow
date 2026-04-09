import { inngest } from "../client";
import { filterOrgsByLocalHour } from "../utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgs, getCreditBalance } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import { TASK_DECOMPOSITION_COST } from "@dothesenow/prompts";

/**
 * Daily task generation — hourly cron that fans out by timezone.
 *
 * Runs every hour, finds orgs whose local time is ~7am, checks they have
 * sufficient credits, then emits a task/daily.generate event for each.
 * The actual decomposition happens in task-decomposition.ts.
 */
export const dailyTaskGeneration = inngest.createFunction(
  { id: "daily-task-generation", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    const supabase = createAdminClient();

    const orgs = await step.run("get-orgs-for-hour", async () => {
      const allOrgs = await getActiveOrgs(supabase);
      return filterOrgsByLocalHour(allOrgs, 7);
    });

    if (orgs.length === 0) {
      console.log("[inngest:daily-gen] No orgs at 7am local — skipping");
      return { processed: 0 };
    }

    console.log(`[inngest:daily-gen] ${orgs.length} orgs at their local 7am`);

    const events: { name: "task/daily.generate"; data: { org_id: string } }[] = [];

    for (const org of orgs) {
      const evt = await step.run(`check-credits-${org.id}`, async () => {
        const ctx: OrgContext = { client: supabase, orgId: org.id };
        const { remaining } = await getCreditBalance(ctx);

        if (remaining < TASK_DECOMPOSITION_COST) {
          console.log(
            `[inngest:daily-gen] Org ${org.id} has ${remaining} credits (need ${TASK_DECOMPOSITION_COST}) — skipping`,
          );
          return null;
        }

        return {
          name: "task/daily.generate" as const,
          data: { org_id: org.id },
        };
      });

      if (evt) {
        events.push(evt);
      }
    }

    // Send all events at once — Inngest handles fan-out and concurrency
    if (events.length > 0) {
      await step.sendEvent("fan-out-decomposition", events);
    }

    return { processed: events.length };
  },
);
