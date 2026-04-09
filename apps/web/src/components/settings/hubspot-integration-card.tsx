"use client";

import { useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Unplug, RefreshCw } from "lucide-react";
import { initiateHubSpotOAuth, disconnectHubSpot } from "@/lib/integrations/actions";
import type { OrgIntegration, SyncLog } from "@dothesenow/types";

interface HubSpotIntegrationCardProps {
  integration: OrgIntegration | null;
  hubId: string | null;
  lastSync: SyncLog | null;
}

export function HubSpotIntegrationCard({
  integration,
  hubId,
  lastSync,
}: HubSpotIntegrationCardProps) {
  const [isPending, startTransition] = useTransition();
  const isConnected = integration?.is_active === true;

  function handleConnect() {
    startTransition(async () => {
      await initiateHubSpotOAuth();
    });
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectHubSpot();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--bgColor-muted)]">
          <Users className="h-5 w-5 text-[var(--fgColor-muted)]" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">HubSpot</CardTitle>
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
            Sync contacts between DoTheseNow and HubSpot CRM. Two-way sync
            with field mapping and conflict resolution.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isConnected && (
          <div className="space-y-1 text-xs text-[var(--fgColor-muted)]">
            {hubId && <span>Hub ID: {hubId}</span>}
            {lastSync && (
              <div className="flex items-center gap-2">
                <RefreshCw className="h-3 w-3" />
                <span>
                  Last sync: {new Date(lastSync.completed_at ?? lastSync.created_at).toLocaleString()}
                  {" "}({lastSync.sync_type})
                </span>
                {lastSync.records_processed > 0 && (
                  <span>
                    — {lastSync.records_created} created, {lastSync.records_updated} updated
                    {lastSync.records_failed > 0 && `, ${lastSync.records_failed} failed`}
                  </span>
                )}
              </div>
            )}
            {integration?.last_error && (
              <p className="text-[var(--fgColor-danger)]">
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
              <Users className="mr-1.5 h-3.5 w-3.5" />
              {isPending ? "Connecting..." : "Connect HubSpot"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
