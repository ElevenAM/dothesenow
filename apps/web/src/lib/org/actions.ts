"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setActiveOrgId } from "@/lib/org-context";

export async function switchOrg(orgId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  // Verify user has active membership in the target org
  const { data: membership } = await supabase
    .from("dtn_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .single();

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
    // Non-fatal: org and membership exist, department can be created later
    console.error("Failed to create default department:", deptError);
  }

  // Set active org cookie
  await setActiveOrgId(org.id);

  return { success: true, orgId: org.id, slug: org.slug };
}
