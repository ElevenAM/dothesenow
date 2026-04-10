"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readOAuthParamsCookie } from "@/app/api/mcp/oauth/authorize/route";
import { getMcpOAuthConfig } from "@/lib/mcp-oauth/config";
import { createAuthorizationCode } from "@/lib/mcp-oauth/codes";

const PARAMS_COOKIE = "dtn_mcp_oauth_params";
const RETURN_COOKIE = "dtn_oauth_return_to";

interface ConsentData {
  orgs?: Array<{ id: string; name: string; slug: string }>;
  scope?: string;
  redirectUri?: string;
  state?: string;
  error?: string;
}

/**
 * Load data needed for the consent page.
 * If user isn't authenticated, sets a return cookie so they come back after login.
 */
export async function getConsentData(): Promise<ConsentData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Store the return path so the callback route sends them back here
    const cookieStore = await cookies();
    cookieStore.set(RETURN_COOKIE, "/oauth/authorize", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600, // 10 minutes
    });
    return { error: "not_authenticated" };
  }

  // Read and verify OAuth params cookie
  let config: ReturnType<typeof getMcpOAuthConfig>;
  try {
    config = getMcpOAuthConfig();
  } catch {
    return { error: "OAuth is not configured on this server" };
  }

  const cookieStore = await cookies();
  const paramsCookie = cookieStore.get(PARAMS_COOKIE)?.value;
  const oauthParams = readOAuthParamsCookie(paramsCookie, config.paramsSecret);

  if (!oauthParams) {
    return { error: "Missing or expired authorization request. Please try connecting again from Claude." };
  }

  // Fetch user's org memberships
  const { data: memberships, error } = await supabase
    .from("dtn_memberships")
    .select("org_id, role, dtn_organizations(id, name, slug)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (error || !memberships || memberships.length === 0) {
    return { error: "No active workspace found. Please create or join a workspace first." };
  }

  const orgs = memberships.map((m: any) => ({
    id: m.dtn_organizations.id,
    name: m.dtn_organizations.name,
    slug: m.dtn_organizations.slug,
  }));

  return {
    orgs,
    scope: oauthParams.scope,
    redirectUri: oauthParams.redirect_uri,
    state: oauthParams.state,
  };
}

/**
 * User clicked "Authorize" — generate an auth code and return the redirect URL.
 */
export async function authorizeAction(
  orgId: string,
): Promise<{ redirect?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify the user is a member of the selected org
  const { data: membership } = await supabase
    .from("dtn_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) {
    return { error: "You are not a member of this workspace" };
  }

  // Read OAuth params cookie
  let config: ReturnType<typeof getMcpOAuthConfig>;
  try {
    config = getMcpOAuthConfig();
  } catch {
    return { error: "OAuth is not configured" };
  }

  const cookieStore = await cookies();
  const paramsCookie = cookieStore.get(PARAMS_COOKIE)?.value;
  const oauthParams = readOAuthParamsCookie(paramsCookie, config.paramsSecret);

  if (!oauthParams) {
    return { error: "Authorization session expired. Please try again from Claude." };
  }

  // Generate authorization code
  const adminClient = createAdminClient();
  const code = await createAuthorizationCode(adminClient, {
    clientId: oauthParams.client_id,
    userId: user.id,
    orgId,
    redirectUri: oauthParams.redirect_uri,
    codeChallenge: oauthParams.code_challenge,
    codeChallengeMethod: oauthParams.code_challenge_method,
    scopes: oauthParams.scope.split(" "),
  });

  // Clear the OAuth params cookie
  cookieStore.delete(PARAMS_COOKIE);

  // Build redirect URL with code
  const redirectUrl = new URL(oauthParams.redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (oauthParams.state) {
    redirectUrl.searchParams.set("state", oauthParams.state);
  }

  return { redirect: redirectUrl.toString() };
}
