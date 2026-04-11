import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: { absolute: "DoTheseNow — AI-Powered Marketing Operations" },
  description:
    "AI turns your marketing strategy into today's tasks — then executes them for you. Strategy in. Daily tasks out. Results back.",
};

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

export default async function HomePage() {
  try {
    const ctx = await getAuthenticatedMembership();
    if (!ctx.org.onboardingCompletedAt) {
      redirect("/onboarding");
    }
    const dept = await getCachedDeptSlug(ctx.org.id);
    redirect(`/${dept}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "No active organization membership") {
      redirect("/onboarding");
    }
    // Not authenticated — show landing page
    return <LandingPage />;
  }
}
