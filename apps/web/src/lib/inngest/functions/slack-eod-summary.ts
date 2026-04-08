import { inngest } from "../client";
import { filterOrgsByLocalHour, localDateString } from "../utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgs, getTasksForOrg } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import {
  getSlackInstallationByOrg,
  createSlackClient,
} from "@/lib/slack/client";

/**
 * EOD summary cron — runs every hour, finds orgs at 5pm local time
 * with Slack connected and a notification channel configured,
 * then posts a daily summary to the team channel.
 */
export const slackEodSummary = inngest.createFunction(
  {
    id: "slack-eod-summary",
    triggers: [{ cron: "0 * * * *" }],
    concurrency: [{ limit: 5 }],
    retries: 1,
  },
  async ({ step }) => {
    const supabase = createAdminClient();

    const orgs = await step.run("get-orgs-for-hour", async () => {
      const allOrgs = await getActiveOrgs(supabase);
      return filterOrgsByLocalHour(allOrgs, 17);
    });

    if (orgs.length === 0) {
      console.log("[inngest:eod] No orgs at 5pm local — skipping");
      return { processed: 0, skipped: 0 };
    }

    console.log(`[inngest:eod] ${orgs.length} orgs at their local 5pm`);

    let processed = 0;
    let skipped = 0;

    for (const org of orgs) {
      const result = await step.run(`eod-${org.id}`, async () => {
        // Look up Slack installation
        const installation = await getSlackInstallationByOrg(supabase, org.id);
        if (!installation) {
          return { status: "skipped", reason: "no_slack" } as const;
        }

        // Check notification channel (already included in installation from select("*"))
        const channelId = installation.notification_channel_id;
        if (!channelId) {
          console.warn(
            `[inngest:eod] Org ${org.id}: No notification channel configured — skipping`,
          );
          return { status: "skipped", reason: "no_channel" } as const;
        }

        // Get today's date in org's timezone
        const tz = org.timezone ?? "America/New_York";
        const todayStr = localDateString(tz);

        // Fetch all tasks for today
        const ctx: OrgContext = { client: supabase, orgId: org.id };
        const tasks = await getTasksForOrg(ctx, { scheduled_date: todayStr });

        // Compute stats
        const stats = {
          completed: 0,
          in_progress: 0,
          blocked: 0,
          carried_over: 0,
          pending: 0,
          skipped: 0,
          total: tasks.length,
        };

        for (const t of tasks) {
          if (t.status in stats) {
            stats[t.status as keyof typeof stats]++;
          }
        }

        const completionRate =
          stats.total > 0
            ? Math.round((stats.completed / stats.total) * 100)
            : 0;

        // Build progress bar
        const barLength = 10;
        const filledCount = Math.round((completionRate / 100) * barLength);
        const progressBar =
          "\u2588".repeat(filledCount) + "\u2591".repeat(barLength - filledCount);

        // Build Block Kit message
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blocks: any[] = [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `End of Day Summary \u2014 ${todayStr}`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `\`${progressBar}\` *${completionRate}%* complete (${stats.completed}/${stats.total})`,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `:white_check_mark: *Completed:* ${stats.completed}` },
              { type: "mrkdwn", text: `:large_blue_circle: *In Progress:* ${stats.in_progress}` },
              { type: "mrkdwn", text: `:no_entry_sign: *Blocked:* ${stats.blocked}` },
              { type: "mrkdwn", text: `:arrow_right: *Carried Over:* ${stats.carried_over}` },
              { type: "mrkdwn", text: `:white_circle: *Pending:* ${stats.pending}` },
              { type: "mrkdwn", text: `:fast_forward: *Skipped:* ${stats.skipped}` },
            ],
          },
        ];

        // Completed tasks section (up to 10)
        const completedTasks = tasks.filter((t) => t.status === "completed");
        if (completedTasks.length > 0) {
          blocks.push({ type: "divider" });
          const completedLines = completedTasks.slice(0, 10).map((t) => {
            const assignee =
              t.assigned_profile?.display_name ??
              t.assigned_profile?.email?.split("@")[0] ??
              "";
            return `:white_check_mark: ~${t.title}~${assignee ? ` _(${assignee})_` : ""}`;
          });
          if (completedTasks.length > 10) {
            completedLines.push(`_...and ${completedTasks.length - 10} more_`);
          }
          blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: `*Completed*\n${completedLines.join("\n")}` },
          });
        }

        // Blocked / carried over section
        const attentionTasks = tasks.filter(
          (t) => t.status === "blocked" || t.status === "carried_over",
        );
        if (attentionTasks.length > 0) {
          blocks.push({ type: "divider" });
          const attentionLines = attentionTasks.slice(0, 5).map((t) => {
            const emoji = t.status === "blocked" ? ":no_entry_sign:" : ":arrow_right:";
            const assignee =
              t.assigned_profile?.display_name ??
              t.assigned_profile?.email?.split("@")[0] ??
              "";
            return `${emoji} ${t.title}${assignee ? ` _(${assignee})_` : ""}`;
          });
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Needs Attention*\n${attentionLines.join("\n")}`,
            },
          });
        }

        // Still pending section
        const pendingTasks = tasks.filter((t) => t.status === "pending");
        if (pendingTasks.length > 0) {
          blocks.push({ type: "divider" });
          const pendingLines = pendingTasks.slice(0, 5).map((t) => {
            const assignee =
              t.assigned_profile?.display_name ??
              t.assigned_profile?.email?.split("@")[0] ??
              "";
            return `:white_circle: ${t.title}${assignee ? ` _(${assignee})_` : ""}`;
          });
          if (pendingTasks.length > 5) {
            pendingLines.push(`_...and ${pendingTasks.length - 5} more_`);
          }
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Still Pending*\n${pendingLines.join("\n")}`,
            },
          });
        }

        // Footer
        blocks.push(
          { type: "divider" },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: "_Powered by DoTheseNow_",
              },
            ],
          },
        );

        // Post to channel
        const slackClient = createSlackClient(installation.botToken);
        try {
          await slackClient.chat.postMessage({
            channel: channelId,
            text: `End of Day Summary — ${todayStr}: ${stats.completed}/${stats.total} tasks completed (${completionRate}%)`,
            blocks,
          });
          return { status: "posted" } as const;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          // Check for known Slack channel errors
          if (
            errorMsg.includes("channel_not_found") ||
            errorMsg.includes("not_in_channel") ||
            errorMsg.includes("is_archived")
          ) {
            console.warn(
              `[inngest:eod] Org ${org.id}: Channel ${channelId} unavailable (${errorMsg})`,
            );
            return { status: "skipped", reason: errorMsg } as const;
          }
          throw err; // Rethrow unexpected errors for Inngest retry
        }
      });

      if (result.status === "posted") {
        processed++;
      } else {
        skipped++;
      }
    }

    console.log(`[inngest:eod] processed=${processed} skipped=${skipped}`);
    return { processed, skipped };
  },
);
