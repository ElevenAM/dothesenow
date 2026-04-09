import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getFieldMappings,
  createSyncLog,
  updateSyncLog,
} from "@dothesenow/queries";
import { HubSpotClient } from "@/lib/hubspot/client";
import { mapContactToHubSpot } from "@/lib/hubspot/field-mapper";
import type { Contact } from "@dothesenow/types";

/**
 * Push a single contact change to HubSpot.
 * Create or update based on external_ids.hubspot_id presence.
 * Shares org-level concurrency with all HubSpot sync functions.
 */
export const hubspotOutboundSync = inngest.createFunction(
  {
    id: "hubspot-outbound-sync",
    triggers: [{ event: "hubspot/outbound-sync.contact" }],
    concurrency: [{ limit: 1, key: "event.data.org_id", scope: "env" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { org_id, contact_id } = event.data;
    const supabase = createAdminClient();

    const result = await step.run("push-to-hubspot", async () => {
      // Load contact
      const { data: contact, error } = await supabase
        .from("mktg_contacts")
        .select("*")
        .eq("id", contact_id)
        .eq("org_id", org_id)
        .is("deleted_at", null)
        .single();

      if (error || !contact) {
        return { status: "skipped", reason: "contact_not_found" };
      }

      const typedContact = contact as Contact;

      // Only sync if status is pending_push
      if (typedContact.sync_status !== "pending_push") {
        return { status: "skipped", reason: "not_pending_push" };
      }

      const ctx = { client: supabase, orgId: org_id };
      const mappings = await getFieldMappings(ctx);
      const hsProperties = mapContactToHubSpot(typedContact, mappings);

      const client = new HubSpotClient(supabase, org_id);
      const hubspotId = typedContact.external_ids?.hubspot_id;

      if (hubspotId) {
        // Update existing HubSpot contact
        const updated = await client.updateContact(hubspotId, hsProperties);

        await supabase
          .from("mktg_contacts")
          .update({
            external_updated_at: updated.updatedAt,
            sync_status: "synced",
          })
          .eq("id", contact_id);

        return { status: "updated", hubspot_id: hubspotId };
      } else {
        // Create new HubSpot contact
        const created = await client.createContact(hsProperties);

        await supabase
          .from("mktg_contacts")
          .update({
            external_ids: { ...typedContact.external_ids, hubspot_id: created.id },
            external_updated_at: created.updatedAt,
            sync_status: "synced",
          })
          .eq("id", contact_id);

        return { status: "created", hubspot_id: created.id };
      }
    });

    return result;
  },
);
