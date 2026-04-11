import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardClientShell } from "@/components/dashboard/dashboard-client-shell";
import { NavigationProgress } from "@/components/navigation-progress";
import { DashboardPrefetcher } from "@/components/dashboard/dashboard-prefetcher";
import { IdentifyUser } from "@/components/providers/identify-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";

const getCachedDeptSlug = unstable_cache(
  async (orgId: string) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("dtn_departments")
      .select("slug")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("created_at")
      .limit(1);
    return data?.[0]?.slug || "marketing";
  },
  ["dept-slug"],
  { revalidate: 120, tags: ["departments"] },
);

const getCachedPendingInvites = unstable_cache(
  async (email: string) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("dtn_memberships")
      .select("id")
      .eq("invited_email", email)
      .is("user_id", null)
      .eq("is_active", true);
    return data ?? [];
  },
  ["pending-invites"],
  { revalidate: 60, tags: ["invites"] },
);

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
    throw err;
  }

  const { user, org, allOrgs } = ctx;

  if (!org.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const [dept, pendingInvites] = await Promise.all([
    getCachedDeptSlug(org.id),
    user.email ? getCachedPendingInvites(user.email) : [],
  ]);

  return (
    <DashboardClientShell initialCredits={org.creditsRemaining}>
      <IdentifyUser userId={user.id} email={user.email ?? null} orgId={org.id} orgName={org.name} />
      <div className="flex h-screen bg-muted">
      <NavigationProgress />
      <DashboardPrefetcher dept={dept} />
      <Sidebar
        dept={dept}
        orgName={org.name}
        allOrgs={allOrgs}
        currentOrgId={org.id}
        plan={org.plan}
        role={ctx.membership.role}
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
    </DashboardClientShell>
  );
}
