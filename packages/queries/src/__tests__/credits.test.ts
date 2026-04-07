import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  reserveCredits,
  confirmCredits,
  refundCredits,
  refundByReference,
  getCreditBalance,
  getCreditHistory,
} from "../credits.js";
import type { OrgContext } from "../context.js";

// ─── Mock helpers ──────────────────────────────────────────────

function mockCtx(overrides: {
  rpcData?: unknown;
  rpcError?: { message: string } | null;
  selectData?: unknown;
  selectError?: { message: string } | null;
  selectCount?: number | null;
} = {}): OrgContext {
  const rpcMock = vi.fn().mockResolvedValue({
    data: overrides.rpcData ?? null,
    error: overrides.rpcError ?? null,
  });

  const rangeMock = vi.fn().mockResolvedValue({
    data: overrides.selectData ?? [],
    error: overrides.selectError ?? null,
    count: overrides.selectCount ?? 0,
  });

  const orderMock = vi.fn().mockReturnValue({ range: rangeMock });

  // Build a chainable eq mock that supports both `.eq().single()` and `.eq().order().range()`
  const eqMock = vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({
      data: overrides.selectData ?? null,
      error: overrides.selectError ?? null,
    }),
    order: orderMock,
  });

  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

  const fromMock = vi.fn().mockReturnValue({ select: selectMock });

  return {
    client: { rpc: rpcMock, from: fromMock } as unknown as OrgContext["client"],
    orgId: "org-test-123",
  };
}

// ─── reserveCredits ────────────────────────────────────────────

describe("reserveCredits", () => {
  it("calls reserve_credits RPC and returns ledger ID", async () => {
    const ctx = mockCtx({ rpcData: "ledger-uuid-1" });

    const result = await reserveCredits(ctx, 5, "AI task execution", "task-123");

    expect(ctx.client.rpc).toHaveBeenCalledWith("reserve_credits", {
      p_org_id: "org-test-123",
      p_amount: 5,
      p_reason: "AI task execution",
      p_reference_id: "task-123",
    });
    expect(result).toBe("ledger-uuid-1");
  });

  it("passes null for referenceId when not provided", async () => {
    const ctx = mockCtx({ rpcData: "ledger-uuid-2" });

    await reserveCredits(ctx, 1, "test");

    expect(ctx.client.rpc).toHaveBeenCalledWith("reserve_credits", {
      p_org_id: "org-test-123",
      p_amount: 1,
      p_reason: "test",
      p_reference_id: null,
    });
  });

  it("throws QueryError when RPC returns insufficient credits", async () => {
    const ctx = mockCtx({
      rpcError: { message: "Insufficient credits: have 3, need 5" },
    });

    await expect(reserveCredits(ctx, 5, "test")).rejects.toThrow(
      "Insufficient credits"
    );
  });

  it("throws QueryError when org not found", async () => {
    const ctx = mockCtx({
      rpcError: { message: "Organization not found: org-test-123" },
    });

    await expect(reserveCredits(ctx, 1, "test")).rejects.toThrow(
      "Organization not found"
    );
  });
});

// ─── confirmCredits ────────────────────────────────────────────

describe("confirmCredits", () => {
  it("calls confirm_credits RPC", async () => {
    const ctx = mockCtx();

    await confirmCredits(ctx, "ledger-id-1");

    expect(ctx.client.rpc).toHaveBeenCalledWith("confirm_credits", {
      p_ledger_id: "ledger-id-1",
    });
  });

  it("throws when RPC errors (e.g., already refunded)", async () => {
    const ctx = mockCtx({
      rpcError: { message: "Cannot confirm ledger entry: already refunded" },
    });

    await expect(confirmCredits(ctx, "bad-id")).rejects.toThrow("Cannot confirm");
  });
});

// ─── refundCredits ─────────────────────────────────────────────

describe("refundCredits", () => {
  it("calls refund_credits RPC", async () => {
    const ctx = mockCtx();

    await refundCredits(ctx, "ledger-id-2");

    expect(ctx.client.rpc).toHaveBeenCalledWith("refund_credits", {
      p_ledger_id: "ledger-id-2",
    });
  });

  it("throws when RPC errors (e.g., already confirmed)", async () => {
    const ctx = mockCtx({
      rpcError: { message: "Cannot refund a confirmed ledger entry" },
    });

    await expect(refundCredits(ctx, "bad-id")).rejects.toThrow(
      "Cannot refund"
    );
  });
});

// ─── refundByReference ─────────────────────────────────────────

describe("refundByReference", () => {
  it("calls refund_credits_by_reference RPC and returns count", async () => {
    const ctx = mockCtx({ rpcData: 2 });

    const count = await refundByReference(ctx, "task-456");

    expect(ctx.client.rpc).toHaveBeenCalledWith("refund_credits_by_reference", {
      p_org_id: "org-test-123",
      p_reference_id: "task-456",
    });
    expect(count).toBe(2);
  });

  it("returns 0 when no reserved entries exist", async () => {
    const ctx = mockCtx({ rpcData: 0 });

    const count = await refundByReference(ctx, "task-789");
    expect(count).toBe(0);
  });
});

// ─── getCreditBalance ──────────────────────────────────────────

describe("getCreditBalance", () => {
  it("returns remaining and resetAt from org row", async () => {
    const ctx = mockCtx({
      selectData: {
        ai_credits_remaining: 42,
        ai_credits_reset_at: "2026-04-01T00:00:00Z",
      },
    });

    const result = await getCreditBalance(ctx);

    expect(result).toEqual({
      remaining: 42,
      resetAt: "2026-04-01T00:00:00Z",
    });
  });

  it("throws when org not found", async () => {
    const ctx = mockCtx({
      selectData: null,
      selectError: { message: "not found" },
    });

    await expect(getCreditBalance(ctx)).rejects.toThrow("not found");
  });
});

// ─── getCreditHistory ──────────────────────────────────────────

describe("getCreditHistory", () => {
  it("returns entries and total count", async () => {
    const entries = [
      { id: "1", org_id: "org-1", amount: -5, balance_after: 45, reason: "test", status: "confirmed", reference_id: null, created_at: "2026-04-01", updated_at: "2026-04-01" },
    ];
    const ctx = mockCtx({ selectData: entries, selectCount: 1 });

    const result = await getCreditHistory(ctx, { limit: 10, offset: 0 });

    expect(result.entries).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
