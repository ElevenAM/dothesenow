import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getPendingInvitesForUser } from "@/lib/team/queries";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let ctx;
  try {
    ctx = await getAuthenticatedMembership();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Not authenticated") {
      redirect("/login");
    }
    redirect("/onboarding");
  }

  const { user, org, allOrgs } = ctx;

  // Get the first department for this org
  const supabase = await createClient();
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
        {org.planStatus === "past_due" && (
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
