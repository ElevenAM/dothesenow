"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, Check, Terminal, Monitor, Users } from "lucide-react";

interface SetupInstructionsProps {
  mcpEndpoint: string;
}

export function SetupInstructions({ mcpEndpoint }: SetupInstructionsProps) {
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const claudeCodeConfig = JSON.stringify(
    {
      mcpServers: {
        dothesenow: {
          url: mcpEndpoint,
          headers: {
            Authorization: "Bearer YOUR_API_KEY",
          },
        },
      },
    },
    null,
    2,
  );

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        dothesenow: {
          url: mcpEndpoint,
          headers: {
            Authorization: "Bearer YOUR_API_KEY",
          },
        },
      },
    },
    null,
    2,
  );

  const claudeCoworkConfig = JSON.stringify(
    {
      mcpServers: {
        dothesenow: {
          url: mcpEndpoint,
          headers: {
            Authorization: "Bearer YOUR_API_KEY",
          },
        },
      },
    },
    null,
    2,
  );

  function handleCopy(text: string, tab: string) {
    navigator.clipboard.writeText(text);
    setCopiedTab(tab);
    setTimeout(() => setCopiedTab(null), 2000);
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">Setup Instructions</h3>
        <p className="text-xs text-[var(--fgColor-muted)]">
          Add this config to your Claude settings. Replace{" "}
          <code className="rounded bg-[var(--bgColor-muted)] px-1 py-0.5 text-[11px]">
            YOUR_API_KEY
          </code>{" "}
          with the key you generated above.
        </p>
      </div>

      <Tabs defaultValue="claude-code">
        <TabsList variant="line">
          <TabsTrigger value="claude-code">
            <Terminal className="mr-1.5 h-3.5 w-3.5" data-icon="inline-start" />
            Claude Code
          </TabsTrigger>
          <TabsTrigger value="claude-desktop">
            <Monitor className="mr-1.5 h-3.5 w-3.5" data-icon="inline-start" />
            Claude Desktop
          </TabsTrigger>
          <TabsTrigger value="claude-cowork">
            <Users className="mr-1.5 h-3.5 w-3.5" data-icon="inline-start" />
            Claude Cowork
          </TabsTrigger>
        </TabsList>

        <TabsContent value="claude-code" className="mt-3 space-y-2">
          <p className="text-xs text-[var(--fgColor-muted)]">
            Add to your project&apos;s <code className="rounded bg-[var(--bgColor-muted)] px-1 py-0.5 text-[11px]">.claude/settings.json</code>{" "}
            or global settings:
          </p>
          <div className="relative">
            <pre className="rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-4 text-xs font-mono overflow-x-auto">
              {claudeCodeConfig}
            </pre>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2"
              onClick={() => handleCopy(claudeCodeConfig, "code")}
            >
              {copiedTab === "code" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="claude-desktop" className="mt-3 space-y-2">
          <p className="text-xs text-[var(--fgColor-muted)]">
            Add to your{" "}
            <code className="rounded bg-[var(--bgColor-muted)] px-1 py-0.5 text-[11px]">
              claude_desktop_config.json
            </code>:
          </p>
          <ul className="list-disc pl-4 text-xs text-[var(--fgColor-muted)] space-y-1">
            <li>
              macOS: <code className="rounded bg-[var(--bgColor-muted)] px-1 py-0.5 text-[11px]">~/Library/Application Support/Claude/claude_desktop_config.json</code>
            </li>
            <li>
              Windows: <code className="rounded bg-[var(--bgColor-muted)] px-1 py-0.5 text-[11px]">%APPDATA%\Claude\claude_desktop_config.json</code>
            </li>
          </ul>
          <div className="relative">
            <pre className="rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-4 text-xs font-mono overflow-x-auto">
              {claudeDesktopConfig}
            </pre>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2"
              onClick={() => handleCopy(claudeDesktopConfig, "desktop")}
            >
              {copiedTab === "desktop" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-[var(--fgColor-muted)]">
            After saving, restart Claude Desktop. You should see &quot;dothesenow&quot; in your MCP tools list.
          </p>
        </TabsContent>

        <TabsContent value="claude-cowork" className="mt-3 space-y-2">
          <p className="text-xs text-[var(--fgColor-muted)]">
            Add this MCP server configuration to your Cowork workspace settings:
          </p>
          <ol className="list-decimal pl-4 text-xs text-[var(--fgColor-muted)] space-y-1">
            <li>Open your Cowork workspace settings</li>
            <li>Navigate to <strong>MCP Servers</strong> or <strong>Integrations</strong></li>
            <li>Add a new MCP server with the configuration below</li>
          </ol>
          <div className="relative">
            <pre className="rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-4 text-xs font-mono overflow-x-auto">
              {claudeCoworkConfig}
            </pre>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2"
              onClick={() => handleCopy(claudeCoworkConfig, "cowork")}
            >
              {copiedTab === "cowork" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-[var(--fgColor-muted)]">
            Once connected, Claude in Cowork will have access to all 30 DoTheseNow tools —
            manage tasks, contacts, outreach, strategy, campaigns, and approvals directly from your Cowork session.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
