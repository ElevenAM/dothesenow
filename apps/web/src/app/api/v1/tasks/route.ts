import { authenticateApiRequest, apiResponse, apiError } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTasksForOrg, createTaskForOrg } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import { emitWebhookEvent } from "@/lib/api/v1/webhooks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "api_read");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const ctx: OrgContext = { client: createAdminClient(), orgId: auth.orgId };

  const filters: Record<string, unknown> = {};
  if (url.searchParams.has("status")) filters.status = url.searchParams.get("status");
  if (url.searchParams.has("priority")) filters.priority = url.searchParams.get("priority");
  if (url.searchParams.has("date_from")) filters.date_from = url.searchParams.get("date_from");
  if (url.searchParams.has("date_to")) filters.date_to = url.searchParams.get("date_to");
  if (url.searchParams.has("search")) filters.search = url.searchParams.get("search");

  const tasks = await getTasksForOrg(ctx, filters as Parameters<typeof getTasksForOrg>[1]);

  return apiResponse(tasks, { org_id: auth.orgId });
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

  if (!body.title || typeof body.title !== "string") {
    return apiError("validation_error", "title is required", 422);
  }

  const ctx: OrgContext = { client: createAdminClient(), orgId: auth.orgId };

  try {
    const task = await createTaskForOrg(ctx, body as unknown as Parameters<typeof createTaskForOrg>[1]);

    void emitWebhookEvent(auth.orgId, "task.created", task);
    return apiResponse(task, { org_id: auth.orgId }, 201);
  } catch (err) {
    return apiError("internal_error", err instanceof Error ? err.message : "Failed to create task", 500);
  }
}
