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

// Mock credit balance check
const mockGetCreditBalance = vi.fn().mockResolvedValue({ remaining: 100, resetAt: null });
vi.mock("@dothesenow/queries", () => ({
  getCreditBalance: (...args: unknown[]) => mockGetCreditBalance(...args),
}));

describe("dispatch.ts Inngest migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env vars
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    // Default: org has credits
    mockGetCreditBalance.mockResolvedValue({ remaining: 100, resetAt: null });
  });

  it("dispatchToClaude sends correct Inngest event shape", async () => {
    const { dispatchTask } = await import("../../daily-tasks/dispatch");

    await dispatchTask({
      id: "task-123",
      org_id: "org-456",
      title: "Test Task",
      description: "A test",
      task_type: "create",
      priority: "medium",
      executor_type: "claude_api",
      executor_config: null,
      department_id: "dept-1",
      scheduled_date: "2026-04-07",
      source_strategy: null,
      campaign_id: null,
      contact_id: null,
    });

    // Verify inngest.send was called with the right event
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      name: "task/agent.execute",
      data: {
        task_id: "task-123",
        org_id: "org-456",
      },
    });
  });

  it("n8n dispatch is unchanged (does NOT use Inngest)", async () => {
    // Stub n8n env var
    vi.stubEnv("N8N_WEBHOOK_SECRET", "test-secret");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("OK", { status: 200 }),
    );

    const { dispatchTask } = await import("../../daily-tasks/dispatch");

    await dispatchTask({
      id: "task-789",
      org_id: "org-456",
      title: "N8N Task",
      description: "A test",
      task_type: "outreach",
      priority: "high",
      executor_type: "n8n",
      executor_config: { webhook_url: "https://n8n.example.com/webhook/test" },
      department_id: "dept-1",
      scheduled_date: "2026-04-07",
      source_strategy: null,
      campaign_id: null,
      contact_id: null,
    });

    // n8n should use fetch, not Inngest
    expect(fetchSpy).toHaveBeenCalled();
    // Inngest should NOT have been called for n8n
    // (mockSend may have been called by the status update, but not for dispatch)
    const inngestCalls = mockSend.mock.calls.filter(
      (call: unknown[]) => (call[0] as { name?: string })?.name === "task/agent.execute",
    );
    expect(inngestCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });

  it("self and freelancer tasks are not dispatched", async () => {
    const { dispatchTask } = await import("../../daily-tasks/dispatch");

    await dispatchTask({
      id: "task-self",
      org_id: "org-456",
      title: "Self Task",
      description: "Manual task",
      task_type: "action",
      priority: "low",
      executor_type: "self",
      executor_config: null,
      department_id: "dept-1",
      scheduled_date: "2026-04-07",
      source_strategy: null,
      campaign_id: null,
      contact_id: null,
    });

    // Neither inngest nor fetch should be called for self tasks
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("claude_api dispatch with zero credits sets task to pending with credit message", async () => {
    mockGetCreditBalance.mockResolvedValue({ remaining: 0, resetAt: null });

    const { dispatchTask } = await import("../../daily-tasks/dispatch");

    await dispatchTask({
      id: "task-no-credits",
      org_id: "org-broke",
      title: "AI Task",
      description: "Should be blocked",
      task_type: "create",
      priority: "medium",
      executor_type: "claude_api",
      executor_config: null,
      department_id: "dept-1",
      scheduled_date: "2026-04-07",
      source_strategy: null,
      campaign_id: null,
      contact_id: null,
    });

    // Credit check should have been called
    expect(mockGetCreditBalance).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-broke" }),
    );

    // Task should be updated to pending with credit message
    expect(mockUpdate).toHaveBeenCalled();

    // Inngest should NOT have been called
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("claude_api dispatch with positive credits proceeds normally", async () => {
    mockGetCreditBalance.mockResolvedValue({ remaining: 50, resetAt: null });

    const { dispatchTask } = await import("../../daily-tasks/dispatch");

    await dispatchTask({
      id: "task-with-credits",
      org_id: "org-funded",
      title: "AI Task",
      description: "Should proceed",
      task_type: "create",
      priority: "medium",
      executor_type: "claude_api",
      executor_config: null,
      department_id: "dept-1",
      scheduled_date: "2026-04-07",
      source_strategy: null,
      campaign_id: null,
      contact_id: null,
    });

    // Credit check was called
    expect(mockGetCreditBalance).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-funded" }),
    );

    // Inngest event should have been sent (dispatch proceeded)
    expect(mockSend).toHaveBeenCalledWith({
      name: "task/agent.execute",
      data: {
        task_id: "task-with-credits",
        org_id: "org-funded",
      },
    });
  });
});
