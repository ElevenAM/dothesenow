import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org-context";
import { getOrgIntegrations } from "@dothesenow/queries";
import { getAllExecutorMetadata } from "@/lib/executors/registry";
import { IntegrationCard } from "@/components/settings/integration-card";

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/onboarding");

  const ctx = { client: supabase, orgId };
  const integrations = await getOrgIntegrations(ctx);

  // Show executors that have config (BYOS/webhook) or are already connected
  const allMetadata = getAllExecutorMetadata();
  const configurableExecutors = allMetadata.filter(
    (m) =>
      m.configSchema.length > 0 ||
      integrations.some((i) => i.integration_type === m.type),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="mt-1 text-sm text-[var(--fgColor-muted)]">
          Connect third-party tools and bring your own subscriptions for content
          generation, automation, and more.
        </p>
      </div>

      {configurableExecutors.length === 0 ? (
        <p className="text-sm text-[var(--fgColor-muted)]">
          No integrations available. New executors will appear here as they are
          added.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {configurableExecutors.map((executor) => (
            <IntegrationCard
              key={executor.type}
              executor={executor}
              integration={
                integrations.find(
                  (i) => i.integration_type === executor.type,
                ) ?? null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
