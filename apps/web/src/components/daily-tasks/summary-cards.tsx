import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Bot, Cpu, Briefcase } from "lucide-react";
import type { DailyTasksSummary } from "@/lib/daily-tasks/actions";

const EXECUTOR_META: Record<
  string,
  { label: string; icon: typeof User; color: string }
> = {
  self: { label: "You", icon: User, color: "text-[var(--label-blue-fg)]" },
  n8n: { label: "n8n", icon: Cpu, color: "text-[var(--label-orange-fg)]" },
  claude_api: { label: "Claude API", icon: Bot, color: "text-[var(--label-purple-fg)]" },
  freelancer: { label: "Freelancer", icon: Briefcase, color: "text-[var(--label-green-fg)]" },
};

interface SummaryCardsProps {
  summary: DailyTasksSummary[];
  totalTasks: number;
}

export function SummaryCards({ summary, totalTasks }: SummaryCardsProps) {
  if (totalTasks === 0) return null;

  const executorTypes = ["self", "n8n", "claude_api", "freelancer"] as const;

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {executorTypes.map((type) => {
        const meta = EXECUTOR_META[type];
        const data = summary.find((s) => s.executor_type === type);
        const total = data?.total ?? 0;
        const completed = data?.completed ?? 0;

        if (total === 0) return null;

        return (
          <Card key={type}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {meta.label}
              </CardTitle>
              <meta.icon className={`h-3.5 w-3.5 ${meta.color}`} />
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-xl font-bold">
                {completed}/{total}
              </div>
              <p className="text-xs text-muted-foreground">completed</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
