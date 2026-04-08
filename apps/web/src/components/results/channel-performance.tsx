"use client";

import { useCallback, useState, useTransition } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { RefreshCw, TrendingUp, BarChart3, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getChannelPerformanceData } from "@/lib/results/actions";
import type { ChannelPerformanceRow } from "@dothesenow/types";

function parseChannelName(ref: string): string {
  // "Channels.ContentSEO" → "Content SEO"
  const name = ref.includes(".") ? ref.split(".").pop()! : ref;
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

interface ChannelPerformanceProps {
  data: ChannelPerformanceRow[];
}

export function ChannelPerformance({
  data: initialData,
}: ChannelPerformanceProps) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const fresh = await getChannelPerformanceData();
        setData(fresh);
      } catch (e) {
        console.error("[channel-performance] refresh failed:", e);
        setError("Failed to refresh channel data. Please try again.");
      }
    });
  }, []);

  const totalTasks = data.reduce((sum, d) => sum + d.total_tasks, 0);
  const avgCompletionRate =
    data.length > 0
      ? (
          data.reduce((sum, d) => sum + d.completion_rate, 0) / data.length
        ).toFixed(1)
      : "0";
  const topChannel =
    data.length > 0
      ? parseChannelName(
          data.reduce((best, d) =>
            d.completion_rate > best.completion_rate ? d : best,
          ).strategy_section_ref,
        )
      : "—";

  const chartData = data.map((d) => ({
    name: parseChannelName(d.strategy_section_ref),
    completed: d.completed,
    failed: d.failed,
    skipped: d.skipped,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Last 30 days, aggregated by strategy channel
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={isPending}
        >
          <RefreshCw
            className={`h-4 w-4 mr-1.5 ${isPending ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Summary stat cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Tasks
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalTasks}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Completion Rate
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgCompletionRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top Channel
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-[var(--fgColor-success)]" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold truncate">{topChannel}</div>
          </CardContent>
        </Card>
      </div>

      {/* Stacked bar chart */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="completed"
                    stackId="a"
                    fill="var(--chart-2)"
                    name="Completed"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="failed"
                    stackId="a"
                    fill="var(--chart-3)"
                    name="Failed"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="skipped"
                    stackId="a"
                    fill="var(--chart-1)"
                    name="Skipped"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data table */}
      {data.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Completion %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.strategy_section_ref}>
                    <TableCell className="font-medium">
                      {parseChannelName(row.strategy_section_ref)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.total_tasks}
                    </TableCell>
                    <TableCell className="text-right">{row.completed}</TableCell>
                    <TableCell className="text-right">{row.failed}</TableCell>
                    <TableCell className="text-right">{row.skipped}</TableCell>
                    <TableCell className="text-right font-medium">
                      {row.completion_rate}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
