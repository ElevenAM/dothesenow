import type { OrgContext } from "./context.js";
import type { Membership, MemberRole } from "@dothesenow/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QueryError } from "./errors.js";

const TABLE = "dtn_memberships";

export interface MembershipWithProfile extends Membership {
  profile?: { display_name: string | null; email: string } | null;
}

export async function getMembershipsForOrg(
  ctx: OrgContext,
): Promise<MembershipWithProfile[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*, profile:profiles!dtn_memberships_user_id_fkey(display_name, email)")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: true });

  if (error) throw new QueryError(error.message, TABLE, "getMembershipsForOrg", ctx.orgId, error);
  return (data ?? []) as MembershipWithProfile[];
}

/**
 * Get a specific user's membership for the org.
 * Does not require OrgContext since the caller may be checking
 * membership before establishing context.
 */
export async function getMembershipByUserId(
  client: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<Membership | null> {
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new QueryError(error.message, TABLE, "getMembershipByUserId", orgId, error);
  return data as Membership | null;
}

export async function createMembership(
  ctx: OrgContext,
  membership: {
    user_id?: string | null;
    role?: MemberRole;
    invited_email?: string | null;
    invited_by?: string | null;
  },
): Promise<Membership> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .insert({
      ...membership,
      org_id: ctx.orgId,
      role: membership.role ?? "member",
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "createMembership", ctx.orgId, error);
  return data as Membership;
}

export async function updateMembershipRole(
  ctx: OrgContext,
  membershipId: string,
  role: MemberRole,
): Promise<Membership> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .update({ role })
    .eq("id", membershipId)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "updateMembershipRole", ctx.orgId, error);
  return data as Membership;
}

export interface MembershipWithSpecialties extends Membership {
  profile?: { display_name: string | null; email: string } | null;
}

/**
 * Get team members with their marketing specialties.
 * Used by the task decomposition engine for role-based assignment.
 */
export async function getTeamWithSpecialties(
  ctx: OrgContext,
): Promise<MembershipWithSpecialties[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*, profile:profiles!dtn_memberships_user_id_fkey(display_name, email)")
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .not("user_id", "is", null)
    .order("created_at", { ascending: true });

  if (error) throw new QueryError(error.message, TABLE, "getTeamWithSpecialties", ctx.orgId, error);
  return (data ?? []) as MembershipWithSpecialties[];
}

/**
 * Update marketing specialties for a team member.
 */
export async function updateMemberSpecialties(
  ctx: OrgContext,
  membershipId: string,
  specialties: string[],
): Promise<Membership> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .update({ specialties })
    .eq("id", membershipId)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "updateMemberSpecialties", ctx.orgId, error);
  return data as Membership;
}

export async function deactivateMembership(
  ctx: OrgContext,
  membershipId: string,
): Promise<Membership> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .update({ is_active: false })
    .eq("id", membershipId)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "deactivateMembership", ctx.orgId, error);
  return data as Membership;
}
