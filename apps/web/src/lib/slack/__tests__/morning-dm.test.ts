import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMorningDM } from "../handlers/morning-dm";

// Mock @dothesenow/queries
vi.mock("@dothesenow/queries", () => ({
  getTasksForOrg: vi.fn(),
}));

import { getTasksForOrg } from "@dothesenow/queries";

const mockGetTasksForOrg = vi.mocked(getTasksForOrg);

function createMockSlackClient() {
  return {
    users: {
      lookupByEmail: vi.fn(),
    },
    conversations: {
      open: vi.fn(),
    },
    chat: {
      postMessage: vi.fn(),
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockAdminClient(): any {
  return {} as any; // Only used for OrgContext construction
}

const BASE_PARAMS = {
  orgId: "org-1",
  userId: "user-1",
  userEmail: "alice@example.com",
  displayName: "Alice",
  scheduledDate: "2026-04-08",
};

describe("sendMorningDM", () => {
  let slackClient: ReturnType<typeof createMockSlackClient>;
  let adminClient: ReturnType<typeof createMockAdminClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    slackClient = createMockSlackClient();
    adminClient = createMockAdminClient();
  });

  it("returns sent:false when Slack user not found by email", async () => {
    slackClient.users.lookupByEmail.mockRejectedValue(
      new Error("users_not_found"),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sendMorningDM(adminClient, slackClient as any, BASE_PARAMS);

    expect(result).toEqual({ sent: false, reason: "slack_user_not_found" });
    expect(slackClient.conversations.open).not.toHaveBeenCalled();
  });

  it("returns sent:false when lookupByEmail returns no user id", async () => {
    slackClient.users.lookupByEmail.mockResolvedValue({ user: {} });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sendMorningDM(adminClient, slackClient as any, BASE_PARAMS);

    expect(result).toEqual({ sent: false, reason: "slack_user_not_found" });
  });

  it("sends 'no tasks' DM when user has zero active tasks", async () => {
    slackClient.users.lookupByEmail.mockResolvedValue({
      user: { id: "U123" },
    });
    slackClient.conversations.open.mockResolvedValue({
      channel: { id: "D456" },
    });

    mockGetTasksForOrg.mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sendMorningDM(adminClient, slackClient as any, BASE_PARAMS);

    expect(result).toEqual({ sent: true });
    expect(slackClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "D456",
        text: expect.stringContaining("no tasks"),
      }),
    );
  });

  it("sends task list DM with priority summary for multiple tasks", async () => {
    slackClient.users.lookupByEmail.mockResolvedValue({
      user: { id: "U123" },
    });
    slackClient.conversations.open.mockResolvedValue({
      channel: { id: "D456" },
    });

    mockGetTasksForOrg.mockResolvedValue([
      { id: "t1", title: "Urgent task", status: "pending", priority: "urgent" },
      { id: "t2", title: "High task", status: "in_progress", priority: "high" },
      { id: "t3", title: "Medium task", status: "pending", priority: "medium" },
      { id: "t4", title: "Completed task", status: "completed", priority: "low" },
    ] as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sendMorningDM(adminClient, slackClient as any, BASE_PARAMS);

    expect(result).toEqual({ sent: true });

    const call = slackClient.chat.postMessage.mock.calls[0][0];
    expect(call.channel).toBe("D456");
    expect(call.text).toContain("3 task(s)"); // completed is filtered out
    expect(call.blocks).toBeDefined();

    // Check that blocks include priority summary
    const summaryBlock = call.blocks.find(
      (b: any) => b.type === "section" && b.text?.text?.includes("urgent"),
    );
    expect(summaryBlock).toBeDefined();
  });

  it("filters out completed/skipped/carried_over tasks", async () => {
    slackClient.users.lookupByEmail.mockResolvedValue({
      user: { id: "U123" },
    });
    slackClient.conversations.open.mockResolvedValue({
      channel: { id: "D456" },
    });

    mockGetTasksForOrg.mockResolvedValue([
      { id: "t1", title: "Done", status: "completed", priority: "medium" },
      { id: "t2", title: "Skipped", status: "skipped", priority: "low" },
      { id: "t3", title: "Carried", status: "carried_over", priority: "low" },
    ] as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sendMorningDM(adminClient, slackClient as any, BASE_PARAMS);

    // No active tasks → sends "no tasks" message
    expect(result).toEqual({ sent: true });
    expect(slackClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("no tasks"),
      }),
    );
  });

  it("returns sent:false when conversations.open fails", async () => {
    slackClient.users.lookupByEmail.mockResolvedValue({
      user: { id: "U123" },
    });
    mockGetTasksForOrg.mockResolvedValue([
      { id: "t1", title: "Task", status: "pending", priority: "medium" },
    ] as any);
    slackClient.conversations.open.mockResolvedValue({ channel: {} });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sendMorningDM(adminClient, slackClient as any, BASE_PARAMS);

    expect(result).toEqual({ sent: false, reason: "dm_channel_open_failed" });
  });

  it("returns sent:false with error message on unexpected error", async () => {
    slackClient.users.lookupByEmail.mockResolvedValue({
      user: { id: "U123" },
    });
    mockGetTasksForOrg.mockRejectedValue(new Error("DB connection failed"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sendMorningDM(adminClient, slackClient as any, BASE_PARAMS);

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("DB connection failed");
  });
});
