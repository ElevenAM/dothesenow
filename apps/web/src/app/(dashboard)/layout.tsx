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
    if (message === "No active organization membership") {
      redirect("/onboarding");
    }
    // Transient errors (DB timeout, network failure, etc.) — don't silently
    // redirect to onboarding, surface the error instead.
    throw err;
  }

  const { user, org, allOrgs } = ctx;

  // Redirect to onboarding wizard if user hasn't completed it
  if (!org.onboardingCompletedAt) {
    redirect("/onboarding");
  }

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
    <div className="flex h-screen bg-muted">
      <Sidebar
        dept={dept}
        orgName={org.name}
        allOrgs={allOrgs}
        currentOrgId={org.id}
      />
      <main className="flex-1 overflow-auto p-6">
        {org.planStatus === "past_due" && (
          <div className="mb-4 rounded-md border border-[var(--label-yellow-fg)]/20 bg-[var(--label-yellow-bg)] px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--label-yellow-fg)]">
              Your payment failed. Update your payment method to keep premium
              features.
            </p>
            <Link
              href="/settings/billing"
              className="text-sm font-semibold text-[var(--label-yellow-fg)] underline underline-offset-2 hover:opacity-80"
            >
              Fix billing
            </Link>
          </div>
        )}
        {pendingInvites.length > 0 && (
          <div className="mb-4 rounded-md border border-[var(--label-blue-fg)]/20 bg-[var(--label-blue-bg)] px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--label-blue-fg)]">
              You have {pendingInvites.length} pending team{" "}
              {pendingInvites.length === 1 ? "invite" : "invites"}.
            </p>
            <Link
              href="/invites"
              className="text-sm font-semibold text-[var(--label-blue-fg)] underline underline-offset-2 hover:opacity-80"
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
