import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

interface N8nCallbackBody {
  task_id: string;
  org_id: string;
  status: "completed" | "failed";
  result?: {
    content?: string;
    item_type?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  };
  error_message?: string;
  needs_approval?: boolean;
}

function verifySecret(request: Request): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return false;

  const provided = request.headers.get("x-webhook-secret") || "";
  if (provided.length !== secret.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(provided),
      Buffer.from(secret)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // Verify shared secret
  if (!verifySecret(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: N8nCallbackBody;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { task_id, org_id, status, result, error_message, needs_approval } = body;

  if (!task_id || !org_id || !status) {
    return new Response("Missing required fields: task_id, org_id, status", { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch the task to validate it exists and check idempotency
  const { data: task, error: taskError } = await supabase
    .from("dtn_daily_tasks")
    .select("*")
    .eq("id", task_id)
    .eq("org_id", org_id)
    .single();

  if (taskError || !task) {
    return new Response("Task not found", { status: 404 });
  }

  // Idempotency: only process tasks that are in_progress
  if (task.status !== "in_progress") {
    return new Response(
      JSON.stringify({ message: "Task already processed", current_status: task.status }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    if (status === "failed") {
      // Mark task as failed
      await supabase
        .from("dtn_daily_tasks")
        .update({
          status: "failed",
          outcome_notes: error_message || "n8n workflow failed",
        })
        .eq("id", task_id)
        .eq("org_id", org_id);
    } else if (needs_approval && result) {
      // Create approval queue entry and set task to waiting_approval
      const { error: approvalError } = await supabase
        .from("dtn_approval_queue")
        .insert({
          org_id,
          department_id: task.department_id,
          item_type: result.item_type || "task_submission",
          title: result.title || task.title,
          content: result.content || "",
          metadata: result.metadata || {},
          submitted_by_type: "n8n",
          submitted_by_id: null,
          daily_task_id: task_id,
          status: "pending",
        });

      if (approvalError) throw approvalError;

      await supabase
        .from("dtn_daily_tasks")
        .update({ status: "waiting_approval" })
        .eq("id", task_id)
        .eq("org_id", org_id);
    } else {
      // Mark task as completed directly
      await supabase
        .from("dtn_daily_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          outcome_notes: result?.content || "Completed by n8n",
        })
        .eq("id", task_id)
        .eq("org_id", org_id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[n8n-webhook] Error processing callback for task ${task_id}:`, message);
    return new Response(`Processing error: ${message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
