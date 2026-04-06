import type { SupabaseClient } from "@supabase/supabase-js";

/** Passed to every query function. Matches MCP's OrgScopedClient shape. */
export interface OrgContext {
  readonly client: SupabaseClient;
  readonly orgId: string;
}
