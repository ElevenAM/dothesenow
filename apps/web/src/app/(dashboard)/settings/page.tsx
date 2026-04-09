import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { getOrgById } from "@dothesenow/queries";
import { OrgSettingsForm } from "@/components/settings/org-settings-form";

export default async function SettingsPage() {
  const { auth, ctx } = await getAuthenticatedOrgContext();
  const fullOrg = await getOrgById(ctx.client, auth.org.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">General</h1>
        <p className="mt-1 text-sm text-[var(--fgColor-muted)]">
          Manage your organization settings and profile.
        </p>
      </div>

      <OrgSettingsForm
        org={{
          name: fullOrg?.name ?? auth.org.name,
          slug: fullOrg?.slug ?? auth.org.slug,
          industry: fullOrg?.industry ?? auth.org.industry,
          budgetTier: fullOrg?.budget_tier ?? auth.org.budgetTier,
          timezone: fullOrg?.timezone ?? null,
        }}
      />
    </div>
  );
}
