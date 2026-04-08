import { WebClient } from "@slack/web-api";
import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getIntegrationSecret,
} from "@dothesenow/queries";

// ─── Types ──────────────────────────────────────────────────

export interface SlackInstallation {
  id: string;
  org_id: string;
  team_id: string;
  team_name: string;
  bot_user_id: string;
  app_id: string;
  installer_user_id: string | null;
  bot_scopes: string[];
  user_cache: Record<string, { dtn_uid: string; cached_at: string }>;
  created_at: string;
  updated_at: string;
}

export interface SlackInstallationWithToken extends SlackInstallation {
  botToken: string;
}

// ─── Client factory ─────────────────────────────────────────

export function createSlackClient(botToken: string): WebClient {
  return new WebClient(botToken);
}

// ─── Signature verification ─────────────────────────────────

/**
 * Verify Slack request signature using HMAC-SHA256.
 * Must be called on the raw request body before parsing.
 *
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */
export async function verifySlackSignature(
  request: Request,
  signingSecret: string,
): Promise<{ valid: boolean; body: string }> {
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!timestamp || !signature) {
    return { valid: false, body: "" };
  }

  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) {
    return { valid: false, body: "" };
  }

  const body = await request.text();
  const baseString = `v0:${timestamp}:${body}`;
  const computed = `v0=${createHmac("sha256", signingSecret).update(baseString).digest("hex")}`;

  try {
    const valid = timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(signature),
    );
    return { valid, body };
  } catch {
    return { valid: false, body };
  }
}

// ─── Installation lookup ────────────────────────────────────

/**
 * Look up a Slack installation by team_id and decrypt its bot token from Vault.
 */
export async function getSlackInstallation(
  adminClient: SupabaseClient,
  teamId: string,
): Promise<SlackInstallationWithToken | null> {
  // Get installation record
  const { data: installation, error } = await adminClient
    .from("dtn_slack_installations")
    .select("*")
    .eq("team_id", teamId)
    .single();

  if (error || !installation) return null;

  // Get the org integration to find vault_secret_id
  const { data: integration, error: integrationError } = await adminClient
    .from("dtn_org_integrations")
    .select("vault_secret_id")
    .eq("org_id", installation.org_id)
    .eq("integration_type", "slack")
    .eq("is_active", true)
    .single();

  if (integrationError || !integration?.vault_secret_id) return null;

  const botToken = await getIntegrationSecret(
    adminClient,
    integration.vault_secret_id,
  );

  return {
    ...(installation as SlackInstallation),
    botToken,
  };
}

// ─── User resolution ────────────────────────────────────────

const USER_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Resolve a Slack user ID to a DTN user ID.
 * Checks the installation's user_cache first (with 24h TTL),
 * then falls back to Slack users.info → email → auth.users match.
 */
export async function resolveSlackUser(
  adminClient: SupabaseClient,
  slackClient: WebClient,
  slackUserId: string,
  orgId: string,
  teamId: string,
): Promise<string | null> {
  // Check cache first
  const { data: installation } = await adminClient
    .from("dtn_slack_installations")
    .select("user_cache")
    .eq("team_id", teamId)
    .single();

  const cache = (installation?.user_cache ?? {}) as Record<
    string,
    { dtn_uid: string; cached_at: string }
  >;
  const cached = cache[slackUserId];

  if (cached) {
    const age = Date.now() - new Date(cached.cached_at).getTime();
    if (age < USER_CACHE_TTL_MS) return cached.dtn_uid;
  }

  // Resolve via Slack API
  try {
    const result = await slackClient.users.info({ user: slackUserId });
    const email = result.user?.profile?.email;
    if (!email) return null;

    // Match email to profiles, then verify active membership in this org
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();

    if (!profile) return null;

    const { data: membership } = await adminClient
      .from("dtn_memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", profile.id)
      .eq("is_active", true)
      .single();

    if (!membership?.user_id) return null;

    // Update cache. Uses read-modify-write which can lose entries under
    // concurrent writes, but this only affects cache performance (missed entries
    // are re-fetched from Slack API), not correctness.
    cache[slackUserId] = {
      dtn_uid: membership.user_id,
      cached_at: new Date().toISOString(),
    };

    await adminClient
      .from("dtn_slack_installations")
      .update({ user_cache: cache })
      .eq("team_id", teamId);

    return membership.user_id;
  } catch (err) {
    console.error(
      `[slack] Failed to resolve user ${slackUserId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ─── Task transition (admin client, bypasses RPC) ───────────

/**
 * Transition a task's status from Slack context.
 * Uses admin client directly because the transition_task_status() RPC
 * requires an authenticated user JWT (calls get_user_org_ids()).
 * Matches the pattern in executor-dispatch.ts.
 */
export async function transitionTaskFromSlack(
  adminClient: SupabaseClient,
  taskId: string,
  orgId: string,
  newStatus: string,
  actorId: string | null,
): Promise<{ success: boolean; error?: string }> {
  // Load current task
  const { data: task, error: fetchError } = await adminClient
    .from("dtn_daily_tasks")
    .select("status")
    .eq("id", taskId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single();

  if (fetchError || !task) {
    return { success: false, error: "Task not found" };
  }

  // Validate transition (same state machine as migration 013)
  const allowed: Record<string, string[]> = {
    pending: ["in_progress", "waiting_approval", "skipped", "carried_over"],
    in_progress: ["completed", "failed", "blocked", "skipped", "waiting_approval"],
    waiting_approval: ["completed", "rejected", "pending"],
    blocked: ["in_progress", "skipped", "carried_over"],
  };

  const validTransitions = allowed[task.status];
  if (!validTransitions || !validTransitions.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from ${task.status} to ${newStatus}`,
    };
  }

  // Update task
  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === "completed") {
    updates.completed_at = new Date().toISOString();
  }

  const { error: updateError } = await adminClient
    .from("dtn_daily_tasks")
    .update(updates)
    .eq("id", taskId)
    .eq("org_id", orgId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Insert event into dtn_task_events audit log
  await adminClient.from("dtn_task_events").insert({
    task_id: taskId,
    org_id: orgId,
    previous_status: task.status,
    new_status: newStatus,
    source: "slack_bot",
    actor_id: actorId,
    metadata: {},
  });

  return { success: true };
}

