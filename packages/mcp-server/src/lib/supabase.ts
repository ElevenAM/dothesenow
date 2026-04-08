import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgContext } from "@dothesenow/queries";

// ─── Pure types & helpers — no side effects, safe to import anywhere ────

export class OrgScopedClient {
  readonly supabase: SupabaseClient;
  readonly orgId: string;

  constructor(supabase: SupabaseClient, orgId: string) {
    this.supabase = supabase;
    this.orgId = orgId;
  }

  from(table: string) {
    return this.supabase.from(table);
  }

  rpc(fn: string, params: Record<string, unknown>) {
    return this.supabase.rpc(fn, params);
  }
}

export function toOrgContext(client: OrgScopedClient): OrgContext {
  return { client: client.supabase, orgId: client.orgId };
}

/**
 * Create an org-scoped client from an existing Supabase admin client.
 * The caller is responsible for constructing the admin client.
 */
export function createOrgClient(
  supabase: SupabaseClient,
  orgId: string,
): OrgScopedClient {
  return new OrgScopedClient(supabase, orgId);
}
