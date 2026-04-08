import { inngest } from "@/lib/inngest/client";
import type { ExecutorDefinition } from "@dothesenow/types";

export const claude: ExecutorDefinition = {
  type: "claude_api",
  label: "Claude AI",
  category: "builtin",
  icon: "Bot",
  description: "AI-powered content generation and research using Claude.",
  configSchema: [],
  capabilities: ["content_generation", "research"],

  checkAvailability: () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        available: false,
        hint: "Requires ANTHROPIC_API_KEY — not configured yet",
      };
    }
    return { available: true };
  },

  estimateCredits: () => 1,

  dispatch: async (task) => {
    await inngest.send({
      name: "task/agent.execute",
      data: {
        task_id: task.id,
        org_id: task.org_id,
      },
    });
  },
};
