import { createAdminClient } from "@/lib/supabase/admin";

interface DispatchableTask {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  executor_type: string;
  executor_config: Record<string, unknown>;
  department_id: string | null;
  scheduled_date: string;
  source_strategy: string | null;
  campaign_id: string | null;
  contact_id: string | null;
}

/**
 * Returns a human-readable reason if the executor can't run, or null if it's ready.
 * Used by dispatch to gracefully skip unconfigured executors and by the UI to show hints.
 */
function getUnavailableReason(executorType: string): string | null {
  if (executorType === "claude_api") {
    if (!process.env.ANTHROPIC_API_KEY) {
      return "Claude API is not configured yet — ANTHROPIC_API_KEY is missing. Task kept as pending for manual completion.";
    }
    if (!process.env.EXECUTOR_INTERNAL_SECRET) {
      return "Claude executor secret is not configured yet — EXECUTOR_INTERNAL_SECRET is missing. Task kept as pending for manual completion.";
    }
  }
  if (executorType === "n8n") {
    if (!process.env.N8N_WEBHOOK_SECRET) {
      return "n8n is not connected — set up a workflow at https://n8n.io and configure N8N_WEBHOOK_SECRET. Task kept as pending for manual completion.";
    }
  }
  return null;
}

/**
 * Check which executor types are available based on configured env vars.
 * Called from server actions to inform the UI.
 */
export function getExecutorAvailability(): Record<string, { available: boolean; hint?: string }> {
  return {
    self: { available: true },
    freelancer: { available: true },
    claude_api: process.env.ANTHROPIC_API_KEY && process.env.EXECUTOR_INTERNAL_SECRET
      ? { available: true }
      : { available: false, hint: "Requires ANTHROPIC_API_KEY — not configured yet" },
    n8n: process.env.N8N_WEBHOOK_SECRET
      ? { available: true }
      : { available: false, hint: "Connect at n8n.io — no premium subscription needed for self-hosted" },
  };
}

/**
 * Dispatch a task to its executor (n8n or Claude API).
 * Returns a promise that resolves when dispatch completes (or fails).
 * Caller should await this or use waitUntil() in serverless contexts.
 * Only called from the web app server actions (not MCP).
 */
export async function dispatchTask(task: DispatchableTask): Promise<void> {
  if (task.executor_type === "self" || task.executor_type === "freelancer") {
    return;
  }

  await doDispatch(task);
}

function getBaseUrl(): string {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
}

/** Reject URLs pointing to private/internal addresses to prevent SSRF */
function validateWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid webhook URL: ${url}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Webhook URL must use http or https: ${url}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and loopback
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  ) {
    throw new Error(`Webhook URL must not point to localhost: ${url}`);
  }

  // Block private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x)
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 127
    ) {
      throw new Error(`Webhook URL must not point to a private address: ${url}`);
    }
  }

  // Block cloud metadata endpoints
  if (hostname === "metadata.google.internal" || hostname === "metadata.google") {
    throw new Error(`Webhook URL must not point to cloud metadata: ${url}`);
  }
}

async function doDispatch(task: DispatchableTask): Promise<void> {
  const supabase = createAdminClient();

  try {
    // Check if the executor is actually configured before dispatching
    const unavailable = getUnavailableReason(task.executor_type);
    if (unavailable) {
      // Mark as pending_manual with a note about what's missing
      await supabase
        .from("dtn_daily_tasks")
        .update({
          status: "pending",
          outcome_notes: unavailable,
        })
        .eq("id", task.id)
        .eq("org_id", task.org_id);
      return;
    }

    // Mark task as in_progress before dispatching
    await supabase
      .from("dtn_daily_tasks")
      .update({ status: "in_progress" })
      .eq("id", task.id)
      .eq("org_id", task.org_id);

    if (task.executor_type === "n8n") {
      await dispatchToN8n(task);
    } else if (task.executor_type === "claude_api") {
      await dispatchToClaude(task);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dispatch] Failed to dispatch task ${task.id}:`, message);

    // Mark task as failed so it doesn't stay in_progress forever
    const { error: failError } = await supabase
      .from("dtn_daily_tasks")
      .update({
        status: "failed",
        outcome_notes: `Dispatch failed: ${message}`,
      })
      .eq("id", task.id)
      .eq("org_id", task.org_id);

    if (failError) {
      console.error(
        `[dispatch] Also failed to mark task ${task.id} as failed:`,
        failError.message
      );
    }
  }
}

async function dispatchToN8n(task: DispatchableTask): Promise<void> {
  const webhookUrl = task.executor_config?.webhook_url as string | undefined;
  if (!webhookUrl) {
    throw new Error("n8n task missing executor_config.webhook_url");
  }

  validateWebhookUrl(webhookUrl);

  const callbackUrl = `${getBaseUrl()}/api/webhooks/n8n`;

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
      callback_url: callbackUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`n8n webhook returned ${response.status}: ${response.statusText}`);
  }
}

async function dispatchToClaude(task: DispatchableTask): Promise<void> {
  const secret = process.env.EXECUTOR_INTERNAL_SECRET;
  if (!secret) {
    throw new Error("EXECUTOR_INTERNAL_SECRET is not configured");
  }

  const response = await fetch(`${getBaseUrl()}/api/executors/claude`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-executor-secret": secret,
    },
    body: JSON.stringify({
      task_id: task.id,
      org_id: task.org_id,
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude executor returned ${response.status}: ${response.statusText}`);
  }
}
