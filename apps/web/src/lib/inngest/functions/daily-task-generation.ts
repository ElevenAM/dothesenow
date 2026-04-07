import { inngest } from "../client";
import { filterOrgsByLocalHour } from "../utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgs } from "@dothesenow/queries";

/**
 * Daily task generation — stub for Phase 6.
 *
 * Runs hourly, fans out by timezone. Only processes orgs where
 * the current local time is ~7am. Real LLM decomposition pipeline
 * will be wired in Phase 6B.
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

    for (const org of orgs) {
      await step.run(`generate-org-${org.id}`, async () => {
        console.log("[inngest:daily-gen] Generation requested for org:", org.id);
        // Stub: real LLM pipeline deferred to Phase 6
      });
    }

    return { processed: orgs.length };
  },
);
