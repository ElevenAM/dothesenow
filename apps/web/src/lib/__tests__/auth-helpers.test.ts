import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { setMockCookie, clearMockCookies } from "@/__tests__/setup";

// Build a mock Supabase client
function mockSupabaseClient(memberships: Record<string, unknown>[] | null, user: { id: string; email: string } | null = { id: "user-1", email: "test@example.com" }) {
  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  };
  // After all .eq() calls, the data resolves
  Object.defineProperty(selectChain, "then", {
    value: (resolve: (val: { data: typeof memberships; error: null }) => void) => {
      resolve({ data: memberships, error: null });
    },
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    }),
  };
}

describe("getAuthenticatedMembership", () => {
  beforeEach(() => {
    clearMockCookies();
    vi.clearAllMocks();
  });

  const mockMemberships = [
    {
      id: "mem-1",
      org_id: "org-1",
      role: "owner",
      dtn_organizations: {
        id: "org-1",
        name: "Acme Corp",
        slug: "acme",
        plan: "free",
        plan_status: "active",
      },
    },
    {
      id: "mem-2",
      org_id: "org-2",
      role: "member",
      dtn_organizations: {
        id: "org-2",
        name: "Beta Inc",
        slug: "beta",
        plan: "starter",
        plan_status: "active",
      },
    },
  ];

  it("returns membership matching cookie org", async () => {
    const client = mockSupabaseClient(mockMemberships);
    vi.mocked(createClient).mockResolvedValue(client as never);
    setMockCookie("dtn_active_org", "org-2");

    const result = await getAuthenticatedMembership();

    expect(result.membership.orgId).toBe("org-2");
    expect(result.org.name).toBe("Beta Inc");
  });

  it("falls back to first org when cookie is invalid", async () => {
    const client = mockSupabaseClient(mockMemberships);
    vi.mocked(createClient).mockResolvedValue(client as never);
    setMockCookie("dtn_active_org", "org-nonexistent");

    const result = await getAuthenticatedMembership();

    expect(result.membership.orgId).toBe("org-1");
    expect(result.org.name).toBe("Acme Corp");
  });

  it("falls back to first org when no cookie exists", async () => {
    const client = mockSupabaseClient(mockMemberships);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await getAuthenticatedMembership();

    expect(result.membership.orgId).toBe("org-1");
  });

  it("throws when user is not authenticated", async () => {
    const client = mockSupabaseClient(mockMemberships, null);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(getAuthenticatedMembership()).rejects.toThrow(
      "Not authenticated"
    );
  });

  it("throws when no active memberships exist", async () => {
    const client = mockSupabaseClient([]);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(getAuthenticatedMembership()).rejects.toThrow(
      "No active organization membership"
    );
  });

  it("throws when required role is not met", async () => {
    const client = mockSupabaseClient([mockMemberships[1]]); // member role only
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      getAuthenticatedMembership(["owner"])
    ).rejects.toThrow("This action requires one of these roles: owner");
  });

  it("populates allOrgs with all memberships", async () => {
    const client = mockSupabaseClient(mockMemberships);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await getAuthenticatedMembership();

    expect(result.allOrgs).toHaveLength(2);
    expect(result.allOrgs[0].slug).toBe("acme");
    expect(result.allOrgs[1].slug).toBe("beta");
  });
});
