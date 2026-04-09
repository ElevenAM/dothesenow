"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setActiveOrgId } from "@/lib/org-context";
import { getMembershipByUserId } from "@dothesenow/queries";

export async function switchOrg(orgId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const membership = await getMembershipByUserId(supabase, orgId, user.id);
  if (!membership) {
    throw new Error("You are not a member of this organization");
  }

  await setActiveOrgId(orgId);
  revalidatePath("/");
}

type CreateOrgResult =
  | { success: true; orgId: string; slug: string }
  | { error: string };

/**
 * Create an organization with owner membership and default department.
 * Uses admin client for privileged writes with manual rollback on failure.
 */
export async function createOrganization(
  orgName: string
): Promise<CreateOrgResult> {
  // Verify the caller's identity with their own session (not admin)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    return { error: "Organization name must contain at least one letter or number" };
  }

  const admin = createAdminClient();

  // Check slug uniqueness before insert
  const { data: existing } = await admin
    .from("dtn_organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return { error: "An organization with this name already exists. Try a different name." };
  }

  // INSERT org
  const { data: org, error: orgError } = await admin
    .from("dtn_organizations")
    .insert({ name: orgName, slug })
    .select("id, slug")
    .single();

  if (orgError) {
    return { error: orgError.message };
  }

  // INSERT membership (owner)
  const { error: memberError } = await admin
    .from("dtn_memberships")
    .insert({
      org_id: org.id,
      user_id: user.id,
      role: "owner",
      accepted_at: new Date().toISOString(),
    });

  if (memberError) {
    // Rollback: delete the org we just created
    const { error: rollbackError } = await admin
      .from("dtn_organizations")
      .delete()
      .eq("id", org.id);

    if (rollbackError) {
      console.error("Failed to rollback org creation:", rollbackError);
    }
    return { error: "Failed to create organization. Please try again." };
  }

  // INSERT default department
  const { error: deptError } = await admin
    .from("dtn_departments")
    .insert({
      org_id: org.id,
      slug: "marketing",
      name: "Marketing",
      icon: "megaphone",
    });

  if (deptError) {
    // Fatal: department is required for dashboard navigation
    console.error("Failed to create default department:", deptError);
    // Rollback: delete membership and org
    await admin.from("dtn_memberships").delete().eq("org_id", org.id);
    await admin.from("dtn_organizations").delete().eq("id", org.id);
    return { error: "Failed to create organization. Please try again." };
  }

  // Seed initial credits (50 for free tier) with an auditable ledger entry.
  // Non-fatal if it fails: the org row already has 50 via column DEFAULT.
  const { error: ledgerError } = await admin.from("dtn_credit_ledger").insert({
    org_id: org.id,
    amount: 50,
    balance_after: 50,
    reason: "Initial free-tier grant (50 credits)",
    status: "confirmed",
  });
  if (ledgerError) {
    console.error("Failed to insert initial credit ledger entry:", ledgerError);
  }

  // Set active org cookie
  await setActiveOrgId(org.id);

  return { success: true, orgId: org.id, slug: org.slug };
}