// ─── Slack Block Kit helpers ────────────────────────────────

export interface TaskBlock {
  taskId: string;
  title: string;
  status: string;
  priority?: string;
  assignee?: string;
}

/**
 * Build a Slack Block Kit message for a task card with action buttons.
 * Uses `unknown` return to avoid fighting Slack SDK's overly strict KnownBlock union.
 * The blocks are valid Slack payloads — validated by Slack's API at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTaskCard(task: TaskBlock): any[] {
  const statusEmoji: Record<string, string> = {
    pending: ":white_circle:",
    in_progress: ":large_blue_circle:",
    completed: ":white_check_mark:",
    failed: ":red_circle:",
    skipped: ":fast_forward:",
    carried_over: ":arrow_right:",
    blocked: ":no_entry_sign:",
  };

  const priorityLabel: Record<string, string> = {
    urgent: ":rotating_light: Urgent",
    high: ":red_circle: High",
    medium: ":large_orange_circle: Medium",
    low: ":white_circle: Low",
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${statusEmoji[task.status] ?? ":white_circle:"} *${task.title}*`,
      },
    },
  ];

  const fields: { type: string; text: string }[] = [];
  if (task.priority) {
    fields.push({
      type: "mrkdwn",
      text: `*Priority:* ${priorityLabel[task.priority] ?? task.priority}`,
    });
  }
  if (task.assignee) {
    fields.push({ type: "mrkdwn", text: `*Assignee:* ${task.assignee}` });
  }

  if (fields.length > 0) {
    blocks.push({ type: "section", fields });
  }

  // Only show action buttons for actionable statuses
  if (["pending", "in_progress", "blocked"].includes(task.status)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actions: any[] = [];

    if (task.status === "pending") {
      actions.push({
        type: "button",
        text: { type: "plain_text", text: "Start" },
        action_id: "dtn_start_task",
        value: task.taskId,
        style: "primary",
      });
    }

    if (["pending", "in_progress"].includes(task.status)) {
      actions.push({
        type: "button",
        text: { type: "plain_text", text: "Complete" },
        action_id: "dtn_complete_task",
        value: task.taskId,
        style: "primary",
      });
    }

    actions.push(
      {
        type: "button",
        text: { type: "plain_text", text: "Snooze" },
        action_id: "dtn_snooze_task",
        value: task.taskId,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Skip" },
        action_id: "dtn_skip_task",
        value: task.taskId,
      },
    );

    blocks.push({ type: "actions", elements: actions });
  }

  return blocks;
}

/**
 * Build a task list message for /dtn tasks
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTaskListBlocks(tasks: TaskBlock[]): any[] {
  if (tasks.length === 0) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":tada: You have no pending tasks for today!",
        },
      },
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Today's Tasks (${tasks.length})` },
    },
    { type: "divider" },
  ];

  for (const task of tasks.slice(0, 10)) {
    blocks.push(...buildTaskCard(task));
    blocks.push({ type: "divider" });
  }

  if (tasks.length > 10) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_...and ${tasks.length - 10} more tasks. View all at dothesenow.com_`,
        },
      ],
    });
  }

  return blocks;
}
