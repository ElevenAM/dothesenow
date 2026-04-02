import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Get active members of an org with their email addresses.
 * Uses admin client to access auth.users email.
 */
export async function getOrgMembers(orgId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dtn_memberships")
    .select("id, org_id, user_id, role, accepted_at, created_at")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .not("user_id", "is", null)
    .order("created_at");

  if (error || !data) return [];

  // Fetch emails for each member from auth.users
  const memberIds = data.map((m) => m.user_id).filter(Boolean) as string[];
  const {
    data: { users },
  } = await admin.auth.admin.listUsers();

  const emailMap = new Map<string, string>();
  for (const u of users) {
    if (memberIds.includes(u.id)) {
      emailMap.set(u.id, u.email ?? "");
    }
  }

  return data.map((m) => ({
    ...m,
    email: emailMap.get(m.user_id!) ?? "",
  }));
}

/**
 * Get pending invites for an org (not yet accepted).
 */
export async function getPendingInvites(orgId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dtn_memberships")
    .select("id, org_id, invited_email, role, invited_by, invited_at")
    .eq("org_id", orgId)
    .is("user_id", null)
    .order("invited_at", { ascending: false });

  return data ?? [];
}

/**
 * Get pending invites addressed to a specific email (across all orgs).
 */
export async function getPendingInvitesForUser(email: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dtn_memberships")
    .select("id, org_id, invited_email, role, invited_at, dtn_organizations(id, name, slug)")
    .eq("invited_email", email.toLowerCase())
    .is("user_id", null)
    .order("invited_at", { ascending: false });

  return data ?? [];
}

/**
 * Count active members + pending invites for an org.
 */
export async function getMemberCount(orgId: string) {
  const admin = createAdminClient();
  const { count } = await admin
    .from("dtn_memberships")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .or("is_active.eq.true,user_id.is.null");

  return count ?? 0;
}
