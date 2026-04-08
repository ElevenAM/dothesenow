import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock inngest client
const mockSend = vi.fn().mockResolvedValue({ ids: ["evt-1"] });
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockSend },
}));

// Mock supabase admin
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }),
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      update: mockUpdate,
    }),
  })),
}));

// Mock executor registry — claude_api and n8n are dispatchable, self/freelancer are not
vi.mock("@/lib/executors/registry", () => ({
  getExecutor: (type: string) => {
    if (type === "claude_api" || type === "n8n" || type === "jasper_api") {
      return { type, dispatch: vi.fn() };
    }
    return undefined; // self, freelancer — no-op
  },
  getExecutorAvailability: () => ({
    self: { available: true },
    freelancer: { available: true },
    claude_api: { available: true },
    n8n: { available: true },
  }),
}));

const baseTask = {
  id: "task-123",
  org_id: "org-456",
  title: "Test Task",
  description: "A test",
  task_type: "create" as const,
  priority: "medium" as const,
  executor_config: null,
  department_id: "dept-1",
  scheduled_date: "2026-04-07",
  source_strategy: null,
  campaign_id: null,
  contact_id: null,
};

describe("dispatch.ts — unified Inngest dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches claude_api tasks via task/dispatch.requested event", async () => {
    const { dispatchTask } = await import("../../daily-tasks/dispatch");

    await dispatchTask({ ...baseTask, executor_type: "claude_api" });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      name: "task/dispatch.requested",
      data: {
        task_id: "task-123",
        org_id: "org-456",
        executor_type: "claude_api",
      },
    });
  });

  it("dispatches n8n tasks via task/dispatch.requested event (not direct fetch)", async () => {
    const { dispatchTask } = await import("../../daily-tasks/dispatch");

    await dispatchTask({
      ...baseTask,
      id: "task-789",
      executor_type: "n8n",
      executor_config: { webhook_url: "https://n8n.example.com/webhook/test" },
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      name: "task/dispatch.requested",
      data: {
        task_id: "task-789",
        org_id: "org-456",
        executor_type: "n8n",
      },
    });
  });

  it("self and freelancer tasks are not dispatched", async () => {
    const { dispatchTask } = await import("../../daily-tasks/dispatch");

    await dispatchTask({ ...baseTask, id: "task-self", executor_type: "self" });
    await dispatchTask({ ...baseTask, id: "task-free", executor_type: "freelancer" });

    // Neither inngest.send nor DB update should be called
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("marks task in_progress before sending Inngest event", async () => {
    const { dispatchTask } = await import("../../daily-tasks/dispatch");

    await dispatchTask({ ...baseTask, executor_type: "claude_api" });

    // update() should have been called before send()
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalled();

    // Verify the order: update was called first
    const updateOrder = mockUpdate.mock.invocationCallOrder[0];
    const sendOrder = mockSend.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(sendOrder);
  });

  it("rolls back to pending if inngest.send() fails", async () => {
    mockSend.mockRejectedValueOnce(new Error("Inngest unavailable"));

    const { dispatchTask } = await import("../../daily-tasks/dispatch");

    await expect(
      dispatchTask({ ...baseTask, executor_type: "claude_api" }),
    ).rejects.toThrow("Inngest unavailable");

    // Should have called update twice: once for in_progress, once for rollback to pending
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });
});
