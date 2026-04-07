import { describe, it, expect, beforeEach, vi } from "vitest";
import { onboardingSetProfile } from "@/lib/onboarding/actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Industry, BudgetTier } from "@dothesenow/types";

describe("onboardingSetProfile", () => {
  let mockUserClient: ReturnType<typeof buildMockClient>;
  let mockAdmin: ReturnType<typeof buildMockAdmin>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserClient = buildMockClient();
    mockAdmin = buildMockAdmin();
    vi.mocked(createClient).mockResolvedValue(mockUserClient as never);
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never);
  });

  it("returns error when not authenticated", async () => {
    mockUserClient.auth.getUser.mockResolvedValue({
      data: { user: null },
    } as never);

    const result = await onboardingSetProfile(
      Industry.B2bSaas,
      BudgetTier.Bootstrap,
    );
    expect(result).toEqual({ error: "Not authenticated" });
  });

  it("returns error when membership query fails", async () => {
    mockUserClient._membershipResult = {
      data: null,
      error: { message: "RLS violation", code: "42501" },
    };

    const result = await onboardingSetProfile(
      Industry.B2bSaas,
      BudgetTier.Bootstrap,
    );
    expect(result).toEqual({ error: "Something went wrong. Please try again." });
  });

  it("returns error when no active membership", async () => {
    mockUserClient._membershipResult = { data: null, error: null };

    const result = await onboardingSetProfile(
      Industry.B2bSaas,
      BudgetTier.Bootstrap,
    );
    expect(result).toEqual({ error: "No active organization found" });
  });

  it("updates org with industry, stage, budget_tier, growth_motion, and onboarding_completed_at", async () => {
    const result = await onboardingSetProfile(
      Industry.B2bSaas,
      BudgetTier.Bootstrap,
    );

    expect(result).toEqual({ success: true });
    expect(mockAdmin._lastUpdate).toMatchObject({
      industry: "b2b_saas",
      stage: "early",
      budget_tier: "bootstrap",
      growth_motion: "product_led",
    });
    expect(mockAdmin._lastUpdate.onboarding_completed_at).toBeDefined();
    expect(mockAdmin._lastOrgId).toBe("org-1");
  });

  it("returns error when update fails", async () => {
    mockAdmin._updateError = { message: "DB error" };

    const result = await onboardingSetProfile(
      Industry.DevTools,
      BudgetTier.Growth,
    );
    expect(result).toEqual({ error: "Failed to save profile. Please try again." });
  });
});

// ─── Helpers ─────────────────────────────────────────────────

function buildMockClient() {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "test@example.com" } },
      }),
    },
    from: vi.fn(),
    _membershipResult: {
      data: { org_id: "org-1" },
      error: null,
    } as { data: { org_id: string } | null; error: unknown },
  };

  // Chain: from("dtn_memberships").select().eq().eq().order().limit().maybeSingle()
  client.from.mockImplementation(() => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockImplementation(() =>
        Promise.resolve(client._membershipResult),
      ),
    };
    return chain;
  });

  return client;
}

function buildMockAdmin() {
  const admin = {
    from: vi.fn(),
    _lastUpdate: null as Record<string, unknown> | null,
    _lastOrgId: null as string | null,
    _updateError: null as { message: string } | null,
  };

  admin.from.mockImplementation(() => {
    const chain = {
      update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        admin._lastUpdate = data;
        return {
          eq: vi.fn().mockImplementation((_col: string, val: string) => {
            admin._lastOrgId = val;
            return Promise.resolve({ error: admin._updateError });
          }),
        };
      }),
    };
    return chain;
  });

  return admin;
}
