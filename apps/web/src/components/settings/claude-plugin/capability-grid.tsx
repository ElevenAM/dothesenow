import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CheckSquare,
  Users,
  Target,
  Megaphone,
  Briefcase,
  ClipboardCheck,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

interface CapabilityModule {
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  tools: string[];
}

const MODULES: CapabilityModule[] = [
  {
    title: "Daily Tasks",
    description: "Query, create, and manage daily tasks. Generate task plans and carry over incomplete work.",
    icon: CheckSquare,
    tools: [
      "Query tasks by date, status, priority, or assignee",
      "Create and update tasks",
      "Generate daily task plans from strategy context",
      "Carry over incomplete tasks to today",
    ],
  },
  {
    title: "CRM",
    description: "Search contacts, log outreach, and track your marketing pipeline.",
    icon: Users,
    tools: [
      "Search contacts with filters",
      "Add and update contact records",
      "Log outreach (email, LinkedIn, calls)",
      "View pipeline summary and engagement stats",
    ],
  },
  {
    title: "Strategy",
    description: "Read and update strategy documents, track competitors, and log marketing insights.",
    icon: Target,
    tools: [
      "Read/update 10 strategy document types",
      "Search across all strategy docs",
      "Track competitor intelligence",
      "Log insights (what worked, trends, feedback)",
    ],
  },
  {
    title: "Campaigns",
    description: "Create campaigns to group related work and generate weekly marketing reviews.",
    icon: Megaphone,
    tools: [
      "Create campaigns with goals and budget",
      "Generate weekly marketing reviews with KPIs",
    ],
  },
  {
    title: "Marketplace",
    description: "Post freelancer tasks, review submissions, and manage talent.",
    icon: Briefcase,
    tools: [
      "Post tasks for freelancers",
      "List and filter marketplace tasks",
      "Review freelancer submissions",
      "Message freelancers (task-scoped)",
    ],
  },
  {
    title: "Approvals",
    description: "Submit content for approval and review pending items.",
    icon: ClipboardCheck,
    tools: [
      "Submit content for approval",
      "List pending approvals",
      "Review and approve/reject items",
    ],
  },
];

export function CapabilityGrid() {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">What Claude Can Do</h3>
        <p className="text-xs text-[var(--fgColor-muted)]">
          27 tools across 6 modules — everything the Slack bot can do and more.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod) => (
          <Card key={mod.title}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bgColor-muted)]">
                  <mod.icon className="h-4 w-4 text-[var(--fgColor-muted)]" />
                </div>
                <CardTitle className="text-sm">{mod.title}</CardTitle>
              </div>
              <CardDescription className="text-xs">
                {mod.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {mod.tools.map((tool) => (
                  <li
                    key={tool}
                    className="flex items-start gap-1.5 text-xs text-[var(--fgColor-muted)]"
                  >
                    <span className="mt-0.5 text-[var(--fgColor-success)]">
                      &bull;
                    </span>
                    {tool}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
