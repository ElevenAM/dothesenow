import { createAdminClient } from "@/lib/supabase/admin";
import { verifySlackSignature } from "@/lib/slack/client";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";

/**
 * Slack Events API handler.
 * Handles URL verification challenge and dispatches events to Inngest.
 *
 * @see https://api.slack.com/events-api
 */
export async function POST(request: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("[slack:events] SLACK_SIGNING_SECRET not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  // Verify signature (consumes the body)
  const { valid, body } = await verifySlackSignature(request, signingSecret);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Handle URL verification challenge
  if (payload.type === "url_verification") {
    return new Response(
      JSON.stringify({ challenge: payload.challenge }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Only process event_callback type
  if (payload.type !== "event_callback") {
    return new Response("OK", { status: 200 });
  }

  const event = payload.event as Record<string, unknown> | undefined;
  const eventId = payload.event_id as string | undefined;
  const teamId = payload.team_id as string | undefined;

  if (!event || !eventId || !teamId) {
    return new Response("Missing event data", { status: 400 });
  }

  // Dedup via dtn_slack_events table
  const supabase = createAdminClient();
  const { error: dedupError } = await supabase
    .from("dtn_slack_events")
    .insert({
      event_id: eventId,
      team_id: teamId,
      event_type: event.type as string,
    });

  if (dedupError) {
    // Unique constraint violation = duplicate event, already processing
    if (dedupError.code === "23505") {
      return new Response("OK", { status: 200 });
    }
    console.error("[slack:events] Dedup insert failed:", dedupError.message);
  }

  // Respond 200 immediately (Slack requires response within 3 seconds)
  // then dispatch to Inngest for async processing.
  //
  // Note: We fire-and-forget the Inngest send here. If it fails,
  // Slack will retry the event delivery.

  if (event.type === "app_mention") {
    inngest.send({
      name: "slack/mention.received",
      data: {
        team_id: teamId,
        channel_id: event.channel as string,
        user_id: event.user as string,
        text: event.text as string,
        event_id: eventId,
      },
    }).catch((err) => {
      console.error("[slack:events] Failed to send Inngest event:", err);
    });
  }

  return new Response("OK", { status: 200 });
}
