import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSlackInstallation, createSlackClient } from "@/lib/slack/client";

interface SlackOrigin {
  team_id: string;
  channel_id: string;
  message_ts: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: ":white_circle: Pending",
  in_progress: ":large_blue_circle: In Progress",
  completed: ":white_check_mark: Completed",
  failed: ":red_circle: Failed",
  skipped: ":fast_forward: Skipped",
  carried_over: ":arrow_right: Carried Over",
  blocked: ":no_entry_sign: Blocked",
  waiting_approval: ":hourglass_flowing_sand: Waiting Approval",
};

/**
 * Sync task status changes back to the original Slack thread.
 * Only fires for tasks created from Slack (@mention) that have a slack_origin.
 * Skips transitions originating from the Slack bot to prevent circular updates.
 */
export const slackThreadSync = inngest.createFunction(
  {
    id: "slack-thread-sync",
    triggers: [{ event: "task/status.changed" }],
    retries: 2,
    idempotency: "event.data.task_id + '-' + event.data.changed_at",
  },
  async ({ event, step }) => {
    const { task_id, org_id, new_status, source } = event.data;

    // Skip transitions from Slack bot to prevent circular updates
    if (source === "slack_bot") {
      return { skipped: true, reason: "slack_bot_source" };
    }

    const supabase = createAdminClient();

    // Step 1: Check if task has a Slack origin
    const slackOrigin = await step.run("check-slack-origin", async () => {
      const { data: task } = await supabase
        .from("dtn_daily_tasks")
        .select("slack_origin")
        .eq("id", task_id)
        .eq("org_id", org_id)
        .single();

      return (task?.slack_origin as SlackOrigin | null) ?? null;
    });

    if (!slackOrigin) {
      return { skipped: true, reason: "no_slack_origin" };
    }

    // Step 2: Post thread reply
    await step.run("post-thread-reply", async () => {
      const installation = await getSlackInstallation(
        supabase,
        slackOrigin.team_id,
      );

      if (!installation) {
        console.warn(
          `[slack:thread-sync] No installation for team ${slackOrigin.team_id} — skipping`,
        );
        return;
      }

      const slackClient = createSlackClient(installation.botToken);
      const label = STATUS_LABELS[new_status] ?? new_status;

      await slackClient.chat.postMessage({
        channel: slackOrigin.channel_id,
        thread_ts: slackOrigin.message_ts,
        text: `Status updated: ${label}`,
        blocks: [
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `${label} — _updated from ${source === "web_ui" ? "web app" : source}_`,
              },
            ],
          },
        ],
      });
    });

    return { synced: true, task_id };
  },
);
