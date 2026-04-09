import { authenticateApiRequest, apiResponse, apiError } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExperimentById, createExperimentResult } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import type { Json } from "@dothesenow/types";

export const dynamic = "force-dynamic";

export async function POST(
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

  // Verify experiment exists and belongs to this org
  const experiment = await getExperimentById(ctx, id);
  if (!experiment) {
    return apiError("not_found", "Experiment not found", 404);
  }

  try {
    const result = await createExperimentResult(ctx, {
      experiment_id: id,
      week_start: (body.week_start as string) ?? undefined,
      metrics: (body.metrics as Json) ?? undefined,
      metric_value: typeof body.metric_value === "number" ? body.metric_value : undefined,
      notes: (body.notes as string) ?? undefined,
    });

    return apiResponse(result, { org_id: auth.orgId }, 201);
  } catch (err) {
    return apiError("internal_error", err instanceof Error ? err.message : "Failed to record result", 500);
  }
}
