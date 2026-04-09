import { authenticateApiRequest, apiResponse, apiError } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTaskById, updateTaskForOrg } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiRequest(request, "api_read");
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const ctx: OrgContext = { client: createAdminClient(), orgId: auth.orgId };
  const task = await getTaskById(ctx, id);

  if (!task) {
    return apiError("not_found", "Task not found", 404);
  }

  return apiResponse(task, { org_id: auth.orgId });
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
    const task = await updateTaskForOrg(ctx, id, body);
    return apiResponse(task, { org_id: auth.orgId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update task";
    if (message.includes("not found")) return apiError("not_found", message, 404);
    return apiError("internal_error", message, 500);
  }
}
