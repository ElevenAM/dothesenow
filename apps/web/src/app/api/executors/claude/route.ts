import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifySecret(request: Request): boolean {
  const secret = process.env.EXECUTOR_INTERNAL_SECRET;
  if (!secret) return false;

  const provided = request.headers.get("x-executor-secret") || "";
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

/** Select strategy doc types relevant to the task type */
function relevantDocTypes(taskType: string): string[] {
  switch (taskType) {
    case "create":
      return ["brand_voice", "content_calendar", "personas", "master_strategy"];
    case "outreach":
      return ["value_props", "personas", "positioning", "master_strategy"];
    case "analysis":
      return ["competitive_analysis", "master_strategy", "positioning"];
    default:
      return ["master_strategy", "brand_voice"];
  }
}

export async function POST(request: Request) {
  if (!verifySecret(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });
  }

  let body: { task_id: string; org_id: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { task_id, org_id } = body;
  if (!task_id || !org_id) {
    return new Response("Missing task_id or org_id", { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch the task
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

  const startTime = Date.now();

  try {
    // Fetch relevant strategy docs for context
    const docTypes = relevantDocTypes(task.task_type);
    const { data: strategyDocs } = await supabase
      .from("mktg_strategy_docs")
      .select("doc_type, title, content")
      .eq("org_id", org_id)
      .eq("is_active", true)
      .in("doc_type", docTypes)
      .order("updated_at", { ascending: false });

    // Build system context from strategy docs
    const strategyContext = (strategyDocs || [])
      .map((doc) => `## ${doc.title} (${doc.doc_type})\n${doc.content}`)
      .join("\n\n---\n\n");

    const systemPrompt = `You are a marketing automation assistant. Your job is to execute tasks based on the organization's strategy documents.

${strategyContext ? `Here is the organization's strategy context:\n\n${strategyContext}` : "No strategy documents are available."}

Generate content that aligns with the brand voice and strategic goals described above. Be specific, actionable, and ready for human review.`;

    // Task description goes in user message (prompt injection safety)
    const userPrompt = `Execute this task and generate the content:

Title: ${task.title}
Type: ${task.task_type}
Priority: ${task.priority}
Description: ${task.description || "No additional description provided."}

Please generate the complete content for this task. Format it clearly so a human reviewer can approve, reject, or request revisions.`;

    // Call Anthropic API
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const generatedContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n\n");

    const durationMs = Date.now() - startTime;

    // Determine item_type based on task_type
    const itemTypeMap: Record<string, string> = {
      create: "blog_post",
      outreach: "email_draft",
      review: "task_submission",
      action: "task_submission",
      analysis: "task_submission",
    };

    // Create approval queue entry
    const { error: approvalError } = await supabase
      .from("dtn_approval_queue")
      .insert({
        org_id,
        department_id: task.department_id,
        item_type: itemTypeMap[task.task_type] || "task_submission",
        title: task.title,
        content: generatedContent,
        metadata: {
          model: response.model,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          duration_ms: durationMs,
        },
        submitted_by_type: "claude_api",
        submitted_by_id: null,
        daily_task_id: task_id,
        status: "pending",
      });

    if (approvalError) throw approvalError;

    // Update task to waiting_approval + log execution metadata
    await supabase
      .from("dtn_daily_tasks")
      .update({
        status: "waiting_approval",
        generation_context: {
          ...(task.generation_context || {}),
          execution: {
            model: response.model,
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            duration_ms: durationMs,
            executed_at: new Date().toISOString(),
          },
        },
      })
      .eq("id", task_id)
      .eq("org_id", org_id);

    return new Response(
      JSON.stringify({ success: true, duration_ms: durationMs }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[claude-executor] Error executing task ${task_id}:`, message);

    // Mark task as failed
    await supabase
      .from("dtn_daily_tasks")
      .update({
        status: "failed",
        outcome_notes: `Claude execution failed: ${message}`,
      })
      .eq("id", task_id)
      .eq("org_id", org_id);

    return new Response(`Execution error: ${message}`, { status: 500 });
  }
}
