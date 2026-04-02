import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
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

  // Get user's active org membership (include plan fields)
  const { data: memberships } = await supabase
    .from("dtn_memberships")
    .select("org_id, role, dtn_organizations(id, name, slug, plan, plan_status)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  // Use first org for now (org switcher comes in Phase 2)
  const membership = memberships[0];
  const org = membership.dtn_organizations as unknown as {
    id: string;
    name: string;
    slug: string;
    plan: string;
    plan_status: string;
  };

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
      <main className="flex-1 overflow-auto p-6">
        {org.plan_status === "past_due" && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-medium text-amber-800">
              Your payment failed. Update your payment method to keep premium
              features.
            </p>
            <Link
              href="/settings/billing"
              className="text-sm font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700"
            >
              Fix billing
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
