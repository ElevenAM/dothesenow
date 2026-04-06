import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrgContext } from "../context.js";
import { QueryError } from "../errors.js";
import { getTasksForOrg, getTaskById, createTaskForOrg, updateTaskForOrg } from "../tasks.js";

// Mock Supabase client builder
function createMockClient() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnThis();
  chain.insert = vi.fn().mockReturnThis();
  chain.update = vi.fn().mockReturnThis();
  chain.eq = vi.fn().mockReturnThis();
  chain.in = vi.fn().mockReturnThis();
  chain.lt = vi.fn().mockReturnThis();
  chain.gte = vi.fn().mockReturnThis();
  chain.lte = vi.fn().mockReturnThis();
  chain.order = vi.fn().mockReturnThis();
  chain.range = vi.fn().mockReturnThis();
  chain.limit = vi.fn().mockReturnThis();
  chain.single = vi.fn().mockResolvedValue({ data: { id: "task-1", org_id: "org-1" }, error: null });
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

  // Default: list returns empty array
  // The chain's last call (order/range/etc.) needs to resolve
  const resolveData = (data: unknown, error: unknown = null) => {
    // Override the "then" behavior by making the chain thenable
    const proxy = new Proxy(chain, {
      get(target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) => resolve({ data, error, count: Array.isArray(data) ? data.length : 0 });
        }
        return target[prop as string];
      },
    });
    return proxy;
  };

  const from = vi.fn().mockReturnValue(chain);

  return {
    from,
    chain,
    resolveData,
    // Helper to make the chain resolve with specific data
    setResult(data: unknown, error: unknown = null) {
      // Make every terminal call resolve with this data
      chain.order.mockImplementation(() => resolveData(data, error));
      chain.range.mockImplementation(() => resolveData(data, error));
      chain.limit.mockImplementation(() => resolveData(data, error));
      chain.single.mockResolvedValue({ data, error });
      chain.maybeSingle.mockResolvedValue({ data, error });
      // For cases where the chain ends at eq
      chain.eq.mockImplementation(() => {
        const result = resolveData(data, error);
        result.single = chain.single;
        result.maybeSingle = chain.maybeSingle;
        result.order = chain.order;
        result.in = chain.in;
        result.lt = chain.lt;
        result.gte = chain.gte;
        result.lte = chain.lte;
        result.range = chain.range;
        return result;
      });
    },
  };
}

describe("getTasksForOrg", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let ctx: OrgContext;

  beforeEach(() => {
    mockClient = createMockClient();
    ctx = { client: mockClient as unknown as OrgContext["client"], orgId: "org-123" };
  });

  it("calls from with correct table name", async () => {
    mockClient.setResult([]);
    await getTasksForOrg(ctx);
    expect(mockClient.from).toHaveBeenCalledWith("dtn_daily_tasks");
  });

  it("always filters by org_id", async () => {
    mockClient.setResult([]);
    await getTasksForOrg(ctx);
    expect(mockClient.chain.eq).toHaveBeenCalledWith("org_id", "org-123");
  });

  it("returns empty array when no results", async () => {
    mockClient.setResult([]);
    const result = await getTasksForOrg(ctx);
    expect(result).toEqual([]);
  });

  it("applies status filter when provided", async () => {
    mockClient.setResult([]);
    await getTasksForOrg(ctx, { status: "pending" });
    expect(mockClient.chain.eq).toHaveBeenCalledWith("status", "pending");
  });

  it("applies priority filter when provided", async () => {
    mockClient.setResult([]);
    await getTasksForOrg(ctx, { priority: "high" });
    expect(mockClient.chain.eq).toHaveBeenCalledWith("priority", "high");
  });

  it("throws QueryError on supabase error", async () => {
    mockClient.setResult(null, { message: "DB connection failed" });
    await expect(getTasksForOrg(ctx)).rejects.toThrow(QueryError);
  });
});

describe("getTaskById", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let ctx: OrgContext;

  beforeEach(() => {
    mockClient = createMockClient();
    ctx = { client: mockClient as unknown as OrgContext["client"], orgId: "org-123" };
  });

  it("returns null when task not found", async () => {
    mockClient.setResult(null);
    const result = await getTaskById(ctx, "nonexistent");
    expect(result).toBeNull();
  });

  it("returns task when found", async () => {
    const task = { id: "task-1", org_id: "org-123", title: "Test" };
    mockClient.setResult(task);
    const result = await getTaskById(ctx, "task-1");
    expect(result).toEqual(task);
  });

  it("filters by both id and org_id", async () => {
    mockClient.setResult(null);
    await getTaskById(ctx, "task-1");
    expect(mockClient.chain.eq).toHaveBeenCalledWith("org_id", "org-123");
    expect(mockClient.chain.eq).toHaveBeenCalledWith("id", "task-1");
  });
});

describe("createTaskForOrg", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let ctx: OrgContext;

  beforeEach(() => {
    mockClient = createMockClient();
    ctx = { client: mockClient as unknown as OrgContext["client"], orgId: "org-123" };
  });

  it("inserts with org_id set from context", async () => {
    const task = { id: "new-1", org_id: "org-123", title: "New task" };
    mockClient.setResult(task);
    await createTaskForOrg(ctx, { title: "New task" });
    expect(mockClient.chain.insert).toHaveBeenCalled();
    const insertArg = mockClient.chain.insert.mock.calls[0][0];
    expect(insertArg.org_id).toBe("org-123");
  });

  it("throws QueryError on insert failure", async () => {
    mockClient.setResult(null, { message: "Duplicate key" });
    await expect(createTaskForOrg(ctx, { title: "Dup" })).rejects.toThrow(QueryError);
  });
});

describe("updateTaskForOrg", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let ctx: OrgContext;

  beforeEach(() => {
    mockClient = createMockClient();
    ctx = { client: mockClient as unknown as OrgContext["client"], orgId: "org-123" };
  });

  it("updates with org_id filter", async () => {
    const task = { id: "task-1", org_id: "org-123", title: "Updated", status: "completed" };
    mockClient.setResult(task);
    await updateTaskForOrg(ctx, "task-1", { status: "completed" });
    expect(mockClient.chain.update).toHaveBeenCalledWith({ status: "completed" });
    expect(mockClient.chain.eq).toHaveBeenCalledWith("org_id", "org-123");
    expect(mockClient.chain.eq).toHaveBeenCalledWith("id", "task-1");
  });
});
