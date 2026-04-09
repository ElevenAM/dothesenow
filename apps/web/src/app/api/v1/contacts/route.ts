import { authenticateApiRequest, apiResponse, apiError } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContactsForOrg, createContact } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import { emitWebhookEvent } from "@/lib/api/v1/webhooks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "api_read");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const ctx: OrgContext = { client: createAdminClient(), orgId: auth.orgId };

  const filters: Record<string, unknown> = {
    page: url.searchParams.has("page") ? parseInt(url.searchParams.get("page")!, 10) : 1,
    pageSize: url.searchParams.has("pageSize") ? parseInt(url.searchParams.get("pageSize")!, 10) : 20,
  };
  if (url.searchParams.has("search")) filters.search = url.searchParams.get("search");
  if (url.searchParams.has("contact_type")) filters.contact_type = url.searchParams.get("contact_type");
  if (url.searchParams.has("status")) filters.status = url.searchParams.get("status");
  if (url.searchParams.has("lifecycle_stage")) filters.lifecycle_stage = url.searchParams.get("lifecycle_stage");

  const contacts = await getContactsForOrg(ctx, filters as Parameters<typeof getContactsForOrg>[1]);

  return apiResponse(contacts, { org_id: auth.orgId });
}

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "api_write");
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if (!body.first_name || typeof body.first_name !== "string") {
    return apiError("validation_error", "first_name is required", 422);
  }

  const ctx: OrgContext = { client: createAdminClient(), orgId: auth.orgId };

  try {
    const contact = await createContact(ctx, body as unknown as Parameters<typeof createContact>[1]);

    void emitWebhookEvent(auth.orgId, "contact.created", contact);
    return apiResponse(contact, { org_id: auth.orgId }, 201);
  } catch (err) {
    return apiError("internal_error", err instanceof Error ? err.message : "Failed to create contact", 500);
  }
}
