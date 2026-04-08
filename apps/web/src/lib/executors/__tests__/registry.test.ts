import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getExecutor,
  getAllExecutorMetadata,
  getAvailableExecutors,
  getExecutorsWithCapability,
  getExecutorAvailability,
} from "../registry";
import type { OrgIntegration } from "@dothesenow/types";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.N8N_WEBHOOK_SECRET = "test-secret";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ─── getExecutor ──────────────────────────────────────────────

describe("getExecutor", () => {
  it("returns Claude definition", () => {
    const executor = getExecutor("claude_api");
    expect(executor).toBeDefined();
    expect(executor!.type).toBe("claude_api");
    expect(executor!.category).toBe("builtin");
  });

  it("returns n8n definition", () => {
    const executor = getExecutor("n8n");
    expect(executor).toBeDefined();
    expect(executor!.type).toBe("n8n");
    expect(executor!.category).toBe("webhook");
  });

  it("returns Jasper definition", () => {
    const executor = getExecutor("jasper_api");
    expect(executor).toBeDefined();
    expect(executor!.type).toBe("jasper_api");
    expect(executor!.category).toBe("byos");
  });

  it("returns undefined for self (no-op executor)", () => {
    expect(getExecutor("self")).toBeUndefined();
  });

  it("returns undefined for freelancer (no-op executor)", () => {
    expect(getExecutor("freelancer")).toBeUndefined();
  });

  it("returns undefined for nonexistent type", () => {
    expect(getExecutor("nonexistent")).toBeUndefined();
  });
});

// ─── getAllExecutorMetadata ─────────────────────────────────────

describe("getAllExecutorMetadata", () => {
  it("returns all 5 executors", () => {
    const all = getAllExecutorMetadata();
    expect(all).toHaveLength(5);
    const types = all.map((e) => e.type);
    expect(types).toContain("self");
    expect(types).toContain("claude_api");
    expect(types).toContain("n8n");
    expect(types).toContain("freelancer");
    expect(types).toContain("jasper_api");
  });

  it("returns serializable objects (no functions)", () => {
    const all = getAllExecutorMetadata();
    for (const meta of all) {
      for (const value of Object.values(meta)) {
        expect(typeof value).not.toBe("function");
      }
    }
  });
});

// ─── getExecutorsWithCapability ────────────────────────────────

describe("getExecutorsWithCapability", () => {
  it("content_generation returns Claude and Jasper", () => {
    const result = getExecutorsWithCapability("content_generation");
    const types = result.map((e) => e.type);
    expect(types).toContain("claude_api");
    expect(types).toContain("jasper_api");
    expect(types).not.toContain("self");
  });

  it("automation returns n8n", () => {
    const result = getExecutorsWithCapability("automation");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("n8n");
  });

  it("research returns Claude", () => {
    const result = getExecutorsWithCapability("research");
    const types = result.map((e) => e.type);
    expect(types).toContain("claude_api");
    expect(types).not.toContain("jasper_api");
  });
});

// ─── getAvailableExecutors ─────────────────────────────────────

describe("getAvailableExecutors", () => {
  it("includes self and freelancer always", () => {
    const result = getAvailableExecutors([]);
    const types = result.map((e) => e.type);
    expect(types).toContain("self");
    expect(types).toContain("freelancer");
  });

  it("excludes Jasper when no integration exists", () => {
    const result = getAvailableExecutors([]);
    const types = result.map((e) => e.type);
    expect(types).not.toContain("jasper_api");
  });

  it("includes Jasper when active integration exists", () => {
    const jasperIntegration: OrgIntegration = {
      id: "int-1",
      org_id: "org-1",
      integration_type: "jasper_api",
      config: {},
      vault_secret_id: "vault-1",
      is_active: true,
      connected_at: "2026-01-01",
      connected_by: "user-1",
      last_used_at: null,
      last_error: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    const result = getAvailableExecutors([jasperIntegration]);
    const types = result.map((e) => e.type);
    expect(types).toContain("jasper_api");
  });

  it("excludes Claude when ANTHROPIC_API_KEY is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = getAvailableExecutors([]);
    const types = result.map((e) => e.type);
    expect(types).not.toContain("claude_api");
  });
});

// ─── getExecutorAvailability ───────────────────────────────────

describe("getExecutorAvailability", () => {
  it("returns availability for all executor types", () => {
    const result = getExecutorAvailability([]);
    expect(Object.keys(result)).toHaveLength(5);
    expect(result.self.available).toBe(true);
    expect(result.freelancer.available).toBe(true);
    expect(result.claude_api.available).toBe(true);
    expect(result.jasper_api.available).toBe(false);
    expect(result.jasper_api.hint).toContain("Settings");
  });

  it("n8n unavailable when N8N_WEBHOOK_SECRET is missing", () => {
    delete process.env.N8N_WEBHOOK_SECRET;
    const result = getExecutorAvailability([]);
    expect(result.n8n.available).toBe(false);
    expect(result.n8n.hint).toContain("n8n.io");
  });
});

// ─── estimateCredits ───────────────────────────────────────────

describe("estimateCredits", () => {
  const dummyTask = {
    id: "t-1",
    org_id: "org-1",
    title: "Test",
    description: null,
    task_type: "create" as const,
    priority: "medium" as const,
    executor_type: "claude_api" as const,
    executor_config: null,
    department_id: null,
    scheduled_date: "2026-04-07",
    source_strategy: null,
    campaign_id: null,
    contact_id: null,
  };

  it("returns 0 for BYOS executors (Jasper)", () => {
    const executor = getExecutor("jasper_api")!;
    expect(executor.estimateCredits(dummyTask)).toBe(0);
  });

  it("returns > 0 for builtin executors (Claude)", () => {
    const executor = getExecutor("claude_api")!;
    expect(executor.estimateCredits(dummyTask)).toBeGreaterThan(0);
  });

  it("returns > 0 for webhook executors (n8n)", () => {
    const executor = getExecutor("n8n")!;
    expect(executor.estimateCredits(dummyTask)).toBeGreaterThan(0);
  });
});
