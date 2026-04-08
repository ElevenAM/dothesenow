"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Unplug } from "lucide-react";
import { initiateSlackOAuth, disconnectSlack } from "@/lib/integrations/actions";
import type { OrgIntegration } from "@dothesenow/types";

interface SlackIntegrationCardProps {
  integration: OrgIntegration | null;
  teamName: string | null;
}

export function SlackIntegrationCard({
  integration,
  teamName,
}: SlackIntegrationCardProps) {
  const [isPending, startTransition] = useTransition();
  const isConnected = integration?.is_active === true;

  function handleConnect() {
    startTransition(async () => {
      await initiateSlackOAuth();
    });
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectSlack();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--bgColor-muted)]">
          <MessageSquare className="h-5 w-5 text-[var(--fgColor-muted)]" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Slack</CardTitle>
            {isConnected ? (
              <Badge
                variant="default"
                className="bg-[var(--bgColor-success-emphasis,#1f883d)] text-white"
              >
                Connected
              </Badge>
            ) : (
              <Badge variant="outline">Not Connected</Badge>
            )}
          </div>
          <CardDescription>
            Create tasks, check progress, and get notifications directly in
            Slack. Use @mentions, slash commands, and interactive buttons.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isConnected && teamName && (
          <div className="text-xs text-[var(--fgColor-muted)]">
            <span>Workspace: {teamName}</span>
            {integration?.last_used_at && (
              <span className="ml-3">
                Last used:{" "}
                {new Date(integration.last_used_at).toLocaleDateString()}
              </span>
            )}
            {integration?.last_error && (
              <p className="mt-1 text-[var(--fgColor-danger)]">
                Last error: {integration.last_error}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isPending}
            >
              <Unplug className="mr-1.5 h-3.5 w-3.5" />
              {isPending ? "Disconnecting..." : "Disconnect"}
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleConnect}
              disabled={isPending}
            >
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              {isPending ? "Connecting..." : "Connect to Slack"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
