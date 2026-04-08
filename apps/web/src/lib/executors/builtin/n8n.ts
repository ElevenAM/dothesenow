import { validateWebhookUrl } from "../validate-webhook-url";
import type { ExecutorDefinition } from "@dothesenow/types";

export const n8n: ExecutorDefinition = {
  type: "n8n",
  label: "n8n Automation",
  category: "webhook",
  icon: "Cpu",
  description: "Trigger n8n workflows via webhook for automation tasks.",
  configSchema: [],
  capabilities: ["automation"],

  checkAvailability: () => {
    if (!process.env.N8N_WEBHOOK_SECRET) {
      return {
        available: false,
        hint: "Connect at n8n.io — no premium subscription needed for self-hosted",
      };
    }
    return { available: true };
  },

  estimateCredits: () => 1,

  dispatch: async (task, config) => {
    const taskConfig = task.executor_config as Record<string, unknown> | null;
    const webhookUrl = taskConfig?.webhook_url as string | undefined;
    if (!webhookUrl) {
      throw new Error("n8n task missing executor_config.webhook_url");
    }

    validateWebhookUrl(webhookUrl);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: task.id,
        org_id: task.org_id,
        title: task.title,
        description: task.description,
        task_type: task.task_type,
        priority: task.priority,
        executor_config: task.executor_config,
        callback_url: config.callbackUrl,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `n8n webhook returned ${response.status}: ${response.statusText}`,
      );
    }
  },
};
