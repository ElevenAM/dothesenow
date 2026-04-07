import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

interface OrgOnboardingRow {
  slug: string;
  onboarding_completed_at: string | null;
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user already has an org
  const { data: membership } = await supabase
    .from("dtn_memberships")
    .select("org_id, dtn_organizations(slug, onboarding_completed_at)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membership) {
    const org = membership.dtn_organizations as unknown as OrgOnboardingRow | null;

    if (org?.onboarding_completed_at) {
      // Onboarding already complete — go to dashboard
      redirect("/");
    }

    // Org exists but onboarding not finished — resume at step 2
    return <OnboardingWizard resumeAtStep={2} existingSlug={org?.slug} />;
  }

  // No org — start from the beginning
  return <OnboardingWizard />;
}
