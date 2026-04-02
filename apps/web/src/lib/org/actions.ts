"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
