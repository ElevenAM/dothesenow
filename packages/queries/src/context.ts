import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Passed to every query function.
 * Note: MCP's OrgScopedClient uses `supabase` (not `client`) — callers must
 * adapt: `{ client: orgScopedClient.supabase, orgId: orgScopedClient.orgId }`.
 */
export interface OrgContext {
  readonly client: SupabaseClient;
  readonly orgId: string;
}
