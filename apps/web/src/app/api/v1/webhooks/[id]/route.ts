import { authenticateApiRequest, apiResponse, apiError } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteWebhookSubscription } from "@dothesenow/queries";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiRequest(request, "webhooks");
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const adminClient = createAdminClient();

  try {
    await deleteWebhookSubscription(adminClient, auth.orgId, id);
    return apiResponse({ deleted: true }, { org_id: auth.orgId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete subscription";
    return apiError("internal_error", message, 500);
  }
}
