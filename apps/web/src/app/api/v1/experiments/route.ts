import { authenticateApiRequest, apiResponse } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExperimentsForOrg } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "api_read");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const ctx: OrgContext = { client: createAdminClient(), orgId: auth.orgId };

  const filters: Record<string, unknown> = {};
  if (url.searchParams.has("status")) filters.status = url.searchParams.get("status");
  if (url.searchParams.has("strategy_section_ref")) filters.strategy_section_ref = url.searchParams.get("strategy_section_ref");

  const experiments = await getExperimentsForOrg(ctx, filters as Parameters<typeof getExperimentsForOrg>[1]);

  return apiResponse(experiments, { org_id: auth.orgId });
}
