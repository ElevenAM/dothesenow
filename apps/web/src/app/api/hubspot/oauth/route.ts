import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/org-context";
import { exchangeCodeForToken, saveHubSpotInstallation } from "@/lib/hubspot/oauth";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";

const HUBSPOT_STATE_COOKIE = "dtn_hubspot_oauth_state";

/**
 * HubSpot OAuth callback handler.
 * Mirrors the Slack OAuth callback pattern.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    redirect("/settings/integrations?hubspot=cancelled");
  }

  if (!code || !state) {
    redirect("/settings/integrations?hubspot=error&reason=missing_params");
  }

  // Validate CSRF state cookie
  const cookieStore = await cookies();
  const savedState = cookieStore.get(HUBSPOT_STATE_COOKIE)?.value;

  if (!savedState || savedState !== state) {
    redirect("/settings/integrations?hubspot=error&reason=invalid_state");
  }

  cookieStore.delete(HUBSPOT_STATE_COOKIE);

  // Verify user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirect=/settings/integrations");
  }

  const orgId = await getActiveOrgId();
  if (!orgId) {
    redirect("/onboarding");
  }

  try {
    const tokenResponse = await exchangeCodeForToken(code);
    const adminClient = createAdminClient();

    await saveHubSpotInstallation(adminClient, orgId, tokenResponse, user.id);

    // Trigger initial sync
    await inngest.send({
      name: "hubspot/initial-sync.requested",
      data: { org_id: orgId },
    });

    redirect("/settings/integrations?hubspot=connected");
  } catch (err) {
    console.error("[hubspot:oauth] Failed to complete OAuth:", err);
    redirect(
      `/settings/integrations?hubspot=error&reason=${encodeURIComponent(
        err instanceof Error ? err.message : "unknown",
      )}`,
    );
  }
}
