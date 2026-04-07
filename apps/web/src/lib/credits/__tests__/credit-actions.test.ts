import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";

// Mock the queries package
vi.mock("@dothesenow/queries", () => ({
  getCreditBalance: vi.fn(),
  getCreditHistory: vi.fn(),
}));

import { getCreditBalance, getCreditHistory } from "@dothesenow/queries";
import { getCreditUsage } from "../actions";

const mockGetCreditBalance = vi.mocked(getCreditBalance);
const mockGetCreditHistory = vi.mocked(getCreditHistory);
const mockCreateClient = vi.mocked(createClient);

function setupMockSupabase(opts: {
  userId?: string | null;
  membership?: { org_id: string; dtn_organizations: { id: string; plan: string } } | null;
}) {
  const userId = opts.userId ?? "user-1";

  const singleMock = vi.fn().mockResolvedValue({
    data: opts.membership ?? null,
    error: opts.membership ? null : { message: "not found" },
  });

  const eqChain = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ single: singleMock }),
  });

  const fromMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ eq: eqChain }),
  });

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: fromMock,
  };

  mockCreateClient.mockResolvedValue(client as unknown as ReturnType<typeof createClient> extends Promise<infer T> ? T : never);

  return client;
}

describe("getCreditUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct credit usage shape", async () => {
    setupMockSupabase({
      membership: {
        org_id: "org-1",
        dtn_organizations: { id: "org-1", plan: "starter" },
      },
    });

    mockGetCreditBalance.mockResolvedValue({
      remaining: 42,
      resetAt: "2026-04-01T00:00:00Z",
    });

    mockGetCreditHistory.mockResolvedValue({
      entries: [
        {
          id: "e1",
          org_id: "org-1",
          amount: -5,
          balance_after: 42,
          reason: "AI task",
          status: "confirmed",
          reference_id: null,
          created_at: "2026-04-01",
          updated_at: "2026-04-01",
        },
      ],
      total: 1,
    });

    const result = await getCreditUsage();

    expect(result.remaining).toBe(42);
    expect(result.total).toBe(50); // starter plan limit
    expect(result.resetAt).toBe("2026-04-01T00:00:00Z");
    expect(result.recentHistory).toHaveLength(1);
    expect(result.recentHistory[0].reason).toBe("AI task");
  });

  it("throws when user is not authenticated", async () => {
    const client = setupMockSupabase({ userId: null });
    // Override getUser to return null user
    client.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
    });

    await expect(getCreditUsage()).rejects.toThrow("Not authenticated");
  });
});
