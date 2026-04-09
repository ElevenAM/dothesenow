import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/org-context";
import { exchangeCodeForToken, saveGAInstallation } from "@/lib/integrations/google-analytics/oauth";

export const dynamic = "force-dynamic";

const GA_STATE_COOKIE = "dtn_ga_oauth_state";

/**
 * Google Analytics OAuth callback handler.
 * Mirrors the Slack/HubSpot OAuth callback pattern.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    redirect("/settings/integrations?ga=cancelled");
  }

  if (!code || !state) {
    redirect("/settings/integrations?ga=error&reason=missing_params");
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get(GA_STATE_COOKIE)?.value;

  if (!savedState || savedState !== state) {
    redirect("/settings/integrations?ga=error&reason=invalid_state");
  }

  cookieStore.delete(GA_STATE_COOKIE);

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

    await saveGAInstallation(adminClient, orgId, tokenResponse, user.id);

    redirect("/settings/integrations?ga=connected");
  } catch (err) {
    console.error("[ga:oauth] Failed to complete OAuth:", err);
    redirect(
      `/settings/integrations?ga=error&reason=${encodeURIComponent(
        err instanceof Error ? err.message : "unknown",
      )}`,
    );
  }
}
