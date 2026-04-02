import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseAdmin: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

export function createOrgClient(orgId?: string): OrgScopedClient {
  const resolved = orgId || process.env.ORG_ID;
  if (!resolved) {
    throw new Error(
      "org_id is required: pass it as a tool parameter or set ORG_ID in .env",
    );
  }
  return new OrgScopedClient(supabaseAdmin, resolved);
}
