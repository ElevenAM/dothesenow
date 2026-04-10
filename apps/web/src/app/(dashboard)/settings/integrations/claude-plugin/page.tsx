import Link from "next/link";
import { getRequestContext } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getOrgApiKeys } from "@dothesenow/queries";
import { ApiKeyManager } from "@/components/settings/claude-plugin/api-key-manager";
import { SetupInstructions } from "@/components/settings/claude-plugin/setup-instructions";
import { CapabilityGrid } from "@/components/settings/claude-plugin/capability-grid";
import { ArrowLeft } from "lucide-react";

export default async function ClaudePluginPage() {
  const { membership } = await getRequestContext();
  const supabase = await createClient();
  const ctx = { client: supabase, orgId: membership.orgId };
  const apiKeys = await getOrgApiKeys(ctx);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.dothesenow.com";
  const mcpEndpoint = `${appUrl}/api/mcp`;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/settings/integrations"
          className="inline-flex items-center gap-1 text-xs text-[var(--fgColor-accent)] hover:underline mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Integrations
        </Link>
        <h1 className="text-2xl font-semibold">Claude Plugin</h1>
        <p className="mt-1 text-sm text-[var(--fgColor-muted)]">
          Connect Claude Code or Claude Desktop to your DoTheseNow workspace.
          Manage tasks, update strategies, query your CRM, and more — all from Claude.
        </p>
      </div>

      <ApiKeyManager initialKeys={apiKeys} />

      <hr className="border-[var(--borderColor-default)]" />

      <SetupInstructions mcpEndpoint={mcpEndpoint} />

      <hr className="border-[var(--borderColor-default)]" />

      <CapabilityGrid />
    </div>
  );
}
