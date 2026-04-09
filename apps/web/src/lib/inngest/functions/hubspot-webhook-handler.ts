import { inngest } from "../client";

/**
 * Process inbound HubSpot webhook events.
 * For now, triggers an incremental sync for the affected org.
 * Will be enhanced with per-contact processing when HubSpot marketplace listing is active.
 */
export const hubspotWebhookHandler = inngest.createFunction(
  {
    id: "hubspot-webhook-handler",
    triggers: [{ event: "hubspot/webhook.received" }],
    concurrency: [{ limit: 1, key: "event.data.org_id", scope: "env" }],
    retries: 1,
  },
  async ({ event, step }) => {
    const { org_id, event_type, object_id } = event.data;

    // For contact events, trigger an incremental sync
    if (event_type.startsWith("contact")) {
      await step.sendEvent("trigger-incremental", {
        name: "hubspot/incremental-sync",
        data: { org_id },
      });

      return { action: "triggered_incremental_sync", event_type };
    }

    // Non-contact events are logged but not acted on yet
    return { action: "ignored", event_type };
  },
);
