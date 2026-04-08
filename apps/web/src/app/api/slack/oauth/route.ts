import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/org-context";
import { exchangeCodeForToken, saveSlackInstallation } from "@/lib/slack/oauth";

export const dynamic = "force-dynamic";

const SLACK_STATE_COOKIE = "dtn_slack_oauth_state";

/**
 * Slack OAuth callback handler.
 * Receives the authorization code, exchanges it for a bot token,
 * and saves the installation linked to the user's active org.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Handle user denial
  if (error) {
    redirect("/settings/integrations?slack=cancelled");
  }

  if (!code || !state) {
    redirect("/settings/integrations?slack=error&reason=missing_params");
  }

  // Validate CSRF state cookie
  const cookieStore = await cookies();
  const savedState = cookieStore.get(SLACK_STATE_COOKIE)?.value;

  if (!savedState || savedState !== state) {
    redirect("/settings/integrations?slack=error&reason=invalid_state");
  }

  // Clear state cookie
  cookieStore.delete(SLACK_STATE_COOKIE);

  // Verify user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirect=/settings/integrations");
  }

  // Get active org
  const orgId = await getActiveOrgId();
  if (!orgId) {
    redirect("/onboarding");
  }

  try {
    const tokenResponse = await exchangeCodeForToken(code);
    const adminClient = createAdminClient();

    await saveSlackInstallation(adminClient, orgId, tokenResponse, user.id);

    redirect("/settings/integrations?slack=connected");
  } catch (err) {
    console.error("[slack:oauth] Failed to complete OAuth:", err);
    redirect(
      `/settings/integrations?slack=error&reason=${encodeURIComponent(
        err instanceof Error ? err.message : "unknown",
      )}`,
    );
  }
}
