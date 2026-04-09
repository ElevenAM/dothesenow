import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org-context";
import type { User } from "@supabase/supabase-js";
import type { OrgContext } from "@dothesenow/queries";

export type OrgRole = "owner" | "admin" | "member";

/** Shape returned by the dtn_organizations join in the memberships query. */
interface OrgJoinRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  plan_status: string;
  industry: string | null;
  budget_tier: string | null;
  product_description: string | null;
  value_proposition: string | null;
  website_url: string | null;
  target_customer: string | null;
  onboarding_completed_at: string | null;
  ai_credits_remaining: number;
  timezone: string | null;
}

/** Shape of a single membership row with its org join. */
interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  dtn_organizations: OrgJoinRow;
}

export interface AuthenticatedMembership {
  user: User;
  membership: {
    id: string;
    orgId: string;
    role: OrgRole;
  };
  org: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    planStatus: string;
    industry: string | null;
    budgetTier: string | null;
    productDescription: string | null;
    valueProposition: string | null;
    websiteUrl: string | null;
    targetCustomer: string | null;
    onboardingCompletedAt: string | null;
    creditsRemaining: number;
    timezone: string | null;
  };
  allOrgs: Array<{
    id: string;
    name: string;
    slug: string;
    role: OrgRole;
  }>;
}

/**
 * Authenticate the current user and resolve their active org membership.
 * Reads the `dtn_active_org` cookie; falls back to first org if invalid.
 * Optionally enforces a role requirement.
 *
 * Used by server actions, server components, and API routes as the single
 * source of truth for auth + org context.
 */
export async function getAuthenticatedMembership(
  requiredRoles?: OrgRole[]
): Promise<AuthenticatedMembership> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  // Fetch all active memberships with org data
  const { data: memberships, error } = await supabase
    .from("dtn_memberships")
    .select(
      "id, org_id, role, dtn_organizations(id, name, slug, plan, plan_status, industry, budget_tier, product_description, value_proposition, website_url, target_customer, onboarding_completed_at, ai_credits_remaining, timezone)"
    )
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (error || !memberships || memberships.length === 0) {
    throw new Error("No active organization membership");
  }

  // Cast once at the boundary — matches the .select() column list above
  const typedMemberships = memberships as unknown as MembershipRow[];

  // Determine which org to use: prefer cookie, fall back to first.
  // Note: no cookie writes here — safe to call from Server Components.
  // Cookie sync happens in server actions (switchOrg, createOrganization).
  const activeOrgId = await getActiveOrgId();
  const membership =
    (activeOrgId
      ? typedMemberships.find((m) => m.org_id === activeOrgId)
      : undefined) ?? typedMemberships[0];

  const org = membership.dtn_organizations;
  const role = membership.role as OrgRole;

  // Enforce role requirement if specified
  if (requiredRoles && !requiredRoles.includes(role)) {
    throw new Error(
      `This action requires one of these roles: ${requiredRoles.join(", ")}`
    );
  }

  // Build allOrgs array for org switcher
  const allOrgs = typedMemberships.map((m) => ({
    id: m.dtn_organizations.id,
    name: m.dtn_organizations.name,
    slug: m.dtn_organizations.slug,
    role: m.role as OrgRole,
  }));

  return {
    user,
    membership: {
      id: membership.id,
      orgId: org.id,
      role,
    },
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      planStatus: org.plan_status,
      industry: org.industry,
      budgetTier: org.budget_tier,
      productDescription: org.product_description,
      valueProposition: org.value_proposition,
      websiteUrl: org.website_url,
      targetCustomer: org.target_customer,
      onboardingCompletedAt: org.onboarding_completed_at,
      creditsRemaining: org.ai_credits_remaining,
      timezone: org.timezone,
    },
    allOrgs,
  };
}

/**
 * Authenticate and return both the membership context and a ready-to-use
 * OrgContext for shared query functions from @dothesenow/queries.
 */
export async function getAuthenticatedOrgContext(
  requiredRoles?: OrgRole[],
): Promise<{ auth: AuthenticatedMembership; ctx: OrgContext }> {
  const auth = await getAuthenticatedMembership(requiredRoles);
  const client = await createClient();
  return { auth, ctx: { client, orgId: auth.membership.orgId } };
}

/**
 * Request-scoped cached version of getAuthenticatedMembership.
 * Deduplicates within a single RSC render tree (layout + page + nested server components).
 * Does NOT cache across server actions or API routes.
 */
export const getRequestContext = cache(getAuthenticatedMembership);

// --- Membership state helpers ---

export type MembershipState = "pending" | "active" | "inactive";

export function getMembershipState(m: {
  user_id: string | null;
  is_active: boolean;
}): MembershipState {
  if (!m.is_active) return "inactive";
  if (m.user_id === null) return "pending";
  return "active";
}
