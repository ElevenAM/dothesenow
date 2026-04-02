import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getPendingInvitesForUser } from "@/lib/team/queries";

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

  // Get all active org memberships
  const { data: memberships } = await supabase
    .from("dtn_memberships")
    .select("org_id, role, dtn_organizations(id, name, slug, plan, plan_status)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  // Select current org from cookie, validated against active memberships
  const cookieStore = await cookies();
  const currentOrgCookie = cookieStore.get("dtn_current_org")?.value;

  let membership = memberships[0];
  if (currentOrgCookie) {
    const found = memberships.find((m) => m.org_id === currentOrgCookie);
    if (found) {
      membership = found;
    }
    // If cookie org isn't valid, we fall back to first membership (cookie stays stale but harmless)
  }

  const org = membership.dtn_organizations as unknown as {
    id: string;
    name: string;
    slug: string;
    plan: string;
    plan_status: string;
  };

  // Build allOrgs list for org switcher
  const allOrgs = memberships.map((m) => {
    const o = m.dtn_organizations as unknown as {
      id: string;
      name: string;
      slug: string;
    };
    return { id: o.id, name: o.name, slug: o.slug };
  });

  // Get the first department for this org
  const { data: departments } = await supabase
    .from("dtn_departments")
    .select("slug, name")
    .eq("org_id", org.id)
    .eq("is_active", true)
    .order("created_at")
    .limit(1);

  const dept = departments?.[0]?.slug || "marketing";

  // Check for pending invites
  const pendingInvites = user.email
    ? await getPendingInvitesForUser(user.email)
    : [];

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        dept={dept}
        orgName={org.name}
        allOrgs={allOrgs}
        currentOrgId={org.id}
      />
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
        {pendingInvites.length > 0 && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-medium text-blue-800">
              You have {pendingInvites.length} pending team{" "}
              {pendingInvites.length === 1 ? "invite" : "invites"}.
            </p>
            <Link
              href="/invites"
              className="text-sm font-semibold text-blue-900 underline underline-offset-2 hover:text-blue-700"
            >
              View invites
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
