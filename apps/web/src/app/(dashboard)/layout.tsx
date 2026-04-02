import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's active org membership
  const { data: memberships } = await supabase
    .from("dtn_memberships")
    .select("org_id, role, dtn_organizations(id, name, slug)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  // Use first org for now (org switcher comes in Phase 2)
  const membership = memberships[0];
  const org = membership.dtn_organizations as unknown as { id: string; name: string; slug: string };

  // Get the first department for this org
  const { data: departments } = await supabase
    .from("dtn_departments")
    .select("slug, name")
    .eq("org_id", org.id)
    .eq("is_active", true)
    .order("created_at")
    .limit(1);

  const dept = departments?.[0]?.slug || "marketing";

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar dept={dept} orgName={org.name} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
