import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createSyncLog,
  updateSyncLog,
  getFieldMappings,
  upsertContactByEmail,
} from "@dothesenow/queries";
import { HubSpotClient } from "@/lib/hubspot/client";
import { mapHubSpotToContact, getMappedHubSpotProperties } from "@/lib/hubspot/field-mapper";

/**
 * Full initial sync on first HubSpot connect.
 * Paginates through all HubSpot contacts, maps fields, and upserts by email.
 * Shares org-level concurrency with all HubSpot sync functions.
 */
export const hubspotInitialSync = inngest.createFunction(
  {
    id: "hubspot-initial-sync",
    triggers: [{ event: "hubspot/initial-sync.requested" }],
    concurrency: [{ limit: 1, key: "event.data.org_id", scope: "env" }],
    rateLimit: { limit: 1, period: "1h", key: "event.data.org_id" },
    retries: 1,
  },
  async ({ event, step }) => {
    const { org_id } = event.data;
    const supabase = createAdminClient();

    // Step 1: Create sync log
    const syncLog = await step.run("create-sync-log", async () => {
      return createSyncLog(supabase, org_id, {
        integration_type: "hubspot",
        sync_type: "initial",
        direction: "inbound",
      });
    });

    // Step 2: Load field mappings
    const mappings = await step.run("load-mappings", async () => {
      const ctx = { client: supabase, orgId: org_id };
      return getFieldMappings(ctx);
    });

    const properties = getMappedHubSpotProperties(mappings);
    const client = new HubSpotClient(supabase, org_id);

    // Step 3: Paginate HubSpot contacts
    let after: string | undefined;
    let pageNum = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const pageResult = await step.run(`fetch-page-${pageNum}`, async () => {
        const page = await client.getContacts({
          after,
          limit: 100,
          properties,
        });

        let created = 0;
        let updated = 0;
        let failed = 0;

        for (const hsContact of page.results) {
          try {
            const contactInput = mapHubSpotToContact(hsContact, mappings);

            // Upsert by email
            const contact = await upsertContactByEmail(supabase, org_id, contactInput);

            // Update sync metadata
            await supabase
              .from("mktg_contacts")
              .update({
                external_ids: { hubspot_id: hsContact.id },
                external_updated_at: hsContact.updatedAt,
                sync_status: "synced",
              })
              .eq("id", contact.id);

            // Check if this was an insert or update based on created_at proximity
            const contactAge = Date.now() - new Date(contact.created_at).getTime();
            if (contactAge < 5000) created++;
            else updated++;
          } catch (err) {
            console.error(`[hubspot:initial-sync] Failed to sync contact ${hsContact.id}:`, err);
            failed++;
          }
        }

        return {
          created,
          updated,
          failed,
          nextAfter: page.paging?.next?.after ?? null,
          count: page.results.length,
        };
      });

      totalCreated += pageResult.created;
      totalUpdated += pageResult.updated;
      totalFailed += pageResult.failed;

      if (!pageResult.nextAfter || pageResult.count === 0) break;
      after = pageResult.nextAfter;
      pageNum++;

      // Safety cap: 100 pages = 10,000 contacts max for initial sync
      if (pageNum >= 100) break;
    }

    // Step 4: Finalize sync log
    await step.run("finalize", async () => {
      await updateSyncLog(supabase, syncLog.id, {
        status: totalFailed > 0 ? "completed" : "completed",
        records_processed: totalCreated + totalUpdated + totalFailed,
        records_created: totalCreated,
        records_updated: totalUpdated,
        records_failed: totalFailed,
        completed_at: new Date().toISOString(),
      });
    });

    return {
      status: "completed",
      created: totalCreated,
      updated: totalUpdated,
      failed: totalFailed,
      pages: pageNum + 1,
    };
  },
);
