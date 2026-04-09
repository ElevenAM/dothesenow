import { authenticateApiRequest, apiResponse, apiError } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { createWebhookSubscription } from "@dothesenow/queries";
import type { WebhookEventType } from "@dothesenow/types";

export const dynamic = "force-dynamic";

const VALID_EVENT_TYPES: WebhookEventType[] = [
  "task.created",
  "task.status_changed",
  "experiment.completed",
  "strategy.refined",
  "contact.created",
  "contact.updated",
];

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "webhooks");
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const eventType = body.event_type as string;
  const targetUrl = body.target_url as string;

  if (!eventType || !VALID_EVENT_TYPES.includes(eventType as WebhookEventType)) {
    return apiError(
      "validation_error",
      `event_type must be one of: ${VALID_EVENT_TYPES.join(", ")}`,
      422,
    );
  }

  if (!targetUrl || typeof targetUrl !== "string") {
    return apiError("validation_error", "target_url is required", 422);
  }

  // Basic URL validation
  try {
    new URL(targetUrl);
  } catch {
    return apiError("validation_error", "target_url must be a valid URL", 422);
  }

  const adminClient = createAdminClient();

  try {
    const { subscription, signingSecret } = await createWebhookSubscription(
      adminClient,
      auth.orgId,
      auth.keyId, // created_by references the key holder
      { event_type: eventType, target_url: targetUrl },
    );

    // Return the signing secret once — it cannot be retrieved again
    return apiResponse(
      {
        ...subscription,
        signing_secret: signingSecret,
      },
      { org_id: auth.orgId },
      201,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create subscription";
    if (message.includes("Maximum")) return apiError("conflict", message, 409);
    return apiError("internal_error", message, 500);
  }
}
