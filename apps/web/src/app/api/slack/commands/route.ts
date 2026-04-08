import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { verifySlackSignature, getSlackInstallation } from "@/lib/slack/client";
import { handleSlashCommand, parseSlashCommand } from "@/lib/slack/handlers/slash-commands";
import { resolveSlackUser, createSlackClient } from "@/lib/slack/client";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";

/** 30 commands per minute per workspace */
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

/**
 * Slack slash command handler.
 * Receives application/x-www-form-urlencoded POST from Slack.
 * Sync commands respond immediately; async ones fire Inngest events.
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

  // Parse URL-encoded body
  const params = new URLSearchParams(body);
  const teamId = params.get("team_id") ?? "";
  const slackUserId = params.get("user_id") ?? "";
  const text = params.get("text") ?? "";
  const responseUrl = params.get("response_url") ?? "";
  const channelId = params.get("channel_id") ?? "";

  if (!teamId) {
    return jsonResponse({ text: "Missing team_id" }, 400);
  }

  // Rate limit per workspace
  const rl = limiter.check(teamId);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const supabase = createAdminClient();

  // Look up installation
  const installation = await getSlackInstallation(supabase, teamId);
  if (!installation) {
    return jsonResponse({
      response_type: "ephemeral",
      text: ":warning: DoTheseNow is not connected to this workspace. Connect it at Settings > Integrations.",
    });
  }

  // Resolve Slack user to DTN user
  const slackClient = createSlackClient(installation.botToken);
  const actorId = await resolveSlackUser(
    supabase,
    slackClient,
    slackUserId,
    installation.org_id,
    teamId,
  );

  if (!actorId) {
    return jsonResponse({
      response_type: "ephemeral",
      text: ":warning: Your Slack account isn't linked to a DoTheseNow account. Make sure you use the same email in both.",
    });
  }

  // Try sync handling first
  const result = await handleSlashCommand(supabase, {
    orgId: installation.org_id,
    actorId,
    text,
    channelId,
  });

  if (result) {
    return jsonResponse(result);
  }

  // Async command — fire Inngest event and respond with "Working on it..."
  const { subCommand, args } = parseSlashCommand(text);

  inngest.send({
    name: "slack/command.received",
    data: {
      team_id: teamId,
      dtn_user_id: actorId,
      command: subCommand,
      text: args,
      response_url: responseUrl,
    },
  }).catch((err) => {
    console.error("[slack:commands] Failed to send Inngest event:", err);
  });

  return jsonResponse({
    response_type: "ephemeral",
    text: `:hourglass_flowing_sand: Working on it...`,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
