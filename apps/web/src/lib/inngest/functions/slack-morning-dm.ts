import { inngest } from "../client";
import { filterOrgsByLocalHour, localDateString } from "../utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgs, getTeamWithSpecialties } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import {
  getSlackInstallationByOrg,
  createSlackClient,
} from "@/lib/slack/client";
import { sendMorningDM } from "@/lib/slack/handlers/morning-dm";

/**
 * Morning DM cron — runs every hour, finds orgs at 8am local time
 * with Slack connected, then fans out to the per-org handler.
 */
export const slackMorningDMCron = inngest.createFunction(
  { id: "slack-morning-dm-cron", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    const supabase = createAdminClient();

    const orgs = await step.run("get-orgs-for-hour", async () => {
      const allOrgs = await getActiveOrgs(supabase);
      return filterOrgsByLocalHour(allOrgs, 8);
    });

    if (orgs.length === 0) {
      console.log("[inngest:morning-dm] No orgs at 8am local — skipping");
      return { processed: 0 };
    }

    console.log(`[inngest:morning-dm] ${orgs.length} orgs at their local 8am`);

    // Check which orgs have Slack connected before fanning out
    const events: { name: "slack/morning-dm.send"; data: { org_id: string } }[] = [];

    for (const org of orgs) {
      await step.run(`check-slack-${org.id}`, async () => {
        const installation = await getSlackInstallationByOrg(supabase, org.id);
        if (!installation) {
          console.log(`[inngest:morning-dm] Org ${org.id}: No Slack — skipping`);
          return;
        }
        events.push({ name: "slack/morning-dm.send", data: { org_id: org.id } });
      });
    }

    if (events.length > 0) {
      await step.sendEvent("fan-out-morning-dms", events);
    }

    return { processed: events.length };
  },
);

/**
 * Morning DM handler — triggered per org, sends DMs to each member.
 * Concurrency-limited to 5 to respect Slack API rate limits.
 */
export const slackMorningDMHandler = inngest.createFunction(
  {
    id: "slack-morning-dm-handler",
    triggers: [{ event: "slack/morning-dm.send" }],
    concurrency: [{ limit: 5 }],
  },
  async ({ event, step }) => {
    const { org_id } = event.data;
    const supabase = createAdminClient();

    // Step 1: Load Slack installation and team members
    const context = await step.run("load-context", async () => {
      const installation = await getSlackInstallationByOrg(supabase, org_id);
      if (!installation) {
        throw new Error(`No Slack installation for org ${org_id}`);
      }

      const ctx: OrgContext = { client: supabase, orgId: org_id };
      const members = await getTeamWithSpecialties(ctx);

      const tz = installation.team_name; // we need the org timezone, not team_name
      return {
        botToken: installation.botToken,
        members: members
          .filter((m) => m.profile?.email)
          .map((m) => ({
            userId: m.user_id!,
            email: m.profile!.email,
            displayName: m.profile?.display_name ?? m.profile!.email.split("@")[0],
          })),
      };
    });

    if (context.members.length === 0) {
      console.log(`[inngest:morning-dm] Org ${org_id}: No members with emails — skipping`);
      return { sent: 0, failed: 0, skipped: 0 };
    }

    const slackClient = createSlackClient(context.botToken);

    // Get the local date for this org's timezone
    // We look up the org's timezone from the DB since we didn't store it in context
    const scheduledDate = await step.run("get-local-date", async () => {
      const { data: org } = await supabase
        .from("dtn_organizations")
        .select("timezone")
        .eq("id", org_id)
        .single();
      return localDateString(org?.timezone ?? "America/New_York");
    });

    // Step 2: Send DMs to each member (individual steps for retryability)
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const member of context.members) {
      const result = await step.run(`dm-${member.userId}`, async () => {
        return sendMorningDM(supabase, slackClient, {
          orgId: org_id,
          userId: member.userId,
          userEmail: member.email,
          displayName: member.displayName,
          scheduledDate,
        });
      });

      if (result.sent) {
        sent++;
      } else if (result.reason === "slack_user_not_found") {
        skipped++;
      } else {
        failed++;
      }
    }

    console.log(
      `[inngest:morning-dm] Org ${org_id}: sent=${sent} failed=${failed} skipped=${skipped}`,
    );

    return { sent, failed, skipped };
  },
);
