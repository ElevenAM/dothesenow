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
import { ApiKeyForm } from "./api-key-form";
import {
  Bot,
  Cpu,
  Sparkles,
  User,
  Briefcase,
  Unplug,
} from "lucide-react";
import type { ExecutorMetadata, OrgIntegration } from "@dothesenow/types";
import { disconnectIntegration } from "@/lib/integrations/actions";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot,
  Cpu,
  Sparkles,
  User,
  Briefcase,
};

interface IntegrationCardProps {
  executor: ExecutorMetadata;
  integration: OrgIntegration | null;
}

export function IntegrationCard({ executor, integration }: IntegrationCardProps) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const Icon = ICON_MAP[executor.icon] ?? Sparkles;
  const isConnected = integration?.is_active === true;

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectIntegration(executor.type);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--bgColor-muted)]">
          <Icon className="h-5 w-5 text-[var(--fgColor-muted)]" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{executor.label}</CardTitle>
            {isConnected ? (
              <Badge variant="default" className="bg-[var(--bgColor-success-emphasis,#1f883d)] text-white">
                Connected
              </Badge>
            ) : (
              <Badge variant="outline">Not Connected</Badge>
            )}
          </div>
          <CardDescription>{executor.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isConnected && integration && (
          <div className="text-xs text-[var(--fgColor-muted)]">
            {integration.last_used_at && (
              <span>
                Last used:{" "}
                {new Date(integration.last_used_at).toLocaleDateString()}
              </span>
            )}
            {integration.last_error && (
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
              onClick={() => setShowForm(true)}
            >
              Connect
            </Button>
          )}
        </div>

        {showForm && !isConnected && (
          <ApiKeyForm
            executor={executor}
            onClose={() => setShowForm(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}
