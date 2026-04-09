import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSlackInstallationByOrg,
  createSlackClient,
} from "@/lib/slack/client";
import { getTasksForOrg, getTeamWithSpecialties } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import { sendTaskBatchEmail } from "@/lib/email/send-task-batch";

/**
 * Slack notification — triggered when a batch of daily tasks is created.
 * Posts a summary to the org's notification channel (or DMs each assignee).
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

/**
 * Email notification — triggered when a batch of daily tasks is created.
 * Sends a summary email to each team member with their assigned tasks.
 */
export const emailTaskBatchNotification = inngest.createFunction(
  {
    id: "email-task-batch-notification",
    triggers: [{ event: "task/batch.created" }],
    concurrency: [{ limit: 5 }],
    retries: 1,
  },
  async ({ event, step }) => {
    const { org_id, task_count, target_date } = event.data;
    const supabase = createAdminClient();

    if (task_count === 0) return { sent: 0 };

    // Load tasks and team members
    const context = await step.run("load-email-context", async () => {
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      const tasks = await getTasksForOrg(ctx, {
        scheduled_date: target_date,
      });
      const members = await getTeamWithSpecialties(ctx);

      const { data: org } = await supabase
        .from("dtn_organizations")
        .select("name")
        .eq("id", org_id)
        .single();

      return {
        orgName: org?.name ?? "Your Organization",
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          executor_type: t.executor_type,
          assigned_to: t.assigned_to,
          description: t.description,
        })),
        members: members
          .filter((m) => m.profile?.email && m.user_id)
          .map((m) => ({
            userId: m.user_id!,
            email: m.profile!.email,
            displayName:
              m.profile?.display_name ??
              m.profile!.email.split("@")[0],
          })),
      };
    });

    if (context.members.length === 0) {
      return { sent: 0, reason: "no_members_with_email" };
    }

    // Send an email to each member with their assigned tasks
    let sent = 0;
    for (const member of context.members) {
      const memberTasks = context.tasks.filter(
        (t) => t.assigned_to === member.userId || !t.assigned_to,
      );

      if (memberTasks.length === 0) continue;

      const result = await step.run(
        `email-${member.userId}`,
        async () => {
          return sendTaskBatchEmail({
            to: member.email,
            displayName: member.displayName,
            orgName: context.orgName,
            targetDate: target_date,
            tasks: memberTasks,
          });
        },
      );

      if (result.success) sent++;
    }

    console.log(
      `[inngest:task-batch-email] Org ${org_id}: sent=${sent}/${context.members.length}`,
    );

    return { sent };
  },
);
