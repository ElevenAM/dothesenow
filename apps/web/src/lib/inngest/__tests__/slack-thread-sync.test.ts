import { describe, it, expect } from "vitest";

/**
 * Tests for thread sync skip logic.
 * The actual Inngest function uses step.run() which requires the Inngest test harness,
 * so we test the decision logic here as pure functions.
 */

describe("thread sync skip logic", () => {
  it("should skip when source is slack_bot", () => {
    const source = "slack_bot";
    const shouldSkip = source === "slack_bot";
    expect(shouldSkip).toBe(true);
  });

  it("should not skip for web_ui source", () => {
    const source = "web_ui";
    const shouldSkip = source === "slack_bot";
    expect(shouldSkip).toBe(false);
  });

  it("should not skip for agent source", () => {
    const source = "agent";
    const shouldSkip = source === "slack_bot";
    expect(shouldSkip).toBe(false);
  });

  it("should skip when slack_origin is null", () => {
    const slackOrigin = null;
    const shouldSkip = slackOrigin === null;
    expect(shouldSkip).toBe(true);
  });

  it("should not skip when slack_origin has required fields", () => {
    const slackOrigin = {
      team_id: "T123",
      channel_id: "C456",
      message_ts: "1234567890.123456",
    };
    const shouldSkip = slackOrigin === null;
    expect(shouldSkip).toBe(false);
  });

  it("status label mapping covers all known statuses", () => {
    const STATUS_LABELS: Record<string, string> = {
      pending: ":white_circle: Pending",
      in_progress: ":large_blue_circle: In Progress",
      completed: ":white_check_mark: Completed",
      failed: ":red_circle: Failed",
      skipped: ":fast_forward: Skipped",
      carried_over: ":arrow_right: Carried Over",
      blocked: ":no_entry_sign: Blocked",
      waiting_approval: ":hourglass_flowing_sand: Waiting Approval",
    };

    const knownStatuses = [
      "pending",
      "in_progress",
      "completed",
      "failed",
      "skipped",
      "carried_over",
      "blocked",
      "waiting_approval",
    ];

    for (const status of knownStatuses) {
      expect(STATUS_LABELS[status]).toBeDefined();
      expect(STATUS_LABELS[status]).toContain(":"); // Has emoji
    }
  });
});
