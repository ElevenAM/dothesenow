"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { MetricsSummary } from "@dothesenow/types";

interface MetricsDashboardProps {
  summaries: MetricsSummary[];
}

/** Top-line metrics cards showing key metrics across all sources */
export function MetricsDashboard({ summaries }: MetricsDashboardProps) {
  // Filter out aggregate rows and group by metric name
  const metricsByName = new Map<string, { total: number; count: number; sources: Set<string> }>();
  for (const s of summaries) {
    if (s.source === "weekly_aggregate") continue;

    const existing = metricsByName.get(s.metric_name);
    if (existing) {
      existing.total += s.total_value;
      existing.count += s.count;
      existing.sources.add(s.source);
    } else {
      metricsByName.set(s.metric_name, {
        total: s.total_value,
        count: s.count,
        sources: new Set([s.source]),
      });
    }
  }

  if (metricsByName.size === 0) {
    return null;
  }

  // Show top metrics as cards
  const topMetrics = Array.from(metricsByName.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--fgColor-muted)]">
        External Metrics Overview
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {topMetrics.map(([name, data]) => (
          <Card key={name}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--fgColor-muted)]">
                  {formatMetricName(name)}
                </span>
                <Badge variant="outline" className="text-xs">
                  {data.count} pts
                </Badge>
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {formatMetricValue(name, data.total)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                from {Array.from(data.sources).map(formatSourceName).join(", ")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function formatMetricName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMetricValue(name: string, value: number): string {
  if (name === "bounce_rate") return `${value.toFixed(1)}%`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatSourceName(source: string): string {
  const names: Record<string, string> = {
    google_analytics: "GA",
    manual: "Manual",
    api: "API",
  };
  return names[source] ?? source;
}
