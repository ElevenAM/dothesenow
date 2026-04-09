import { authenticateApiRequest, apiResponse, apiError } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/webhooks/test/:id — Send a test event to a webhook subscription.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiRequest(request, "webhooks");
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const adminClient = createAdminClient();

  // Verify subscription exists and belongs to this org
  const { data: sub, error } = await adminClient
    .from("dtn_webhook_subscriptions")
    .select("id, event_type, is_active")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .single();

  if (error || !sub) {
    return apiError("not_found", "Webhook subscription not found", 404);
  }

  if (!sub.is_active) {
    return apiError("conflict", "Webhook subscription is inactive", 409);
  }

  // Send a test event
  await inngest.send({
    name: "webhook/deliver",
    data: {
      subscription_id: sub.id,
      org_id: auth.orgId,
      event_type: sub.event_type,
      payload: {
        _test: true,
        event_type: sub.event_type,
        timestamp: new Date().toISOString(),
        message: "This is a test webhook delivery from DoTheseNow.",
      },
      attempt: 0,
    },
  });

  return apiResponse(
    { sent: true, event_type: sub.event_type },
    { org_id: auth.orgId },
  );
}
