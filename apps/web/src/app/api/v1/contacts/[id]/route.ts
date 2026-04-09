import { authenticateApiRequest, apiResponse, apiError } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContactById, updateContact } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import { emitWebhookEvent } from "@/lib/api/v1/webhooks";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiRequest(request, "api_read");
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const ctx: OrgContext = { client: createAdminClient(), orgId: auth.orgId };
  const contact = await getContactById(ctx, id);

  if (!contact) {
    return apiError("not_found", "Contact not found", 404);
  }

  return apiResponse(contact, { org_id: auth.orgId });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiRequest(request, "api_write");
  if (auth instanceof Response) return auth;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const ctx: OrgContext = { client: createAdminClient(), orgId: auth.orgId };

  try {
    const contact = await updateContact(ctx, id, body);
    void emitWebhookEvent(auth.orgId, "contact.updated", contact);
    return apiResponse(contact, { org_id: auth.orgId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update contact";
    if (message.includes("not found")) return apiError("not_found", message, 404);
    return apiError("internal_error", message, 500);
  }
}
