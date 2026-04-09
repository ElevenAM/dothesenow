import { authenticateApiRequest, apiResponse } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { listWebhookSubscriptions } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "api_read");
  if (auth instanceof Response) return auth;

  const ctx: OrgContext = { client: createAdminClient(), orgId: auth.orgId };
  const subscriptions = await listWebhookSubscriptions(ctx);

  return apiResponse(subscriptions, { org_id: auth.orgId });
}
