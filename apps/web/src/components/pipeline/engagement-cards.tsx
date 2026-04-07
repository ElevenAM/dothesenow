"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, Target, Activity } from "lucide-react";
import type { PipelineRow } from "@/lib/pipeline/types";

interface EngagementCardsProps {
  data: PipelineRow[];
}

export function EngagementCards({ data }: EngagementCardsProps) {
  const totalContacts = data.reduce((sum, r) => sum + Number(r.count), 0);
  const totalEngaged7d = data.reduce((sum, r) => sum + Number(r.engaged_last_7d), 0);
  const totalEngaged30d = data.reduce((sum, r) => sum + Number(r.engaged_last_30d), 0);
  const avgLeadScore =
    data.length > 0
      ? Math.round(
          data.reduce((sum, r) => sum + Number(r.avg_lead_score) * Number(r.count), 0) /
            totalContacts,
        )
      : 0;

  const stats = [
    {
      label: "Total Active",
      value: totalContacts,
      icon: Users,
      color: "text-[var(--label-blue-fg)]",
    },
    {
      label: "Engaged (7d)",
      value: totalEngaged7d,
      icon: Activity,
      color: "text-[var(--label-green-fg)]",
    },
    {
      label: "Engaged (30d)",
      value: totalEngaged30d,
      icon: TrendingUp,
      color: "text-[var(--label-purple-fg)]",
    },
    {
      label: "Avg Lead Score",
      value: avgLeadScore,
      icon: Target,
      color: "text-[var(--label-yellow-fg)]",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.label}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
