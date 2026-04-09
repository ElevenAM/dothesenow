import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgContext } from "./context.js";
import type {
  HubSpotFieldMapping,
  UpsertFieldMappingInput,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const TABLE = "dtn_hubspot_field_mappings";

// ─── Default mappings ──────────────────────────────────────

const DEFAULT_MAPPINGS: Omit<UpsertFieldMappingInput, "transform_config">[] = [
  { hubspot_property: "firstname", dtn_field: "first_name", direction: "bidirectional" },
  { hubspot_property: "lastname", dtn_field: "last_name", direction: "bidirectional" },
  { hubspot_property: "email", dtn_field: "email", direction: "bidirectional" },
  { hubspot_property: "phone", dtn_field: "phone", direction: "bidirectional" },
  { hubspot_property: "company", dtn_field: "company", direction: "bidirectional" },
  { hubspot_property: "jobtitle", dtn_field: "title", direction: "bidirectional" },
  { hubspot_property: "lifecyclestage", dtn_field: "lifecycle_stage", direction: "bidirectional" },
  { hubspot_property: "city", dtn_field: "location", direction: "hubspot_to_dtn" },
  { hubspot_property: "notes_last_updated", dtn_field: "notes", direction: "hubspot_to_dtn" },
];

/**
 * Returns the static default field mappings (no DB call).
 */
export function getDefaultMappings(): UpsertFieldMappingInput[] {
  return DEFAULT_MAPPINGS.map((m) => ({ ...m, transform_config: {} }));
}

// ─── Read queries ───────────────────────────────────────────

export async function getFieldMappings(
  ctx: OrgContext,
): Promise<HubSpotFieldMapping[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("hubspot_property", { ascending: true });

  if (error) {
    throw new QueryError(error.message, TABLE, "getFieldMappings", ctx.orgId, error);
  }

  return (data ?? []) as HubSpotFieldMapping[];
}

// ─── Write queries (admin client) ───────────────────────────

export async function upsertFieldMapping(
  adminClient: SupabaseClient,
  orgId: string,
  mapping: UpsertFieldMappingInput,
): Promise<HubSpotFieldMapping> {
  const { data, error } = await adminClient
    .from(TABLE)
    .upsert(
      {
        org_id: orgId,
        hubspot_property: mapping.hubspot_property,
        dtn_field: mapping.dtn_field,
        direction: mapping.direction ?? "bidirectional",
        transform_config: mapping.transform_config ?? {},
      },
      { onConflict: "org_id,hubspot_property" },
    )
    .select("*")
    .single();

  if (error) {
    throw new QueryError(error.message, TABLE, "upsertFieldMapping", orgId, error);
  }

  return data as HubSpotFieldMapping;
}

/**
 * Seed default field mappings for an org on first HubSpot connect.
 * Skips any that already exist via ON CONFLICT.
 */
export async function seedDefaultMappings(
  adminClient: SupabaseClient,
  orgId: string,
): Promise<void> {
  const rows = DEFAULT_MAPPINGS.map((m) => ({
    org_id: orgId,
    hubspot_property: m.hubspot_property,
    dtn_field: m.dtn_field,
    direction: m.direction ?? "bidirectional",
    transform_config: {},
  }));

  const { error } = await adminClient
    .from(TABLE)
    .upsert(rows, { onConflict: "org_id,hubspot_property" });

  if (error) {
    throw new QueryError(error.message, TABLE, "seedDefaultMappings", orgId, error);
  }
}
