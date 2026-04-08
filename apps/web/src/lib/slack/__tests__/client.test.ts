import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  verifySlackSignature,
  transitionTaskFromSlack,
  buildTaskCard,
  buildTaskListBlocks,
} from "../client";
import { createHmac } from "crypto";

// ─── verifySlackSignature ───────────────────────────────────

describe("verifySlackSignature", () => {
  const signingSecret = "test-signing-secret-123";

  function buildRequest(body: string, secret: string, timestampOverride?: number): Request {
    const timestamp = timestampOverride ?? Math.floor(Date.now() / 1000);
    const baseString = `v0:${timestamp}:${body}`;
    const signature = `v0=${createHmac("sha256", secret).update(baseString).digest("hex")}`;

    return new Request("https://example.com/api/slack/events", {
      method: "POST",
      headers: {
        "x-slack-request-timestamp": String(timestamp),
        "x-slack-signature": signature,
        "content-type": "application/json",
      },
      body,
    });
  }

  it("accepts a valid signature", async () => {
    const body = JSON.stringify({ type: "event_callback" });
    const request = buildRequest(body, signingSecret);
    const result = await verifySlackSignature(request, signingSecret);
    expect(result.valid).toBe(true);
    expect(result.body).toBe(body);
  });

  it("rejects an invalid signature", async () => {
    const body = JSON.stringify({ type: "event_callback" });
    const request = buildRequest(body, "wrong-secret");
    const result = await verifySlackSignature(request, signingSecret);
    expect(result.valid).toBe(false);
  });

  it("rejects missing headers", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: "{}",
    });
    const result = await verifySlackSignature(request, signingSecret);
    expect(result.valid).toBe(false);
  });

  it("rejects requests older than 5 minutes (replay attack)", async () => {
    const body = JSON.stringify({ type: "event_callback" });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
    const request = buildRequest(body, signingSecret, oldTimestamp);
    const result = await verifySlackSignature(request, signingSecret);
    expect(result.valid).toBe(false);
  });
});

// ─── transitionTaskFromSlack ────────────────────────────────

describe("transitionTaskFromSlack", () => {
  function createMockAdminClient(taskStatus: string | null) {
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const insertFn = vi.fn().mockResolvedValue({ error: null });

    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "dtn_daily_tasks") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: taskStatus ? { status: taskStatus } : null,
                      error: taskStatus ? null : { message: "Not found" },
                    }),
                  }),
                }),
              }),
            }),
            update: updateFn,
          };
        }
        if (table === "dtn_task_events") {
          return { insert: insertFn };
        }
        return {};
      }),
      _updateFn: updateFn,
      _insertFn: insertFn,
    };
  }

  it("transitions pending → completed", async () => {
    const mock = createMockAdminClient("pending");
    const result = await transitionTaskFromSlack(
      mock as any,
      "task-1",
      "org-1",
      "completed",
      "actor-1",
    );
    // pending can transition to in_progress, waiting_approval, skipped, carried_over
    // NOT completed — need to go through in_progress first
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot transition");
  });

  it("transitions in_progress → completed", async () => {
    const mock = createMockAdminClient("in_progress");
    const result = await transitionTaskFromSlack(
      mock as any,
      "task-1",
      "org-1",
      "completed",
      "actor-1",
    );
    expect(result.success).toBe(true);
  });

  it("returns error for nonexistent task", async () => {
    const mock = createMockAdminClient(null);
    const result = await transitionTaskFromSlack(
      mock as any,
      "task-404",
      "org-1",
      "completed",
      "actor-1",
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("Task not found");
  });

  it("rejects invalid state transitions", async () => {
    const mock = createMockAdminClient("completed");
    const result = await transitionTaskFromSlack(
      mock as any,
      "task-1",
      "org-1",
      "pending",
      "actor-1",
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot transition");
  });
});

// ─── buildTaskCard ──────────────────────────────────────────

describe("buildTaskCard", () => {
  it("renders a pending task with start/complete/snooze/skip buttons", () => {
    const blocks = buildTaskCard({
      taskId: "task-1",
      title: "Write blog post",
      status: "pending",
      priority: "high",
    });

    // Should have section + fields + actions
    expect(blocks.length).toBeGreaterThanOrEqual(2);

    const actionsBlock = blocks.find((b: any) => b.type === "actions");
    expect(actionsBlock).toBeDefined();

    const actionIds = actionsBlock.elements.map((e: any) => e.action_id);
    expect(actionIds).toContain("dtn_start_task");
    expect(actionIds).toContain("dtn_complete_task");
    expect(actionIds).toContain("dtn_snooze_task");
    expect(actionIds).toContain("dtn_skip_task");
  });

  it("does not render action buttons for completed tasks", () => {
    const blocks = buildTaskCard({
      taskId: "task-2",
      title: "Done task",
      status: "completed",
    });

    const actionsBlock = blocks.find((b: any) => b.type === "actions");
    expect(actionsBlock).toBeUndefined();
  });

  it("includes priority field when provided", () => {
    const blocks = buildTaskCard({
      taskId: "task-3",
      title: "Urgent thing",
      status: "in_progress",
      priority: "urgent",
    });

    const fieldsBlock = blocks.find((b: any) => b.fields);
    expect(fieldsBlock).toBeDefined();
    expect(fieldsBlock.fields[0].text).toContain("Urgent");
  });
});

// ─── buildTaskListBlocks ────────────────────────────────────

describe("buildTaskListBlocks", () => {
  it("shows empty state for no tasks", () => {
    const blocks = buildTaskListBlocks([]);
    expect(blocks[0].text.text).toContain("no pending tasks");
  });

  it("limits to 10 tasks and shows overflow message", () => {
    const tasks = Array.from({ length: 15 }, (_, i) => ({
      taskId: `task-${i}`,
      title: `Task ${i}`,
      status: "pending",
    }));

    const blocks = buildTaskListBlocks(tasks);
    const contextBlock = blocks.find((b: any) => b.type === "context");
    expect(contextBlock).toBeDefined();
    expect(contextBlock.elements[0].text).toContain("5 more tasks");
  });

  it("renders a header for non-empty task list", () => {
    const blocks = buildTaskListBlocks([
      { taskId: "t1", title: "Task 1", status: "pending" },
    ]);

    expect(blocks[0].type).toBe("header");
    expect(blocks[0].text.text).toContain("1");
  });
});
