import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSlackInstallation,
  createSlackClient,
  resolveSlackUser,
  transitionTaskFromSlack,
} from "@/lib/slack/client";
import { handleTaskCreation } from "@/lib/slack/handlers/task-creation";
import { createTaskForOrg } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";

/**
 * Handles Slack @mention events asynchronously.
 * Resolves the Slack user, parses the mention text, and creates a task.
 */
export const slackMentionHandler = inngest.createFunction(
  {
    id: "slack-mention-handler",
    triggers: [{ event: "slack/mention.received" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { team_id, channel_id, user_id, text, event_id } = event.data;
    const supabase = createAdminClient();

    // Step 1: Resolve installation and user
    const context = await step.run("resolve-context", async () => {
      const installation = await getSlackInstallation(supabase, team_id);
      if (!installation) {
        throw new Error(`No Slack installation for team ${team_id}`);
      }

      const slackClient = createSlackClient(installation.botToken);
      const actorId = await resolveSlackUser(
        supabase,
        slackClient,
        user_id,
        installation.org_id,
        team_id,
      );

      return {
        orgId: installation.org_id,
        actorId,
        botToken: installation.botToken,
        botUserId: installation.bot_user_id,
      };
    });

    if (!context.actorId) {
      // Can't resolve user — post a message back
      await step.run("notify-unlinked-user", async () => {
        const client = createSlackClient(context.botToken);
        await client.chat.postMessage({
          channel: channel_id,
          text: ":warning: I couldn't find your DoTheseNow account. Make sure you use the same email in both Slack and DoTheseNow.",
        });
      });
      return { skipped: true, reason: "unlinked_user" };
    }

    // Step 2: Create task
    await step.run("create-task", async () => {
      const slackClient = createSlackClient(context.botToken);
      await handleTaskCreation(supabase, slackClient, {
        orgId: context.orgId,
        channelId: channel_id,
        actorId: context.actorId!,
        text,
        botUserId: context.botUserId,
      });
    });

    // Step 3: Mark event as done
    await step.run("mark-event-done", async () => {
      await supabase
        .from("dtn_slack_events")
        .update({ status: "done" })
        .eq("event_id", event_id);
    });

    return { success: true, event_id };
  },
);

/**
 * Handles async slash commands (complete, create) via Inngest.
 * Responds to Slack via the response_url.
 */
export const slackCommandHandler = inngest.createFunction(
  {
    id: "slack-command-handler",
    triggers: [{ event: "slack/command.received" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { team_id, dtn_user_id, command, text, response_url } = event.data;
    const supabase = createAdminClient();

    const result = await step.run("handle-command", async (): Promise<{ text: string; error?: string }> => {
      const installation = await getSlackInstallation(supabase, team_id);
      if (!installation) {
        return { text: "", error: "Workspace not connected" };
      }

      const orgId = installation.org_id;

      switch (command) {
        case "complete": {
          const taskId = text.trim();
          if (!taskId) return { text: "", error: "Usage: `/dtn complete <task-id>`" };

          const transitionResult = await transitionTaskFromSlack(
            supabase,
            taskId,
            orgId,
            "completed",
            dtn_user_id,
          );

          return transitionResult.success
            ? { text: `:white_check_mark: Task completed!` }
            : { text: "", error: transitionResult.error };
        }

        case "create": {
          const title = text.trim();
          if (!title) return { text: "", error: "Usage: `/dtn create <task title>`" };

          const ctx: OrgContext = { client: supabase, orgId };
          const task = await createTaskForOrg(ctx, {
            title,
            created_by: dtn_user_id,
            assigned_to: dtn_user_id,
            scheduled_date: new Date().toISOString().split("T")[0],
          });

          return { text: `:white_check_mark: Task created: *${task.title}*` };
        }

        default:
          return { text: "", error: `Unknown command: ${command}` };
      }
    });

    // Respond via response_url
    await step.run("respond", async () => {
      const responseBody = result.error
        ? { response_type: "ephemeral", text: `:warning: ${result.error}` }
        : { response_type: "ephemeral", text: result.text };

      await fetch(response_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responseBody),
      });
    });

    return result;
  },
);
