import type { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTaskForOrg } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import { buildTaskCard } from "../client";

/**
 * Handle task creation from a Slack @mention.
 * Parses the mention text for a task title and creates it.
 */
export async function handleTaskCreation(
  adminClient: SupabaseClient,
  slackClient: WebClient,
  params: {
    orgId: string;
    channelId: string;
    actorId: string;
    text: string;
    botUserId: string;
  },
): Promise<void> {
  const { orgId, channelId, actorId, text, botUserId } = params;

  // Strip the bot mention to get the task title
  const title = text
    .replace(new RegExp(`<@${botUserId}>`, "g"), "")
    .trim();

  if (!title) {
    await slackClient.chat.postMessage({
      channel: channelId,
      text: "Please provide a task description after mentioning me. Example: `@DoTheseNow Write the blog post`",
    });
    return;
  }

  const ctx: OrgContext = { client: adminClient, orgId };

  try {
    const task = await createTaskForOrg(ctx, {
      title,
      created_by: actorId,
      assigned_to: actorId,
      scheduled_date: new Date().toISOString().split("T")[0],
    });

    const blocks = buildTaskCard({
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority ?? undefined,
    });

    await slackClient.chat.postMessage({
      channel: channelId,
      text: `Task created: ${task.title}`,
      blocks,
    });
  } catch (err) {
    console.error("[slack:task-creation] Failed:", err);
    await slackClient.chat.postMessage({
      channel: channelId,
      text: `:warning: Failed to create task: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
  }
}
