import type { SupabaseClient } from "@supabase/supabase-js";
import { getTasksForOrg, getMembershipByUserId } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import { buildTaskListBlocks, buildTaskCard, type TaskBlock } from "../client";

interface SlashCommandResult {
  response_type: "ephemeral" | "in_channel";
  text: string;
  blocks?: Record<string, unknown>[];
}

/**
 * Parse and handle /dtn slash commands.
 * Sync commands (tasks, help) return formatted blocks immediately.
 * Async commands (complete, create) return null to indicate they need Inngest.
 */
export async function handleSlashCommand(
  adminClient: SupabaseClient,
  params: {
    orgId: string;
    actorId: string;
    text: string;
    channelId?: string;
    departmentId?: string;
  },
): Promise<SlashCommandResult | null> {
  const { orgId, actorId, text, channelId } = params;
  const parts = text.trim().split(/\s+/);
  const subCommand = parts[0]?.toLowerCase() ?? "tasks";
  const args = parts.slice(1).join(" ");

  switch (subCommand) {
    case "tasks":
    case "today":
      return handleTasks(adminClient, orgId, actorId);

    case "help":
      return handleHelp();

    case "channel":
      return handleChannel(adminClient, orgId, actorId, channelId);

    case "complete":
    case "create":
      // These need async processing — return null so the route fires Inngest
      return null;

    default:
      return {
        response_type: "ephemeral",
        text: `Unknown command: \`${subCommand}\`. Try \`/dtn help\` for available commands.`,
      };
  }
}

/**
 * Extract the sub-command and arguments from slash command text.
 */
export function parseSlashCommand(text: string): {
  subCommand: string;
  args: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { subCommand: "tasks", args: "" };
  const parts = trimmed.split(/\s+/);
  return {
    subCommand: parts[0].toLowerCase(),
    args: parts.slice(1).join(" "),
  };
}

// ─── Sync handlers ──────────────────────────────────────────

async function handleChannel(
  adminClient: SupabaseClient,
  orgId: string,
  actorId: string,
  channelId?: string,
): Promise<SlashCommandResult> {
  if (!channelId) {
    return {
      response_type: "ephemeral",
      text: ":warning: Could not detect the current channel. Please try again.",
    };
  }

  // Only admins and owners can set the notification channel
  const membership = await getMembershipByUserId(adminClient, orgId, actorId);
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return {
      response_type: "ephemeral",
      text: ":warning: Only workspace admins can set the notification channel.",
    };
  }

  const { error } = await adminClient
    .from("dtn_slack_installations")
    .update({ notification_channel_id: channelId })
    .eq("org_id", orgId);

  if (error) {
    console.error("[slack:channel] Failed to set notification channel:", error.message);
    return {
      response_type: "ephemeral",
      text: ":warning: Failed to update notification channel. Please try again.",
    };
  }

  return {
    response_type: "in_channel",
    text: ":white_check_mark: EOD summaries will now be posted to this channel.",
  };
}

async function handleTasks(
  adminClient: SupabaseClient,
  orgId: string,
  actorId: string,
): Promise<SlashCommandResult> {
  const today = new Date().toISOString().split("T")[0];
  const ctx: OrgContext = { client: adminClient, orgId };

  const allTasks = await getTasksForOrg(ctx, {
    scheduled_date: today,
    assigned_to: actorId,
  });

  const activeTasks = new Set(["pending", "in_progress", "blocked"]);
  const tasks = allTasks.filter((t) => activeTasks.has(t.status));

  const taskBlocks: TaskBlock[] = tasks.map((t) => ({
    taskId: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority ?? undefined,
  }));

  return {
    response_type: "ephemeral",
    text: `You have ${tasks.length} task(s) for today`,
    blocks: buildTaskListBlocks(taskBlocks),
  };
}

function handleHelp(): SlashCommandResult {
  return {
    response_type: "ephemeral",
    text: "DoTheseNow Slack Commands",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "DoTheseNow Commands" },
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            "`/dtn tasks` — Show today's pending tasks",
            "`/dtn complete <task-id>` — Mark a task as completed",
            "`/dtn create <title>` — Create a new task for today",
            "`/dtn channel` — Set this channel for EOD summaries",
            "`/dtn help` — Show this help message",
            "",
            "You can also *@mention* the DoTheseNow bot to create tasks from natural language.",
          ].join("\n"),
        },
      },
    ],
  };
}
