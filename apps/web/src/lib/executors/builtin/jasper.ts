import type { ExecutorDefinition, OrgIntegration } from "@dothesenow/types";
import type { Json } from "@dothesenow/types";
import { createAdminClient } from "@/lib/supabase/admin";

const JASPER_API_BASE = "https://api.jasper.ai/v2";

/** Map task_type to a Jasper command template. */
const TASK_TYPE_TO_TEMPLATE: Record<string, string> = {
  create: "blog-post",
  outreach: "email",
  action: "free-form",
  review: "free-form",
  analysis: "free-form",
};

/** Map task_type to approval queue item_type (same mapping as agent-executor). */
const ITEM_TYPE_MAP: Record<string, string> = {
  create: "blog_post",
  outreach: "email_draft",
  review: "task_submission",
  action: "task_submission",
  analysis: "task_submission",
};

export const jasper: ExecutorDefinition = {
  type: "jasper_api",
  label: "Jasper AI",
  category: "byos",
  icon: "Sparkles",
  description:
    "Content generation via your Jasper subscription. Bring your own API key.",
  capabilities: ["content_generation"],
  configSchema: [
    {
      key: "api_key",
      label: "Jasper API Key",
      type: "secret",
      required: true,
      placeholder: "Enter your Jasper API key from jasper.ai/settings",
    },
    {
      key: "brand_voice_id",
      label: "Brand Voice (optional)",
      type: "text",
      required: false,
      placeholder: "Jasper Brand Voice ID for consistent tone",
    },
  ],

  checkAvailability: (orgIntegrations: OrgIntegration[]) => {
    const found = orgIntegrations.find(
      (i) => i.integration_type === "jasper_api" && i.is_active,
    );
    return found
      ? { available: true }
      : {
          available: false,
          hint: "Connect your Jasper account in Settings \u2192 Integrations",
        };
  },

  estimateCredits: () => 0,

  testConnection: async (secret: string) => {
    const response = await fetch(`${JASPER_API_BASE}/templates`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Jasper API returned ${response.status}: ${body || response.statusText}`,
      );
    }
  },

  dispatch: async (task, config) => {
    const apiKey = config.secret;
    if (!apiKey) {
      throw new Error("Jasper API key not found — reconnect in Settings");
    }

    const brandVoiceId = (config.integration?.config as Record<string, unknown>)
      ?.brand_voice_id as string | undefined;

    const template = TASK_TYPE_TO_TEMPLATE[task.task_type] ?? "free-form";
    const startTime = Date.now();

    const requestBody: Record<string, unknown> = {
      inputs: {
        command: task.title,
        context: task.description ?? "",
      },
      options: {
        template,
        ...(brandVoiceId ? { brandVoiceId } : {}),
      },
    };

    const response = await fetch(`${JASPER_API_BASE}/text/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Jasper API returned ${response.status}: ${body || response.statusText}`,
      );
    }

    const result = (await response.json()) as {
      data?: { text?: string };
    };

    const generatedContent = result.data?.text ?? "";
    const durationMs = Date.now() - startTime;

    // Create approval queue entry (same pattern as agent-executor)
    const supabase = createAdminClient();

    const { error: approvalError } = await supabase
      .from("dtn_approval_queue")
      .insert({
        org_id: task.org_id,
        department_id: task.department_id,
        item_type: ITEM_TYPE_MAP[task.task_type] || "task_submission",
        title: task.title,
        content: generatedContent,
        metadata: {
          executor: "jasper_api",
          template,
          brand_voice_id: brandVoiceId ?? null,
          duration_ms: durationMs,
        } as Json,
        submitted_by_type: "jasper_api",
        submitted_by_id: null,
        daily_task_id: task.id,
        status: "pending",
      });

    if (approvalError) throw approvalError;

    const { error: taskUpdateError } = await supabase
      .from("dtn_daily_tasks")
      .update({
        status: "waiting_approval",
        generation_context: {
          execution: {
            executor: "jasper_api",
            template,
            duration_ms: durationMs,
            executed_at: new Date().toISOString(),
          },
        },
      })
      .eq("id", task.id)
      .eq("org_id", task.org_id);

    if (taskUpdateError) {
      throw new Error(
        `Task ${task.id} status update to waiting_approval failed: ${taskUpdateError.message}`,
      );
    }
  },
};
