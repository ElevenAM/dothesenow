import type { Contact, CreateContactInput, HubSpotFieldMapping } from "@dothesenow/types";
import type { HubSpotContact } from "./client";

// ─── Lifecycle stage transforms ────────────────────────────

/** HubSpot uses different lifecycle stage names than DTN */
const HUBSPOT_TO_DTN_LIFECYCLE: Record<string, string> = {
  subscriber: "awareness",
  lead: "awareness",
  marketingqualifiedlead: "consideration",
  salesqualifiedlead: "consideration",
  opportunity: "decision",
  customer: "customer",
  evangelist: "advocate",
  other: "awareness",
};

const DTN_TO_HUBSPOT_LIFECYCLE: Record<string, string> = {
  awareness: "lead",
  consideration: "marketingqualifiedlead",
  decision: "opportunity",
  customer: "customer",
  advocate: "evangelist",
};

// ─── Field mapping functions ───────────────────────────────

/**
 * Map a HubSpot contact's properties to a DTN CreateContactInput.
 * Uses the org's field mappings to determine which fields to map.
 */
export function mapHubSpotToContact(
  hsContact: HubSpotContact,
  mappings: HubSpotFieldMapping[],
): CreateContactInput {
  const result: Record<string, unknown> = {};

  for (const mapping of mappings) {
    // Skip dtn_to_hubspot-only mappings
    if (mapping.direction === "dtn_to_hubspot") continue;

    const hsValue = hsContact.properties[mapping.hubspot_property];
    if (hsValue == null || hsValue === "") continue;

    // Apply lifecycle stage transform
    if (mapping.dtn_field === "lifecycle_stage") {
      result[mapping.dtn_field] =
        HUBSPOT_TO_DTN_LIFECYCLE[hsValue.toLowerCase()] ?? "awareness";
    } else {
      result[mapping.dtn_field] = hsValue;
    }
  }

  return result as unknown as CreateContactInput;
}

/**
 * Map a DTN Contact to HubSpot properties for create/update.
 * Uses the org's field mappings to determine which fields to push.
 */
export function mapContactToHubSpot(
  contact: Contact,
  mappings: HubSpotFieldMapping[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const mapping of mappings) {
    // Skip hubspot_to_dtn-only mappings
    if (mapping.direction === "hubspot_to_dtn") continue;

    const dtnValue = (contact as unknown as Record<string, unknown>)[mapping.dtn_field];
    if (dtnValue == null || dtnValue === "") continue;

    // Apply lifecycle stage transform
    if (mapping.dtn_field === "lifecycle_stage") {
      result[mapping.hubspot_property] =
        DTN_TO_HUBSPOT_LIFECYCLE[String(dtnValue)] ?? "other";
    } else {
      result[mapping.hubspot_property] = String(dtnValue);
    }
  }

  return result;
}

/**
 * Get the list of HubSpot properties that should be fetched based on mappings.
 */
export function getMappedHubSpotProperties(
  mappings: HubSpotFieldMapping[],
): string[] {
  return mappings
    .filter((m) => m.direction !== "dtn_to_hubspot")
    .map((m) => m.hubspot_property);
}
