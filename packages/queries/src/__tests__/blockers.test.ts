import { describe, it, expect, vi } from "vitest";
import {
  createBlocker,
  getBlockerById,
  getBlockerForTask,
  getOpenBlockersForOrg,
  updateBlocker,
  getStaleBlockers,
} from "../blockers.js";
import type { OrgContext } from "../context.js";

// ─── Mock helpers ──────────────────────────────────────────────

const ORG_ID = "org-test-blockers";

const MOCK_BLOCKER = {
  id: "blocker-1",
  task_id: "task-1",
  org_id: ORG_ID,
  description: "Can't find competitor pricing",
  reported_by: "user-1",
  blocker_type: null,
  blocker_type_secondary: null,
  classification_confidence: null,
  classification_reasoning: null,
  resolution_status: "reported",
  resolution_output: null,
  resolution_metadata: {},
  resolved_at: null,
  resolved_by: null,
  escalation_level: 0,
  last_escalated_at: null,
  inngest_run_id: null,
  created_at: "2026-04-07T10:00:00Z",
  updated_at: "2026-04-07T10:00:00Z",
};

function mockInsertCtx(overrides: {
  data?: unknown;
  error?: { message: string } | null;
} = {}): OrgContext {
  const singleMock = vi.fn().mockResolvedValue({
    data: overrides.data ?? MOCK_BLOCKER,
    error: overrides.error ?? null,
  });
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const insertMock = vi.fn().mockReturnValue({ select: selectMock });
  const fromMock = vi.fn().mockReturnValue({ insert: insertMock });

  return {
    client: { from: fromMock } as unknown as OrgContext["client"],
    orgId: ORG_ID,
  };
}

function mockSelectCtx(overrides: {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  single?: boolean;
} = {}): OrgContext {
  const resolved = {
    data: overrides.data ?? null,
    error: overrides.error ?? null,
  };

  const singleMock = vi.fn().mockResolvedValue(resolved);
  const maybeSingleMock = vi.fn().mockResolvedValue(resolved);
  const limitMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
  const orderMock = vi.fn().mockReturnValue({
    ...resolved,
    limit: limitMock,
  });

  // Also mock for array results
  if (Array.isArray(overrides.data)) {
    orderMock.mockResolvedValue({
      data: overrides.data,
      error: overrides.error ?? null,
    });
  }

  const notMock = vi.fn().mockReturnValue({ order: orderMock });
  const neqMock = vi.fn().mockReturnValue({ order: orderMock });
  const inMock = vi.fn().mockReturnValue({
    lt: vi.fn().mockReturnValue({
      lt: vi.fn().mockReturnValue({
        order: orderMock,
      }),
    }),
  });

  const thirdEq = vi.fn().mockReturnValue({
    order: orderMock,
    single: singleMock,
    neq: neqMock,
    not: notMock,
    in: inMock,
  });
  const secondEq = vi.fn().mockReturnValue({
    ...thirdEq.mockReturnValue({
      order: orderMock,
      single: singleMock,
      neq: neqMock,
      not: notMock,
      in: inMock,
    }),
    eq: thirdEq,
    single: singleMock,
    neq: neqMock,
    not: notMock,
    in: inMock,
  });
  const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
  const selectMock = vi.fn().mockReturnValue({ eq: firstEq });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });

  return {
    client: { from: fromMock } as unknown as OrgContext["client"],
    orgId: ORG_ID,
  };
}

function mockUpdateCtx(overrides: {
  data?: unknown;
  error?: { message: string } | null;
} = {}): OrgContext {
  const singleMock = vi.fn().mockResolvedValue({
    data: overrides.data ?? MOCK_BLOCKER,
    error: overrides.error ?? null,
  });
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const secondEq = vi.fn().mockReturnValue({ select: selectMock });
  const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
  const updateMock = vi.fn().mockReturnValue({ eq: firstEq });
  const fromMock = vi.fn().mockReturnValue({ update: updateMock });

  return {
    client: { from: fromMock } as unknown as OrgContext["client"],
    orgId: ORG_ID,
  };
}

// ─── createBlocker ──────────────────────────────────────────────

describe("createBlocker", () => {
  it("inserts a blocker and returns it", async () => {
    const ctx = mockInsertCtx();
    const result = await createBlocker(ctx, {
      task_id: "task-1",
      description: "Can't find competitor pricing",
      reported_by: "user-1",
    });
    expect(result.id).toBe("blocker-1");
    expect(result.resolution_status).toBe("reported");
    expect((ctx.client.from as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("dtn_blockers");
  });

  it("throws QueryError on insert failure", async () => {
    const ctx = mockInsertCtx({ error: { message: "FK violation" } });
    await expect(
      createBlocker(ctx, {
        task_id: "bad-task",
        description: "test",
        reported_by: "user-1",
      }),
    ).rejects.toThrow("FK violation");
  });
});

// ─── getBlockerById ─────────────────────────────────────────────

describe("getBlockerById", () => {
  it("returns blocker when found", async () => {
    const ctx = mockSelectCtx({ data: MOCK_BLOCKER });
    const result = await getBlockerById(ctx, "blocker-1");
    expect(result?.id).toBe("blocker-1");
  });

  it("returns null when not found", async () => {
    const ctx = mockSelectCtx({ error: { message: "not found", code: "PGRST116" } as { message: string; code?: string } });
    const result = await getBlockerById(ctx, "nonexistent");
    expect(result).toBeNull();
  });
});

// ─── updateBlocker ──────────────────────────────────────────────

describe("updateBlocker", () => {
  it("updates blocker and returns updated row", async () => {
    const updated = { ...MOCK_BLOCKER, resolution_status: "classified", blocker_type: "knowledge_gap" };
    const ctx = mockUpdateCtx({ data: updated });
    const result = await updateBlocker(ctx, "blocker-1", {
      resolution_status: "classified",
      blocker_type: "knowledge_gap",
    });
    expect(result.resolution_status).toBe("classified");
    expect((ctx.client.from as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("dtn_blockers");
  });

  it("throws QueryError on update failure", async () => {
    const ctx = mockUpdateCtx({ error: { message: "permission denied" } });
    await expect(
      updateBlocker(ctx, "blocker-1", { resolution_status: "resolved" }),
    ).rejects.toThrow("permission denied");
  });
});
