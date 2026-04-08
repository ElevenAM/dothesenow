import type { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import { transitionTaskFromSlack } from "../client";

const STATUS_LABELS: Record<string, string> = {
  completed: ":white_check_mark: Completed",
  in_progress: ":large_blue_circle: In Progress",
  carried_over: ":arrow_right: Snoozed to tomorrow",
  skipped: ":fast_forward: Skipped",
};

/**
 * Handle task status transition from a Slack interaction (button click).
 * Updates the task status and modifies the original Slack message.
 */
export async function handleTaskTransition(
  adminClient: SupabaseClient,
  slackClient: WebClient,
  params: {
    taskId: string;
    orgId: string;
    newStatus: string;
    actorId: string | null;
    channelId: string;
    messageTs: string;
  },
): Promise<{ success: boolean; message: string }> {
  const { taskId, orgId, newStatus, actorId, channelId, messageTs } = params;

  const result = await transitionTaskFromSlack(
    adminClient,
    taskId,
    orgId,
    newStatus,
    actorId,
  );

  if (!result.success) {
    return { success: false, message: result.error ?? "Failed to update task" };
  }

  // Update the Slack message to reflect the new status
  const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;

  try {
    await slackClient.chat.update({
      channel: channelId,
      ts: messageTs,
      text: statusLabel,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${statusLabel} — task updated from Slack`,
          },
        },
      ],
    });
  } catch (err) {
    console.warn("[slack:task-completion] Failed to update message:", err);
  }

  return { success: true, message: statusLabel };
}
