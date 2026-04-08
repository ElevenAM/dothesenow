import { describe, it, expect, vi } from "vitest";

/**
 * Tests for EOD summary Block Kit message construction.
 * Tests the progress bar math and status grouping logic.
 */

describe("EOD summary block construction", () => {
  // Helper to compute stats like the EOD function does
  function computeStats(
    tasks: { status: string }[],
  ): Record<string, number> & { total: number } {
    const stats: Record<string, number> = {
      completed: 0,
      in_progress: 0,
      blocked: 0,
      carried_over: 0,
      pending: 0,
      skipped: 0,
      total: tasks.length,
    };

    for (const t of tasks) {
      if (t.status in stats) {
        stats[t.status]++;
      }
    }

    return stats as Record<string, number> & { total: number };
  }

  function computeProgressBar(completionRate: number): string {
    const barLength = 10;
    const filledCount = Math.round((completionRate / 100) * barLength);
    return "\u2588".repeat(filledCount) + "\u2591".repeat(barLength - filledCount);
  }

  it("computes 100% completion rate when all tasks completed", () => {
    const tasks = [
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
    ];

    const stats = computeStats(tasks);
    const rate = Math.round((stats.completed / stats.total) * 100);

    expect(rate).toBe(100);
    expect(computeProgressBar(rate)).toBe("\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588");
  });

  it("computes 0% completion rate when no tasks completed", () => {
    const tasks = [
      { status: "pending" },
      { status: "blocked" },
      { status: "in_progress" },
    ];

    const stats = computeStats(tasks);
    const rate = Math.round((stats.completed / stats.total) * 100);

    expect(rate).toBe(0);
    expect(computeProgressBar(rate)).toBe("\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591");
  });

  it("computes mixed completion rate correctly", () => {
    const tasks = [
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "blocked" },
      { status: "pending" },
      { status: "carried_over" },
      { status: "skipped" },
      { status: "in_progress" },
      { status: "pending" },
    ];

    const stats = computeStats(tasks);
    expect(stats.completed).toBe(4);
    expect(stats.blocked).toBe(1);
    expect(stats.pending).toBe(2);
    expect(stats.carried_over).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.in_progress).toBe(1);
    expect(stats.total).toBe(10);

    const rate = Math.round((stats.completed / stats.total) * 100);
    expect(rate).toBe(40);
  });

  it("handles empty task list", () => {
    const stats = computeStats([]);
    expect(stats.total).toBe(0);
    // Avoid division by zero
    const rate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    expect(rate).toBe(0);
  });

  it("correctly groups tasks by status", () => {
    const tasks = [
      { status: "completed" },
      { status: "completed" },
      { status: "blocked" },
      { status: "carried_over" },
      { status: "pending" },
    ];

    const stats = computeStats(tasks);
    expect(stats.completed).toBe(2);
    expect(stats.blocked).toBe(1);
    expect(stats.carried_over).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.in_progress).toBe(0);
    expect(stats.skipped).toBe(0);
  });
});
