import type { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTasksForOrg } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import { buildTaskListBlocks, type TaskBlock } from "../client";

interface MorningDMParams {
  orgId: string;
  userId: string;
  userEmail: string;
  displayName: string;
  scheduledDate: string;
}

interface MorningDMResult {
  sent: boolean;
  reason?: string;
}

/**
 * Build and send a morning DM to a single org member.
 * Looks up the member's Slack user by email, fetches their tasks for the day,
 * and sends a formatted Block Kit DM.
 *
 * Returns { sent: false, reason } on recoverable errors rather than throwing,
 * so one user's failure does not block other members.
 */
export async function sendMorningDM(
  adminClient: SupabaseClient,
  slackClient: WebClient,
  params: MorningDMParams,
): Promise<MorningDMResult> {
  const { orgId, userId, userEmail, displayName, scheduledDate } = params;

  try {
    // 1. Look up the Slack user by email
    let slackUserId: string;
    try {
      const result = await slackClient.users.lookupByEmail({ email: userEmail });
      if (!result.user?.id) {
        return { sent: false, reason: "slack_user_not_found" };
      }
      slackUserId = result.user.id;
    } catch {
      // users.lookupByEmail throws if user not found (users_not_found error)
      return { sent: false, reason: "slack_user_not_found" };
    }

    // 2. Fetch today's tasks for this user
    const ctx: OrgContext = { client: adminClient, orgId };
    const allTasks = await getTasksForOrg(ctx, {
      scheduled_date: scheduledDate,
      assigned_to: userId,
    });

    const activeStatuses = new Set(["pending", "in_progress", "blocked"]);
    const tasks = allTasks.filter((t) => activeStatuses.has(t.status));

    // 3. Open a DM channel
    const dm = await slackClient.conversations.open({ users: slackUserId });
    const channelId = dm.channel?.id;
    if (!channelId) {
      return { sent: false, reason: "dm_channel_open_failed" };
    }

    // 4. Build and send the DM
    if (tasks.length === 0) {
      await slackClient.chat.postMessage({
        channel: channelId,
        text: `Good morning, ${displayName}! You have no tasks scheduled for today. Enjoy your day!`,
      });
      return { sent: true };
    }

    // Count tasks by priority for summary
    const priorityCounts: Record<string, number> = {};
    for (const t of tasks) {
      const p = t.priority ?? "none";
      priorityCounts[p] = (priorityCounts[p] ?? 0) + 1;
    }

    const priorityParts: string[] = [];
    if (priorityCounts.urgent) priorityParts.push(`:rotating_light: ${priorityCounts.urgent} urgent`);
    if (priorityCounts.high) priorityParts.push(`:red_circle: ${priorityCounts.high} high`);
    if (priorityCounts.medium) priorityParts.push(`:large_orange_circle: ${priorityCounts.medium} medium`);
    if (priorityCounts.low) priorityParts.push(`:white_circle: ${priorityCounts.low} low`);

    const taskBlocks: TaskBlock[] = tasks.map((t) => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority ?? undefined,
      assignee: undefined,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `Good morning, ${displayName}!` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `You have *${tasks.length} task${tasks.length === 1 ? "" : "s"}* for today.${
            priorityParts.length > 0 ? `\n${priorityParts.join("  ·  ")}` : ""
          }`,
        },
      },
      { type: "divider" },
      ...buildTaskListBlocks(taskBlocks).slice(1), // skip the list's own header (we have ours)
    ];

    await slackClient.chat.postMessage({
      channel: channelId,
      text: `Good morning, ${displayName}! You have ${tasks.length} task(s) for today.`,
      blocks,
    });

    return { sent: true };
  } catch (err) {
    console.error(
      `[slack:morning-dm] Failed for user ${userId}:`,
      err instanceof Error ? err.message : err,
    );
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "unknown_error",
    };
  }
}
