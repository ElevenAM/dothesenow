import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org-context";
import { getOrgIntegrations, getOrgApiKeys } from "@dothesenow/queries";
import { getAllExecutorMetadata } from "@/lib/executors/registry";
import { IntegrationCard } from "@/components/settings/integration-card";
import { SlackIntegrationCard } from "@/components/settings/slack-integration-card";
import { ClaudePluginCard } from "@/components/settings/claude-plugin-card";

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/onboarding");

  const ctx = { client: supabase, orgId };
  const integrations = await getOrgIntegrations(ctx);

  // Fetch Slack installation for the card
  const slackIntegration = integrations.find(
    (i) => i.integration_type === "slack",
  ) ?? null;

  const slackTeamName = slackIntegration?.is_active
    ? ((slackIntegration.config as Record<string, unknown>)?.team_name as string) ?? null
    : null;

  // Fetch API keys for Claude Plugin card
  const apiKeys = await getOrgApiKeys(ctx);
  const claudeLastUsed = apiKeys.reduce<string | null>((latest, key) => {
    if (!key.last_used_at) return latest;
    if (!latest) return key.last_used_at;
    return new Date(key.last_used_at) > new Date(latest) ? key.last_used_at : latest;
  }, null);

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

      <div className="grid gap-4 sm:grid-cols-2">
        <ClaudePluginCard
          keyCount={apiKeys.length}
          lastUsed={claudeLastUsed}
        />
        <SlackIntegrationCard
          integration={slackIntegration}
          teamName={slackTeamName}
        />
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
    </div>
  );
}
