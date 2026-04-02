import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId, setActiveOrgId } from "@/lib/org-context";
import type { User } from "@supabase/supabase-js";

export type OrgRole = "owner" | "admin" | "member";

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
      "id, org_id, role, dtn_organizations(id, name, slug, plan, plan_status)"
    )
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (error || !memberships || memberships.length === 0) {
    throw new Error("No active organization membership");
  }

  // Determine which org to use: prefer cookie, fall back to first
  const activeOrgId = await getActiveOrgId();
  let membership = activeOrgId
    ? memberships.find((m) => m.org_id === activeOrgId)
    : undefined;

  if (!membership) {
    membership = memberships[0];
    // Sync cookie to actual org when the cookie was stale or missing
    await setActiveOrgId(membership.org_id);
  }

  const org = membership.dtn_organizations as unknown as {
    id: string;
    name: string;
    slug: string;
    plan: string;
    plan_status: string;
  };

  const role = membership.role as OrgRole;

  // Enforce role requirement if specified
  if (requiredRoles && !requiredRoles.includes(role)) {
    throw new Error(
      `This action requires one of these roles: ${requiredRoles.join(", ")}`
    );
  }

  // Build allOrgs array for org switcher
  const allOrgs = memberships.map((m) => {
    const mOrg = m.dtn_organizations as unknown as {
      id: string;
      name: string;
      slug: string;
    };
    return {
      id: mOrg.id,
      name: mOrg.name,
      slug: mOrg.slug,
      role: m.role as OrgRole,
    };
  });

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
    },
    allOrgs,
  };
}
