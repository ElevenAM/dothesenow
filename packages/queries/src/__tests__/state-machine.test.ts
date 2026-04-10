/**
 * Exhaustive state machine tests for task status transitions.
 *
 * Tests every combination of current_status × target_status (8×8 = 64)
 * to ensure the transition_task_status() RPC correctly allows valid
 * transitions and rejects invalid ones.
 *
 * Requires a running Supabase instance.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const ORG_ID = "00000000-dddd-0000-0000-000000000004";
const ALL_STATUSES = [
  "pending",
  "in_progress",
  "waiting_approval",
  "completed",
  "skipped",
  "failed",
  "carried_over",
  "blocked",
] as const;

// Valid transitions per the state machine in migration 013
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["in_progress", "waiting_approval", "skipped", "carried_over"],
  in_progress: ["completed", "failed", "blocked", "skipped", "waiting_approval"],
  waiting_approval: ["in_progress", "skipped", "failed"],
  blocked: ["in_progress", "skipped", "carried_over"],
  failed: ["in_progress", "carried_over"],
  completed: [],
  skipped: [],
  carried_over: [],
};

let supabase: SupabaseClient;

beforeAll(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }

  supabase = createClient(url, key);

  // Ensure test org exists
  await supabase.from("dtn_organizations").upsert([
    {
      id: ORG_ID,
      name: "_test_org_state_machine",
      slug: "_test_org_state_machine",
      plan: "free",
      plan_status: "active",
    },
  ]);
});

afterAll(async () => {
  // Clean up
  await supabase.from("dtn_task_events").delete().eq("org_id", ORG_ID);
  await supabase.from("dtn_daily_tasks").delete().eq("org_id", ORG_ID);
  await supabase.from("dtn_organizations").delete().eq("id", ORG_ID);
});

/**
 * Create a task and force it to a specific status via direct SQL update
 * (bypassing the state machine) so we can test transitions from any state.
 */
async function createTaskInStatus(status: string): Promise<string> {
  const { data, error } = await supabase
    .from("dtn_daily_tasks")
    .insert({
      org_id: ORG_ID,
      title: `SM test: ${status}`,
      status: "pending",
      task_type: "action",
      priority: "medium",
      executor_type: "self",
      scheduled_date: new Date().toISOString().split("T")[0],
    })
    .select("id")
    .single();

  if (error) throw error;

  if (status !== "pending") {
    // Direct update to force the status (bypasses state machine validation)
    const { error: updateErr } = await supabase
      .from("dtn_daily_tasks")
      .update({ status })
      .eq("id", data.id);

    if (updateErr) throw updateErr;
  }

  return data.id;
}

async function attemptTransition(
  taskId: string,
  newStatus: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("transition_task_status", {
    p_task_id: taskId,
    p_org_id: ORG_ID,
    p_new_status: newStatus,
    p_source: "api",
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

describe("Task status state machine — exhaustive transitions", () => {
  for (const fromStatus of ALL_STATUSES) {
    const validTargets = VALID_TRANSITIONS[fromStatus] ?? [];

    for (const toStatus of ALL_STATUSES) {
      if (fromStatus === toStatus) continue; // Skip same-state

      const shouldBeValid = validTargets.includes(toStatus);

      it(`${fromStatus} → ${toStatus}: ${shouldBeValid ? "ALLOWED" : "REJECTED"}`, async () => {
        const taskId = await createTaskInStatus(fromStatus);

        const result = await attemptTransition(taskId, toStatus);

        if (shouldBeValid) {
          expect(result.success).toBe(true);

          // Verify the task actually changed status
          const { data } = await supabase
            .from("dtn_daily_tasks")
            .select("status")
            .eq("id", taskId)
            .single();

          expect(data?.status).toBe(toStatus);
        } else {
          expect(result.success).toBe(false);
          expect(result.error).toContain("Invalid transition");
        }
      });
    }
  }

  it("transition creates audit event", async () => {
    const taskId = await createTaskInStatus("pending");
    await attemptTransition(taskId, "in_progress");

    const { data: events } = await supabase
      .from("dtn_task_events")
      .select("*")
      .eq("task_id", taskId)
      .eq("event_type", "status_changed");

    expect(events).toHaveLength(1);
    expect(events![0].previous_state).toEqual({ status: "pending" });
    expect(events![0].new_state).toEqual({ status: "in_progress" });
    expect(events![0].source).toBe("api");
  });

  it("completed task sets completed_at", async () => {
    const taskId = await createTaskInStatus("in_progress");
    await attemptTransition(taskId, "completed");

    const { data } = await supabase
      .from("dtn_daily_tasks")
      .select("completed_at")
      .eq("id", taskId)
      .single();

    expect(data?.completed_at).toBeTruthy();
  });
});
