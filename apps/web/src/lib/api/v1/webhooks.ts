/**
 * Webhook dispatch helper for REST API endpoints.
 * Fire-and-forget: queries active subscriptions and fans out delivery events via Inngest.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSubscriptionsForEvent } from "@dothesenow/queries";
import { inngest } from "@/lib/inngest/client";

/**
 * Emit webhook events for all active subscriptions matching the event type.
 * This is fire-and-forget — do NOT await it in the API response path.
 */
export async function emitWebhookEvent(
  orgId: string,
  eventType: string,
  payload: unknown,
): Promise<void> {
  try {
    const adminClient = createAdminClient();
    const subs = await getActiveSubscriptionsForEvent(adminClient, orgId, eventType);

    if (subs.length === 0) return;

    await inngest.send(
      subs.map((sub) => ({
        name: "webhook/deliver" as const,
        data: {
          subscription_id: sub.id,
          org_id: orgId,
          event_type: eventType,
          payload: payload as Record<string, unknown>,
          attempt: 0,
        },
      })),
    );
  } catch (err) {
    // Fire-and-forget: log but don't throw
    console.error(`[webhook:emit] Failed to emit ${eventType} for org ${orgId}:`, err);
  }
}
