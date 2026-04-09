import { authenticateApiRequest, apiResponse, apiError } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExperimentById } from "@dothesenow/queries";
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
  const experiment = await getExperimentById(ctx, id);

  if (!experiment) {
    return apiError("not_found", "Experiment not found", 404);
  }

  return apiResponse(experiment, { org_id: auth.orgId });
}
