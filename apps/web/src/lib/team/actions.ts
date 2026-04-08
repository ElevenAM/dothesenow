"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { setActiveOrgId } from "@/lib/org-context";
import { getMembershipByUserId } from "@dothesenow/queries";
import type { MemberRole } from "@dothesenow/types";

type ActionResult = { error: string } | { success: true };

/**
 * Invite a team member via email. Owner/admin only.
 * Uses atomic PL/pgSQL function for plan limit enforcement.
 */
export async function inviteTeamMember(
  email: string,
  role: "admin" | "member"
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await getAuthenticatedMembership(["owner", "admin"]);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authenticated" };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("check_and_insert_invite", {
    p_org_id: ctx.membership.orgId,
    p_email: email,
    p_role: role,
    p_invited_by: ctx.user.id,
  });

  if (error) {
    if (error.message.includes("idx_dtn_memberships_pending_unique")) {
      return { error: "This email has already been invited." };
    }
    return { error: error.message };
  }

  revalidatePath("/settings/team");
  return { success: true };
}

/**
 * Accept a pending invite. Authenticated user only.
 * Uses atomic PL/pgSQL function for email verification and plan limit re-check.
 */
export async function acceptInvite(membershipId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const { error } = await admin.rpc("check_and_accept_invite", {
    p_membership_id: membershipId,
    p_user_id: user.id,
    p_user_email: user.email,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

/**
 * Decline a pending invite. Authenticated user only.
 */
export async function declineInvite(membershipId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Verify this invite belongs to the caller's email
  const { data: invite } = await admin
    .from("dtn_memberships")
    .select("id, invited_email")
    .eq("id", membershipId)
    .is("user_id", null)
    .single();

  if (!invite) return { error: "Invite not found" };
  if (invite.invited_email?.toLowerCase() !== user.email.toLowerCase()) {
    return { error: "This invite was sent to a different email" };
  }

  await admin.from("dtn_memberships").delete().eq("id", membershipId);

  revalidatePath("/");
  return { success: true };
}

/**
 * Remove a member from the org. Owner/admin only.
 */
export async function removeMember(membershipId: string): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await getAuthenticatedMembership(["owner", "admin"]);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authenticated" };
  }

  const admin = createAdminClient();

  // Fetch the target membership
  const { data: target } = await admin
    .from("dtn_memberships")
    .select("id, org_id, user_id, role")
    .eq("id", membershipId)
    .eq("org_id", ctx.membership.orgId)
    .eq("is_active", true)
    .single();

  if (!target) return { error: "Member not found" };

  // Cannot remove the last owner
  if (target.role === "owner") {
    const { count } = await admin
      .from("dtn_memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.membership.orgId)
      .eq("role", "owner")
      .eq("is_active", true);

    if ((count ?? 0) <= 1) {
      return { error: "Cannot remove the last owner" };
    }
  }

  // Admins cannot remove owners
  if (ctx.membership.role === "admin" && target.role === "owner") {
    return { error: "Admins cannot remove owners" };
  }

  await admin
    .from("dtn_memberships")
    .update({ is_active: false })
    .eq("id", membershipId);

  revalidatePath("/settings/team");
  return { success: true };
}

/**
 * Update a member's role. Owner only.
 */
export async function updateMemberRole(
  membershipId: string,
  newRole: "admin" | "member"
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await getAuthenticatedMembership(["owner"]);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authenticated" };
  }

  const admin = createAdminClient();

  // Fetch target
  const { data: target } = await admin
    .from("dtn_memberships")
    .select("id, org_id, role")
    .eq("id", membershipId)
    .eq("org_id", ctx.membership.orgId)
    .eq("is_active", true)
    .single();

  if (!target) return { error: "Member not found" };

  // Cannot change the last owner's role
  if (target.role === "owner") {
    const { count } = await admin
      .from("dtn_memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.membership.orgId)
      .eq("role", "owner")
      .eq("is_active", true);

    if ((count ?? 0) <= 1) {
      return { error: "Cannot change the role of the last owner" };
    }
  }

  await admin
    .from("dtn_memberships")
    .update({ role: newRole })
    .eq("id", membershipId);

  revalidatePath("/settings/team");
  return { success: true };
}

/**
 * Cancel a pending invite. Owner/admin only.
 */
export async function cancelInvite(membershipId: string): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await getAuthenticatedMembership(["owner", "admin"]);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authenticated" };
  }

  const admin = createAdminClient();
  await admin
    .from("dtn_memberships")
    .delete()
    .eq("id", membershipId)
    .eq("org_id", ctx.membership.orgId)
    .is("user_id", null);

  revalidatePath("/settings/team");
  return { success: true };
}

/**
 * Update a member's marketing specialties. Owner/admin only.
 */
export async function updateSpecialties(
  membershipId: string,
  specialties: string[],
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await getAuthenticatedMembership(["owner", "admin"]);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authenticated" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("dtn_memberships")
    .update({ specialties })
    .eq("id", membershipId)
    .eq("org_id", ctx.membership.orgId);

  if (error) return { error: error.message };

  revalidatePath("/settings/team");
  return { success: true };
}

/**
 * Switch the active org. Sets an httpOnly cookie.
 */
export async function switchOrg(orgId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    const membership = await getMembershipByUserId(supabase, orgId, user.id);
    if (!membership) return { error: "No active membership in this organization" };
  } catch {
    return { error: "Failed to verify membership" };
  }

  await setActiveOrgId(orgId);

  revalidatePath("/");
  return { success: true };
}
