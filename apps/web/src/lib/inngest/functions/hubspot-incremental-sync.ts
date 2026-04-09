import { inngest } from "../client";
import { filterOrgsByLocalHour } from "../utils";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActiveOrgs,
  getOrgIntegration,
  createSyncLog,
  updateSyncLog,
  getFieldMappings,
  upsertContactByEmail,
  getLatestSyncLog,
} from "@dothesenow/queries";
import { HubSpotClient } from "@/lib/hubspot/client";
import { mapHubSpotToContact, getMappedHubSpotProperties } from "@/lib/hubspot/field-mapper";

/**
 * Cron: every 15 minutes, fan out incremental syncs for orgs with active HubSpot.
 */
export const hubspotIncrementalSyncCron = inngest.createFunction(
  {
    id: "hubspot-incremental-sync-cron",
    triggers: [{ cron: "*/15 * * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    const supabase = createAdminClient();

    const orgs = await step.run("find-hubspot-orgs", async () => {
      const { data } = await supabase
        .from("dtn_org_integrations")
        .select("org_id")
        .eq("integration_type", "hubspot")
        .eq("is_active", true);

      return (data ?? []).map((row) => row.org_id as string);
    });

    if (orgs.length === 0) return { sent: 0 };

    await step.sendEvent(
      "fan-out-incremental",
      orgs.map((orgId) => ({
        name: "hubspot/incremental-sync" as const,
        data: { org_id: orgId },
      })),
    );

    return { sent: orgs.length };
  },
);

/**
 * Incremental sync handler — queries HubSpot for recently modified contacts
 * and merges with local contacts using last-write-wins.
 * Shares org-level concurrency with all HubSpot sync functions.
 */
export const hubspotIncrementalSyncHandler = inngest.createFunction(
  {
    id: "hubspot-incremental-sync-handler",
    triggers: [{ event: "hubspot/incremental-sync" }],
    concurrency: [{ limit: 1, key: "event.data.org_id", scope: "env" }],
    retries: 1,
  },
  async ({ event, step }) => {
    const { org_id } = event.data;
    const supabase = createAdminClient();

    // Step 1: Determine "since" timestamp from last successful sync
    const since = await step.run("get-last-sync-time", async () => {
      const ctx = { client: supabase, orgId: org_id };
      const lastSync = await getLatestSyncLog(ctx, "hubspot");

      if (lastSync?.completed_at) {
        return lastSync.completed_at;
      }
      // Default: 24 hours ago if no prior sync
      return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    });

    // Step 2: Create sync log
    const syncLog = await step.run("create-sync-log", async () => {
      return createSyncLog(supabase, org_id, {
        integration_type: "hubspot",
        sync_type: "incremental",
        direction: "inbound",
      });
    });

    // Step 3: Fetch and merge
    const result = await step.run("fetch-and-merge", async () => {
      const ctx = { client: supabase, orgId: org_id };
      const mappings = await getFieldMappings(ctx);
      const properties = getMappedHubSpotProperties(mappings);
      const client = new HubSpotClient(supabase, org_id);

      let created = 0;
      let updated = 0;
      let failed = 0;
      let after: string | undefined;

      // Paginate through modified contacts
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const page = await client.getRecentlyModified(new Date(since), { after });

        for (const hsContact of page.results) {
          try {
            const hsUpdatedAt = new Date(hsContact.updatedAt);

            // Check if local contact exists with this HubSpot ID
            const { data: localContact } = await supabase
              .from("mktg_contacts")
              .select("id, external_updated_at, sync_status")
              .eq("org_id", org_id)
              .filter("external_ids->>hubspot_id", "eq", hsContact.id)
              .is("deleted_at", null)
              .maybeSingle();

            if (localContact) {
              // Last-write-wins: only update if HubSpot version is newer
              const localUpdatedAt = localContact.external_updated_at
                ? new Date(localContact.external_updated_at)
                : new Date(0);

              if (hsUpdatedAt <= localUpdatedAt && localContact.sync_status === "pending_push") {
                // Local change is newer — skip this HubSpot update
                continue;
              }

              const contactInput = mapHubSpotToContact(hsContact, mappings);
              await supabase
                .from("mktg_contacts")
                .update({
                  ...contactInput,
                  external_updated_at: hsContact.updatedAt,
                  sync_status: "synced",
                })
                .eq("id", localContact.id);

              updated++;
            } else {
              // New contact from HubSpot
              const contactInput = mapHubSpotToContact(hsContact, mappings);
              const contact = await upsertContactByEmail(supabase, org_id, contactInput);

              await supabase
                .from("mktg_contacts")
                .update({
                  external_ids: { hubspot_id: hsContact.id },
                  external_updated_at: hsContact.updatedAt,
                  sync_status: "synced",
                })
                .eq("id", contact.id);

              created++;
            }
          } catch (err) {
            console.error(`[hubspot:incremental] Failed to sync ${hsContact.id}:`, err);
            failed++;
          }
        }

        if (!page.paging?.next?.after || page.results.length === 0) break;
        after = page.paging.next.after;
      }

      return { created, updated, failed };
    });

    // Step 4: Finalize
    await step.run("finalize", async () => {
      await updateSyncLog(supabase, syncLog.id, {
        status: "completed",
        records_processed: result.created + result.updated + result.failed,
        records_created: result.created,
        records_updated: result.updated,
        records_failed: result.failed,
        completed_at: new Date().toISOString(),
      });
    });

    return result;
  },
);
