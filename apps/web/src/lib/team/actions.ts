"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { error: string } | { success: true };

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function getCallerMembership(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const cookieStore = await cookies();
  const currentOrgCookie = cookieStore.get("dtn_current_org")?.value;

  let query = supabase
    .from("dtn_memberships")
    .select("id, org_id, role, dtn_organizations(id, name, slug, plan, plan_status)")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (currentOrgCookie) {
    query = query.eq("org_id", currentOrgCookie);
  }

  const { data } = await query.limit(1).single();
  return data;
}

/**
 * Invite a team member via email. Owner/admin only.
 * Uses atomic PL/pgSQL function for plan limit enforcement.
 */
export async function inviteTeamMember(
  email: string,
  role: "admin" | "member"
): Promise<ActionResult> {
  const { user } = await getAuthenticatedUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const membership = await getCallerMembership(supabase, user.id);
  if (!membership) return { error: "No active organization membership" };

  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can invite members" };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("check_and_insert_invite", {
    p_org_id: membership.org_id,
    p_email: email,
    p_role: role,
    p_invited_by: user.id,
  });

  if (error) {
    // PL/pgSQL exceptions come back as error.message
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
  const { user } = await getAuthenticatedUser();
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
  const { user } = await getAuthenticatedUser();
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
  const { user } = await getAuthenticatedUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const callerMembership = await getCallerMembership(supabase, user.id);
  if (!callerMembership) return { error: "No active organization membership" };

  if (callerMembership.role !== "owner" && callerMembership.role !== "admin") {
    return { error: "Only owners and admins can remove members" };
  }

  const admin = createAdminClient();

  // Fetch the target membership
  const { data: target } = await admin
    .from("dtn_memberships")
    .select("id, org_id, user_id, role")
    .eq("id", membershipId)
    .eq("org_id", callerMembership.org_id)
    .eq("is_active", true)
    .single();

  if (!target) return { error: "Member not found" };

  // Cannot remove the last owner
  if (target.role === "owner") {
    const { count } = await admin
      .from("dtn_memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", callerMembership.org_id)
      .eq("role", "owner")
      .eq("is_active", true);

    if ((count ?? 0) <= 1) {
      return { error: "Cannot remove the last owner" };
    }
  }

  // Admins cannot remove owners
  if (callerMembership.role === "admin" && target.role === "owner") {
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
  const { user } = await getAuthenticatedUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const callerMembership = await getCallerMembership(supabase, user.id);
  if (!callerMembership) return { error: "No active organization membership" };

  if (callerMembership.role !== "owner") {
    return { error: "Only owners can change member roles" };
  }

  const admin = createAdminClient();

  // Fetch target
  const { data: target } = await admin
    .from("dtn_memberships")
    .select("id, org_id, role")
    .eq("id", membershipId)
    .eq("org_id", callerMembership.org_id)
    .eq("is_active", true)
    .single();

  if (!target) return { error: "Member not found" };

  // Cannot change the last owner's role
  if (target.role === "owner") {
    const { count } = await admin
      .from("dtn_memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", callerMembership.org_id)
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
  const { user } = await getAuthenticatedUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const callerMembership = await getCallerMembership(supabase, user.id);
  if (!callerMembership) return { error: "No active organization membership" };

  if (callerMembership.role !== "owner" && callerMembership.role !== "admin") {
    return { error: "Only owners and admins can cancel invites" };
  }

  const admin = createAdminClient();
  await admin
    .from("dtn_memberships")
    .delete()
    .eq("id", membershipId)
    .eq("org_id", callerMembership.org_id)
    .is("user_id", null);

  revalidatePath("/settings/team");
  return { success: true };
}

/**
 * Switch the active org. Sets an httpOnly cookie.
 */
export async function switchOrg(orgId: string): Promise<ActionResult> {
  const { user } = await getAuthenticatedUser();
  if (!user) return { error: "Not authenticated" };

  // Verify user has active membership in this org
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("dtn_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .single();

  if (!membership) return { error: "No active membership in this organization" };

  const cookieStore = await cookies();
  cookieStore.set("dtn_current_org", orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  revalidatePath("/");
  return { success: true };
}
