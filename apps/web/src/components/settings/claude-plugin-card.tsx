"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, ArrowRight } from "lucide-react";

interface ClaudePluginCardProps {
  keyCount: number;
  lastUsed: string | null;
}

export function ClaudePluginCard({ keyCount, lastUsed }: ClaudePluginCardProps) {
  const isConnected = keyCount > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--bgColor-muted)]">
          <Bot className="h-5 w-5 text-[var(--fgColor-muted)]" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Claude Code / Desktop</CardTitle>
            {isConnected ? (
              <Badge
                variant="default"
                className="bg-[var(--bgColor-success-emphasis,#1f883d)] text-white"
              >
                {keyCount} key{keyCount !== 1 ? "s" : ""}
              </Badge>
            ) : (
              <Badge variant="outline">Not Connected</Badge>
            )}
          </div>
          <CardDescription>
            Connect Claude Code or Claude Desktop via MCP to manage tasks,
            update strategies, query your CRM, and submit work — all from Claude.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isConnected && lastUsed && (
          <div className="text-xs text-[var(--fgColor-muted)]">
            Last used: {new Date(lastUsed).toLocaleDateString()}
          </div>
        )}

        <div className="flex gap-2">
          <Link href="/settings/integrations/claude-plugin">
            <Button variant={isConnected ? "outline" : "default"} size="sm">
              <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
              {isConnected ? "Manage" : "Set Up"}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
