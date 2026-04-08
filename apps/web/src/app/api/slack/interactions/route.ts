import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import {
  verifySlackSignature,
  getSlackInstallation,
  resolveSlackUser,
  createSlackClient,
} from "@/lib/slack/client";
import { handleTaskTransition } from "@/lib/slack/handlers/task-completion";

export const dynamic = "force-dynamic";

/** 50 interactions per minute per workspace */
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 50 });

const ACTION_STATUS_MAP: Record<string, string> = {
  dtn_complete_task: "completed",
  dtn_start_task: "in_progress",
  dtn_snooze_task: "carried_over",
  dtn_skip_task: "skipped",
};

/**
 * Slack interactive component handler.
 * Receives application/x-www-form-urlencoded POST with a `payload` JSON field.
 * Dispatches button clicks to task transition handlers.
 */
export async function POST(request: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return new Response("Server misconfigured", { status: 500 });
  }

  // Verify signature
  const { valid, body } = await verifySlackSignature(request, signingSecret);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Parse URL-encoded body and extract JSON payload
  const params = new URLSearchParams(body);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return new Response("Missing payload", { status: 400 });
  }

  let payload: InteractionPayload;
  try {
    payload = JSON.parse(payloadStr) as InteractionPayload;
  } catch {
    return new Response("Invalid payload JSON", { status: 400 });
  }

  const teamId = payload.team?.id;
  if (!teamId) {
    return new Response("Missing team_id", { status: 400 });
  }

  // Rate limit per workspace
  const rl = limiter.check(teamId);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const supabase = createAdminClient();

  // Look up installation
  const installation = await getSlackInstallation(supabase, teamId);
  if (!installation) {
    return jsonResponse({
      text: ":warning: DoTheseNow is not connected to this workspace.",
    });
  }

  // Handle block_actions (button clicks)
  if (payload.type !== "block_actions" || !payload.actions?.length) {
    return new Response("OK", { status: 200 });
  }

  const action = payload.actions[0];
  const actionId = action.action_id;
  const taskId = action.value;

  const newStatus = ACTION_STATUS_MAP[actionId];
  if (!newStatus || !taskId) {
    return new Response("OK", { status: 200 });
  }

  // Resolve actor
  const slackClient = createSlackClient(installation.botToken);
  const actorId = await resolveSlackUser(
    supabase,
    slackClient,
    payload.user?.id ?? "",
    installation.org_id,
    teamId,
  );

  const result = await handleTaskTransition(supabase, slackClient, {
    taskId,
    orgId: installation.org_id,
    newStatus,
    actorId,
    channelId: payload.channel?.id ?? "",
    messageTs: payload.message?.ts ?? "",
  });

  if (!result.success) {
    return jsonResponse({
      response_type: "ephemeral",
      replace_original: false,
      text: `:warning: ${result.message}`,
    });
  }

  // Slack expects 200 with empty body for successful interaction handling
  // (the message update is done in handleTaskTransition via chat.update)
  return new Response("", { status: 200 });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Types ──────────────────────────────────────────────────

interface InteractionPayload {
  type: string;
  team?: { id: string };
  user?: { id: string };
  channel?: { id: string };
  message?: { ts: string };
  actions?: Array<{
    action_id: string;
    value: string;
  }>;
}
