"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Globe, PenLine, Plug } from "lucide-react";
import type { MetricsSummary } from "@dothesenow/types";

interface MetricsSourceCardProps {
  summaries: MetricsSummary[];
}

const SOURCE_META: Record<string, { label: string; icon: typeof Globe }> = {
  google_analytics: { label: "Google Analytics", icon: Globe },
  manual: { label: "Manual Entry", icon: PenLine },
  api: { label: "API", icon: Plug },
};

export function MetricsSourceCard({ summaries }: MetricsSourceCardProps) {
  // Group by source
  const sources = new Map<string, { metrics: number; latest: string }>();
  for (const s of summaries) {
    if (s.source === "weekly_aggregate") continue;
    const existing = sources.get(s.source);
    if (existing) {
      existing.metrics += s.count;
      if (s.latest_period_start > existing.latest) {
        existing.latest = s.latest_period_start;
      }
    } else {
      sources.set(s.source, { metrics: s.count, latest: s.latest_period_start });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-[var(--fgColor-muted)]" />
          Metrics Sources
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sources.size === 0 ? (
          <p className="text-sm text-muted-foreground">
            No metrics yet. Connect Google Analytics, use the API, or log manually.
          </p>
        ) : (
          <div className="space-y-3">
            {Array.from(sources.entries()).map(([source, data]) => {
              const meta = SOURCE_META[source] ?? { label: source, icon: Plug };
              const Icon = meta.icon;

              return (
                <div key={source} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-[var(--fgColor-muted)]" />
                    <span className="text-sm font-medium">{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {data.metrics} data points
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Latest: {new Date(data.latest).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
