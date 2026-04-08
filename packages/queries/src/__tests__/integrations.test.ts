import { describe, it, expect, vi } from "vitest";
import {
  getOrgIntegrations,
  getOrgIntegration,
  upsertOrgIntegration,
  deactivateOrgIntegration,
  updateIntegrationLastUsed,
  getIntegrationSecret,
  storeIntegrationSecret,
  deleteIntegrationSecret,
} from "../integrations.js";
import type { OrgContext } from "../context.js";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Mock helpers ──────────────────────────────────────────────

const ORG_ID = "org-test-123";

function mockCtx(overrides: {
  selectData?: unknown;
  selectError?: { message: string } | null;
} = {}): OrgContext {
  const resolved = {
    data: overrides.selectData ?? null,
    error: overrides.selectError ?? null,
  };

  const maybeSingleMock = vi.fn().mockResolvedValue(resolved);
  const orderMock = vi.fn().mockResolvedValue({
    data: overrides.selectData ?? [],
    error: overrides.selectError ?? null,
  });

  // Chain: .select().eq().eq().order() or .select().eq().eq().maybeSingle()
  const secondEq = vi.fn().mockReturnValue({
    order: orderMock,
    maybeSingle: maybeSingleMock,
  });

  const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
  const selectMock = vi.fn().mockReturnValue({ eq: firstEq });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });

  return {
    client: { from: fromMock } as unknown as OrgContext["client"],
    orgId: ORG_ID,
  };
}

function mockAdminClient(overrides: {
  data?: unknown;
  error?: { message: string } | null;
  rpcData?: unknown;
  rpcError?: { message: string } | null;
} = {}): SupabaseClient {
  const singleMock = vi.fn().mockResolvedValue({
    data: overrides.data ?? null,
    error: overrides.error ?? null,
  });

  const selectMock = vi.fn().mockReturnValue({ single: singleMock });

  const eqMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      data: null,
      error: overrides.error ?? null,
    }),
    select: selectMock,
  });

  const upsertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });

  const fromMock = vi.fn().mockReturnValue({
    upsert: upsertMock,
    update: updateMock,
    delete: deleteMock,
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: singleMock,
      }),
    }),
  });

  const rpcMock = vi.fn().mockResolvedValue({
    data: overrides.rpcData ?? null,
    error: overrides.rpcError ?? null,
  });

  return { from: fromMock, rpc: rpcMock } as unknown as SupabaseClient;
}

// ─── getOrgIntegrations ────────────────────────────────────────

describe("getOrgIntegrations", () => {
  it("returns active integrations for org", async () => {
    const integrations = [
      { id: "int-1", org_id: ORG_ID, integration_type: "jasper_api", is_active: true },
    ];
    const ctx = mockCtx({ selectData: integrations });

    const result = await getOrgIntegrations(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].integration_type).toBe("jasper_api");
  });

  it("throws QueryError on Supabase error", async () => {
    const ctx = mockCtx({ selectError: { message: "connection error" } });

    await expect(getOrgIntegrations(ctx)).rejects.toThrow("connection error");
  });
});

// ─── getOrgIntegration ─────────────────────────────────────────

describe("getOrgIntegration", () => {
  it("returns null when integration not found", async () => {
    const ctx = mockCtx({ selectData: null });

    const result = await getOrgIntegration(ctx, "jasper_api");
    expect(result).toBeNull();
  });
});

// ─── upsertOrgIntegration ──────────────────────────────────────

describe("upsertOrgIntegration", () => {
  it("calls upsert with correct onConflict", async () => {
    const integration = {
      id: "int-1",
      org_id: ORG_ID,
      integration_type: "jasper_api",
      is_active: true,
    };
    const admin = mockAdminClient({ data: integration });

    const result = await upsertOrgIntegration(admin, ORG_ID, {
      integration_type: "jasper_api",
      config: { brand_voice_id: "voice-1" },
      vault_secret_id: "vault-uuid-1",
      connected_by: "user-123",
    });

    expect((admin.from as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("dtn_org_integrations");
    expect(result.integration_type).toBe("jasper_api");
  });

  it("throws QueryError on upsert failure", async () => {
    const admin = mockAdminClient({ error: { message: "unique violation" } });

    await expect(
      upsertOrgIntegration(admin, ORG_ID, {
        integration_type: "jasper_api",
        connected_by: "user-123",
      }),
    ).rejects.toThrow("unique violation");
  });
});

// ─── deactivateOrgIntegration ──────────────────────────────────

describe("deactivateOrgIntegration", () => {
  it("updates is_active to false", async () => {
    const admin = mockAdminClient();

    await expect(
      deactivateOrgIntegration(admin, ORG_ID, "jasper_api"),
    ).resolves.toBeUndefined();

    expect((admin.from as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("dtn_org_integrations");
  });
});

// ─── updateIntegrationLastUsed ─────────────────────────────────

describe("updateIntegrationLastUsed", () => {
  it("clears last_error when no error provided", async () => {
    const admin = mockAdminClient();

    await expect(
      updateIntegrationLastUsed(admin, ORG_ID, "jasper_api"),
    ).resolves.toBeUndefined();
  });

  it("sets last_error when error provided", async () => {
    const admin = mockAdminClient();

    await expect(
      updateIntegrationLastUsed(admin, ORG_ID, "jasper_api", "API key expired"),
    ).resolves.toBeUndefined();
  });
});

// ─── Vault helpers ─────────────────────────────────────────────

describe("storeIntegrationSecret", () => {
  it("calls vault.create_secret RPC and returns UUID", async () => {
    const admin = mockAdminClient({ rpcData: "vault-uuid-new" });

    const id = await storeIntegrationSecret(admin, "dtn_integration_org1_jasper", "sk-secret");
    expect(id).toBe("vault-uuid-new");
    expect((admin.rpc as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("vault.create_secret", {
      new_secret: "sk-secret",
      new_name: "dtn_integration_org1_jasper",
    });
  });

  it("throws on Vault error", async () => {
    const admin = mockAdminClient({ rpcError: { message: "vault unavailable" } });

    await expect(
      storeIntegrationSecret(admin, "name", "val"),
    ).rejects.toThrow("vault unavailable");
  });
});

describe("getIntegrationSecret", () => {
  it("throws when secret not found", async () => {
    const admin = mockAdminClient({ data: null });

    await expect(
      getIntegrationSecret(admin, "bad-uuid"),
    ).rejects.toThrow("Secret not found");
  });
});

describe("deleteIntegrationSecret", () => {
  it("deletes from vault.secrets", async () => {
    const admin = mockAdminClient();

    await expect(
      deleteIntegrationSecret(admin, "vault-uuid-1"),
    ).resolves.toBeUndefined();
  });
});
