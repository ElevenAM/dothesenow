import { describe, it, expect, vi } from "vitest";
import type { OrgContext } from "../context.js";
import { getTasksForOrg } from "../tasks.js";
import { getContactsForOrg } from "../contacts.js";
import { getStrategyDocs } from "../strategy.js";
import { getApprovalsForOrg } from "../approvals.js";
import { getMembershipsForOrg } from "../memberships.js";

/**
 * These tests verify that every query module correctly scopes queries
 * by the orgId from the OrgContext. We use two different orgIds and
 * verify that the correct one is passed to .eq("org_id", ...).
 */

function createTrackingClient() {
  const orgIdCalls: string[] = [];
  const result = { data: [], error: null, count: 0 };

  // A thenable chain: every method returns the chain, and awaiting resolves to `result`
  const chain: Record<string, unknown> = {};
  const chainFn = () => chain;

  chain.select = vi.fn(chainFn);
  chain.eq = vi.fn((col: string, val: string) => {
    if (col === "org_id") orgIdCalls.push(val);
    return chain;
  });
  chain.order = vi.fn(chainFn);
  chain.range = vi.fn(chainFn);
  chain.limit = vi.fn(chainFn);
  chain.or = vi.fn(chainFn);
  chain.in = vi.fn(chainFn);
  chain.lt = vi.fn(chainFn);
  chain.gte = vi.fn(chainFn);
  chain.lte = vi.fn(chainFn);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  // Make the chain itself thenable so `await query` works
  chain.then = (resolve: (v: unknown) => void) => resolve(result);

  const from = vi.fn().mockReturnValue(chain);

  return { from, chain, orgIdCalls };
}

function makeCtx(orgId: string): OrgContext {
  const mock = createTrackingClient();
  return {
    client: mock as unknown as OrgContext["client"],
    orgId,
    _mock: mock,
  } as OrgContext & { _mock: ReturnType<typeof createTrackingClient> };
}

describe("org isolation", () => {
  const ORG_A = "org-aaaa-1111";
  const ORG_B = "org-bbbb-2222";

  it("getTasksForOrg scopes to correct org", async () => {
    const ctxA = makeCtx(ORG_A) as OrgContext & { _mock: ReturnType<typeof createTrackingClient> };
    const ctxB = makeCtx(ORG_B) as OrgContext & { _mock: ReturnType<typeof createTrackingClient> };

    await getTasksForOrg(ctxA);
    await getTasksForOrg(ctxB);

    expect(ctxA._mock.orgIdCalls).toContain(ORG_A);
    expect(ctxA._mock.orgIdCalls).not.toContain(ORG_B);
    expect(ctxB._mock.orgIdCalls).toContain(ORG_B);
    expect(ctxB._mock.orgIdCalls).not.toContain(ORG_A);
  });

  it("getContactsForOrg scopes to correct org", async () => {
    const ctxA = makeCtx(ORG_A) as OrgContext & { _mock: ReturnType<typeof createTrackingClient> };
    const ctxB = makeCtx(ORG_B) as OrgContext & { _mock: ReturnType<typeof createTrackingClient> };

    await getContactsForOrg(ctxA);
    await getContactsForOrg(ctxB);

    expect(ctxA._mock.orgIdCalls).toContain(ORG_A);
    expect(ctxB._mock.orgIdCalls).toContain(ORG_B);
  });

  it("getStrategyDocs scopes to correct org", async () => {
    const ctxA = makeCtx(ORG_A) as OrgContext & { _mock: ReturnType<typeof createTrackingClient> };

    await getStrategyDocs(ctxA);

    expect(ctxA._mock.orgIdCalls).toContain(ORG_A);
    expect(ctxA._mock.orgIdCalls).not.toContain(ORG_B);
  });

  it("getApprovalsForOrg scopes to correct org", async () => {
    const ctxA = makeCtx(ORG_A) as OrgContext & { _mock: ReturnType<typeof createTrackingClient> };

    await getApprovalsForOrg(ctxA);

    expect(ctxA._mock.orgIdCalls).toContain(ORG_A);
  });

  it("getMembershipsForOrg scopes to correct org", async () => {
    const ctxA = makeCtx(ORG_A) as OrgContext & { _mock: ReturnType<typeof createTrackingClient> };

    await getMembershipsForOrg(ctxA);

    expect(ctxA._mock.orgIdCalls).toContain(ORG_A);
  });

  it("different org contexts never leak org_ids", async () => {
    const ctxA = makeCtx(ORG_A) as OrgContext & { _mock: ReturnType<typeof createTrackingClient> };
    const ctxB = makeCtx(ORG_B) as OrgContext & { _mock: ReturnType<typeof createTrackingClient> };

    // Run all queries for both orgs
    await Promise.all([
      getTasksForOrg(ctxA),
      getTasksForOrg(ctxB),
      getContactsForOrg(ctxA),
      getContactsForOrg(ctxB),
    ]);

    // Verify complete isolation
    for (const id of ctxA._mock.orgIdCalls) {
      expect(id).toBe(ORG_A);
    }
    for (const id of ctxB._mock.orgIdCalls) {
      expect(id).toBe(ORG_B);
    }
  });
});
