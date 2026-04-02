import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardRoot() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get user's first org
  const { data: memberships } = await supabase
    .from("dtn_memberships")
    .select("org_id, dtn_organizations(id)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const orgId = memberships[0].org_id;

  // Get first department
  const { data: departments } = await supabase
    .from("dtn_departments")
    .select("slug")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at")
    .limit(1);

  const dept = departments?.[0]?.slug || "marketing";
  redirect(`/${dept}`);
}
