import { describe, it, expect, vi, beforeEach } from "vitest";
import { jasper } from "../builtin/jasper";
import type { OrgIntegration, DispatchableTask, ExecutorRuntimeConfig } from "@dothesenow/types";

// Mock createAdminClient (used by jasper.dispatch for approval queue)
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }),
  }),
}));

// Mock global fetch
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

const dummyTask: DispatchableTask = {
  id: "task-1",
  org_id: "org-1",
  title: "Write a blog post about AI marketing",
  description: "Focus on practical tips for small businesses",
  task_type: "create",
  priority: "medium",
  executor_type: "jasper_api",
  executor_config: null,
  department_id: "dept-1",
  scheduled_date: "2026-04-07",
  source_strategy: null,
  campaign_id: null,
  contact_id: null,
};

const activeJasperIntegration: OrgIntegration = {
  id: "int-1",
  org_id: "org-1",
  integration_type: "jasper_api",
  config: { brand_voice_id: "voice-123" },
  vault_secret_id: "vault-1",
  is_active: true,
  connected_at: "2026-01-01",
  connected_by: "user-1",
  last_used_at: null,
  last_error: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

// ─── checkAvailability ─────────────────────────────────────────

describe("jasper.checkAvailability", () => {
  it("returns unavailable when no integration exists", () => {
    const result = jasper.checkAvailability([]);
    expect(result.available).toBe(false);
    expect(result.hint).toContain("Settings");
  });

  it("returns unavailable when integration is inactive", () => {
    const inactive = { ...activeJasperIntegration, is_active: false };
    const result = jasper.checkAvailability([inactive]);
    expect(result.available).toBe(false);
  });

  it("returns available when active integration exists", () => {
    const result = jasper.checkAvailability([activeJasperIntegration]);
    expect(result.available).toBe(true);
  });

  it("ignores other integration types", () => {
    const other = { ...activeJasperIntegration, integration_type: "n8n" };
    const result = jasper.checkAvailability([other]);
    expect(result.available).toBe(false);
  });
});

// ─── estimateCredits ───────────────────────────────────────────

describe("jasper.estimateCredits", () => {
  it("returns 0 for any task (BYOS)", () => {
    expect(jasper.estimateCredits(dummyTask)).toBe(0);
  });
});

// ─── testConnection ────────────────────────────────────────────

describe("jasper.testConnection", () => {
  it("succeeds on 200 response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(
      jasper.testConnection!("sk-test-key", {}),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/templates"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-key",
        }),
      }),
    );
  });

  it("throws on 401 response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("Invalid API key"),
    });

    await expect(
      jasper.testConnection!("bad-key", {}),
    ).rejects.toThrow("401");
  });
});

// ─── dispatch ──────────────────────────────────────────────────

describe("jasper.dispatch", () => {
  it("sends correct payload to Jasper API", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { text: "Generated content" } }),
    });

    const config: ExecutorRuntimeConfig = {
      integration: activeJasperIntegration,
      secret: "sk-jasper-key",
      callbackUrl: "https://example.com/api/webhooks/n8n",
    };

    await jasper.dispatch(dummyTask, config);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/text/generate"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-jasper-key",
        }),
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.inputs.command).toBe(dummyTask.title);
    expect(body.options.template).toBe("blog-post");
    expect(body.options.brandVoiceId).toBe("voice-123");
  });

  it("throws when API key is missing", async () => {
    const config: ExecutorRuntimeConfig = {
      integration: null,
      secret: null,
      callbackUrl: "",
    };

    await expect(jasper.dispatch(dummyTask, config)).rejects.toThrow(
      "API key not found",
    );
  });

  it("throws on Jasper API error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: () => Promise.resolve("Service unavailable"),
    });

    const config: ExecutorRuntimeConfig = {
      integration: activeJasperIntegration,
      secret: "sk-key",
      callbackUrl: "",
    };

    await expect(jasper.dispatch(dummyTask, config)).rejects.toThrow("500");
  });

  it("maps outreach task_type to email template", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { text: "Email content" } }),
    });

    const outreachTask = { ...dummyTask, task_type: "outreach" as const };
    const config: ExecutorRuntimeConfig = {
      integration: activeJasperIntegration,
      secret: "sk-key",
      callbackUrl: "",
    };

    await jasper.dispatch(outreachTask, config);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.options.template).toBe("email");
  });
});
