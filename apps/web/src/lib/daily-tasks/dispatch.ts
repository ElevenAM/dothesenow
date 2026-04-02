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
 * Dispatch a task to its executor (n8n or Claude API).
 * Fire-and-forget: errors are caught and the task is marked as failed.
 * Only called from the web app server actions (not MCP).
 */
export function dispatchTask(task: DispatchableTask): void {
  if (task.executor_type === "self" || task.executor_type === "freelancer") {
    return;
  }

  // Fire-and-forget — don't await
  void doDispatch(task);
}

async function doDispatch(task: DispatchableTask): Promise<void> {
  const supabase = createAdminClient();

  try {
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
    await supabase
      .from("dtn_daily_tasks")
      .update({
        status: "failed",
        outcome_notes: `Dispatch failed: ${message}`,
      })
      .eq("id", task.id)
      .eq("org_id", task.org_id);
  }
}

async function dispatchToN8n(task: DispatchableTask): Promise<void> {
  const webhookUrl = task.executor_config?.webhook_url as string | undefined;
  if (!webhookUrl) {
    throw new Error("n8n task missing executor_config.webhook_url");
  }

  const callbackUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000").origin : "http://localhost:3000"}/api/webhooks/n8n`;

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
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const response = await fetch(`${baseUrl}/api/executors/claude`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-executor-secret": process.env.EXECUTOR_INTERNAL_SECRET || "",
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
