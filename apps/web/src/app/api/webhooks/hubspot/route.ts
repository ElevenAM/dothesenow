import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { createHmac, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

/**
 * HubSpot webhook receiver.
 * Verifies signature, deduplicates events, and emits Inngest events.
 * Future-proofing for HubSpot marketplace listing.
 */
export async function POST(request: Request) {
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientSecret) {
    return new Response(
      JSON.stringify({ error: "HubSpot not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // Verify HubSpot signature (v3)
  const signature = request.headers.get("x-hubspot-signature-v3");
  const timestamp = request.headers.get("x-hubspot-request-timestamp");
  const body = await request.text();

  if (!signature || !timestamp) {
    return new Response(
      JSON.stringify({ error: "Missing signature headers" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const sourceString = `${request.method}${request.url}${body}${timestamp}`;
  const expectedSig = createHmac("sha256", clientSecret)
    .update(sourceString)
    .digest("base64");

  const sigBuf = Buffer.from(signature, "base64");
  const expBuf = Buffer.from(expectedSig, "base64");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return new Response(
      JSON.stringify({ error: "Invalid signature" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Reject timestamps older than 5 minutes
  const parsedTimestamp = parseInt(timestamp, 10);
  if (isNaN(parsedTimestamp)) {
    return new Response(
      JSON.stringify({ error: "Invalid timestamp" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  const age = Date.now() - parsedTimestamp;
  if (age > 5 * 60 * 1000) {
    return new Response(
      JSON.stringify({ error: "Timestamp too old" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let events: Array<{
    eventId?: string;
    subscriptionType?: string;
    objectId?: number;
    portalId?: number;
  }>;

  try {
    events = JSON.parse(body);
    if (!Array.isArray(events)) events = [events];
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createAdminClient();

  for (const event of events) {
    const eventId = String(event.eventId ?? `${event.subscriptionType}_${event.objectId}_${Date.now()}`);
    const portalId = String(event.portalId ?? "");

    // Look up org by hub_id in dtn_org_integrations
    const { data: integration } = await supabase
      .from("dtn_org_integrations")
      .select("org_id")
      .eq("integration_type", "hubspot")
      .eq("is_active", true)
      .filter("config->>hub_id", "eq", portalId)
      .maybeSingle();

    if (!integration) continue;

    const orgId = integration.org_id;

    // Dedup via dtn_hubspot_events (23505 = unique_violation)
    const { error: insertError } = await supabase
      .from("dtn_hubspot_events")
      .insert({
        org_id: orgId,
        event_id: eventId,
        event_type: event.subscriptionType ?? "unknown",
        object_id: event.objectId ? String(event.objectId) : null,
      });

    if (insertError?.code === "23505") continue; // Already processed

    // Emit Inngest event
    await inngest.send({
      name: "hubspot/webhook.received",
      data: {
        org_id: orgId,
        event_type: event.subscriptionType ?? "unknown",
        object_id: event.objectId ? String(event.objectId) : "",
        event_id: eventId,
      },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
