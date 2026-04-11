import {
  STRATEGY_GENERATION_COST,
  STRATEGY_REFINEMENT_COST,
  TASK_DECOMPOSITION_COST,
  CHAT_MESSAGE_COST,
  AGENT_EXECUTION_COST,
  BLOCKER_CLASSIFICATION_COST,
  BLOCKER_DRAFT_COST,
  BLOCKER_RESEARCH_COST,
} from "@dothesenow/prompts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CreditGuideItem {
  action: string;
  description: string;
  cost: number;
}

const CREDIT_GUIDE_GROUPS: { label: string; items: CreditGuideItem[] }[] = [
  {
    label: "Strategy & Planning",
    items: [
      {
        action: "Strategy generation",
        description: "Generate a full marketing strategy from your org profile",
        cost: STRATEGY_GENERATION_COST,
      },
      {
        action: "Strategy refinement",
        description:
          "AI-driven suggestions to optimize your current strategy",
        cost: STRATEGY_REFINEMENT_COST,
      },
    ],
  },
  {
    label: "Daily Tasks",
    items: [
      {
        action: "Task decomposition",
        description: "Break down strategy into actionable daily tasks",
        cost: TASK_DECOMPOSITION_COST,
      },
      {
        action: "Agent task execution",
        description: "AI agent executes an assigned task autonomously",
        cost: AGENT_EXECUTION_COST,
      },
    ],
  },
  {
    label: "Chat & Assistance",
    items: [
      {
        action: "Chat message",
        description: "Send a message in the AI assistant chat",
        cost: CHAT_MESSAGE_COST,
      },
    ],
  },
  {
    label: "Blocker Resolution",
    items: [
      {
        action: "Blocker classification",
        description: "Classify a blocker to determine resolution approach",
        cost: BLOCKER_CLASSIFICATION_COST,
      },
      {
        action: "Draft resolution",
        description: "Generate a draft solution for a blocker",
        cost: BLOCKER_DRAFT_COST,
      },
      {
        action: "Research resolution",
        description: "In-depth research to resolve a complex blocker",
        cost: BLOCKER_RESEARCH_COST,
      },
    ],
  },
];

export function CreditUsageGuide() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What uses credits</CardTitle>
        <CardDescription>
          Different actions use different amounts of credits. Here&apos;s a
          breakdown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {CREDIT_GUIDE_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--fgColor-muted)] pb-1">
                {group.label}
              </p>
              <div className="divide-y divide-[var(--borderColor-muted)]">
                {group.items.map((item) => (
                  <div
                    key={item.action}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.action}</p>
                      <p className="text-xs text-[var(--fgColor-muted)]">
                        {item.description}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular-nums whitespace-nowrap ml-4">
                      {item.cost} {item.cost === 1 ? "credit" : "credits"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
