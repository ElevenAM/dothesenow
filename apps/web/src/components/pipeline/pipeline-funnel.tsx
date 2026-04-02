"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

import { STAGE_ORDER, STAGE_LABELS, type PipelineRow } from "@/lib/pipeline/types";

const STAGE_COLORS: Record<string, string> = {
  awareness: "var(--color-blue-300)",
  consideration: "var(--color-blue-400)",
  decision: "var(--color-blue-500)",
  customer: "var(--color-blue-600)",
  advocate: "var(--color-blue-700)",
};

interface PipelineFunnelProps {
  data: PipelineRow[];
}

export function PipelineFunnel({ data }: PipelineFunnelProps) {
  // Aggregate by lifecycle_stage
  const stageMap = new Map<string, { count: number; engaged7d: number; engaged30d: number }>();
  for (const row of data) {
    const existing = stageMap.get(row.lifecycle_stage) || {
      count: 0,
      engaged7d: 0,
      engaged30d: 0,
    };
    stageMap.set(row.lifecycle_stage, {
      count: existing.count + Number(row.count),
      engaged7d: existing.engaged7d + Number(row.engaged_last_7d),
      engaged30d: existing.engaged30d + Number(row.engaged_last_30d),
    });
  }

  const chartData = STAGE_ORDER.filter((s) => stageMap.has(s)).map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: stageMap.get(stage)!.count,
    color: STAGE_COLORS[stage],
  }));

  if (chartData.length === 0) return null;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
          <XAxis type="number" />
          <YAxis
            type="category"
            dataKey="label"
            width={90}
            tick={{ fontSize: 13 }}
          />
          <Tooltip
            formatter={(value) => [String(value), "Contacts"]}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.stage} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
