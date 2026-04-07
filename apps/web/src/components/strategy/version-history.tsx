"use client";

import { useEffect, useState, useTransition } from "react";
import { getVersionHistory, getStrategyDoc } from "@/lib/strategy/actions";
import type { StrategyDoc } from "@/lib/strategy/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History, Eye, Loader2 } from "lucide-react";

interface VersionHistoryProps {
  docType: string;
  currentDocId: string;
  onViewVersion: (doc: StrategyDoc) => void;
}

type VersionEntry = {
  id: string;
  version: number;
  change_summary: string | null;
  changed_by: string | null;
  created_at: string;
  title: string;
};

export function VersionHistory({ docType, currentDocId, onViewVersion }: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setFetchError(null);
    getVersionHistory(docType)
      .then((data) => {
        setVersions(data);
      })
      .catch(() => {
        setFetchError("Failed to load version history");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [docType]);

  const handleViewVersion = (versionId: string) => {
    startTransition(async () => {
      const doc = await getStrategyDoc(versionId);
      onViewVersion(doc);
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading history...
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-4 text-sm text-destructive">{fetchError}</div>
    );
  }

  if (versions.length <= 1) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <History className="h-4 w-4 inline mr-1" />
        No previous versions
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      <div className="text-xs font-medium text-muted-foreground px-2 pb-1">
        Version History
      </div>
      {versions.map((v) => (
        <div
          key={v.id}
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            v.id === currentDocId ? "bg-muted" : "hover:bg-muted/50"
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                v{v.version}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {v.changed_by === "claude" ? "Claude" : "User"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {v.change_summary || "No description"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {new Date(v.created_at).toLocaleDateString()}
            </div>
          </div>
          {v.id !== currentDocId && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => handleViewVersion(v.id)}
              disabled={isPending}
            >
              <Eye className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
