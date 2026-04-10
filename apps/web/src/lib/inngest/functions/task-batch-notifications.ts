import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSlackInstallationByOrg,
  createSlackClient,
} from "@/lib/slack/client";

/**
 * Slack notification — triggered when a batch of daily tasks is created.
 * Posts a summary to the org's notification channel.
 */
export const slackTaskBatchNotification = inngest.createFunction(
  {
    id: "slack-task-batch-notification",
    triggers: [{ event: "task/batch.created" }],
    concurrency: [{ limit: 5 }],
    retries: 1,
  },
  async ({ event, step }) => {
    const { org_id, task_count, target_date } = event.data;
    const supabase = createAdminClient();

    const context = await step.run("load-slack-context", async () => {
      const installation = await getSlackInstallationByOrg(supabase, org_id);
      if (!installation) return null;

      return {
        botToken: installation.botToken,
        notificationChannelId: installation.notification_channel_id,
      };
    });

    if (!context) {
      console.log(
        `[inngest:task-batch-slack] Org ${org_id}: No Slack — skipping`,
      );
      return { sent: false, reason: "no_slack" };
    }

    await step.run("post-slack-message", async () => {
      const slackClient = createSlackClient(context.botToken);

      const channelId = context.notificationChannelId;
      if (!channelId) {
        console.log(
          `[inngest:task-batch-slack] Org ${org_id}: No notification channel — skipping`,
        );
        return;
      }

      await slackClient.chat.postMessage({
        channel: channelId,
        text: `${task_count} new tasks generated for ${target_date}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:clipboard: *${task_count} new task${task_count === 1 ? "" : "s"}* generated for *${target_date}*\nCheck your <https://dothesenow.com|dashboard> for details.`,
            },
          },
        ],
      });
    });

    return { sent: true };
  },
);

