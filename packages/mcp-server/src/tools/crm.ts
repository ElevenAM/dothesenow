import type { ToolModule } from "./types.js";
import { ok } from "./types.js";
import { toOrgContext } from "../lib/supabase.js";
import {
  getContactsForOrg,
  createContact,
  updateContact,
  logOutreach,
  getOutreachHistory,
  getPipelineSummary,
} from "@dothesenow/queries";

const ORG_ID_PROP = {
  org_id: {
    type: "string",
    description: "Organization UUID (falls back to ORG_ID env)",
  },
};

export const crm: ToolModule = {
  definitions: [
    {
      name: "search_contacts",
      description:
        "Search your marketing CRM contacts. Filter by type (lead, prospect, customer, partner, therapist, influencer, media), status, tags, location, persona, or free text. Returns matching contacts with their outreach history summary.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          query: {
            type: "string",
            description: "Free text search across name, email, company, notes",
          },
          contact_type: {
            type: "string",
            description:
              "Filter by type: lead, prospect, customer, partner, therapist, influencer, media, other",
          },
          status: {
            type: "string",
            description:
              "Filter by status: active, inactive, do_not_contact, churned",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags (matches any)",
          },
          lifecycle_stage: {
            type: "string",
            description:
              "Filter by stage: awareness, consideration, decision, customer, advocate",
          },
          source: {
            type: "string",
            description:
              "Filter by acquisition source (reddit, linkedin, referral, etc.)",
          },
          not_contacted_since_days: {
            type: "number",
            description: "Find contacts not engaged in N days",
          },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
    {
      name: "add_contact",
      description:
        "Add a new contact to the marketing CRM. Use after discovering a potential lead, partner, or therapist during outreach.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          first_name: { type: "string" },
          last_name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          company: { type: "string" },
          title: { type: "string" },
          contact_type: {
            type: "string",
            description:
              "lead, prospect, customer, partner, therapist, influencer, media, other",
          },
          source: { type: "string", description: "Where you found them" },
          persona: {
            type: "string",
            description: "Which persona from strategy doc",
          },
          tags: { type: "array", items: { type: "string" } },
          location: { type: "string" },
          notes: { type: "string" },
        },
        required: ["first_name"],
      },
    },
    {
      name: "update_contact",
      description:
        "Update an existing contact's information, status, lead score, tags, or notes.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          contact_id: { type: "string", description: "UUID of the contact" },
          updates: {
            type: "object",
            description: "Fields to update (any contact field)",
          },
        },
        required: ["contact_id", "updates"],
      },
    },
    {
      name: "log_outreach",
      description:
        "Log an outreach touchpoint with a contact. Records channel, content, persona used, and links to campaigns. Automatically updates the contact's last_engaged timestamp.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          contact_id: { type: "string", description: "UUID of the contact" },
          channel: {
            type: "string",
            description:
              "email, linkedin, reddit, twitter, phone, in_person, tiktok, instagram, other",
          },
          direction: { type: "string", description: "outbound or inbound" },
          subject: { type: "string" },
          content: {
            type: "string",
            description: "The message or summary",
          },
          persona_used: {
            type: "string",
            description: "Which persona/angle was used",
          },
          campaign_id: {
            type: "string",
            description: "Link to a campaign (optional)",
          },
          status: {
            type: "string",
            description:
              "drafted, sent, delivered, opened, replied, bounced, no_response",
          },
          notes: { type: "string" },
        },
        required: ["contact_id", "channel", "content"],
      },
    },
    {
      name: "get_outreach_history",
      description:
        "Get the full outreach history for a contact, or recent outreach across all contacts. Useful for follow-up planning and identifying who needs attention.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          contact_id: {
            type: "string",
            description: "UUID of a specific contact (optional)",
          },
          channel: { type: "string", description: "Filter by channel" },
          status: { type: "string", description: "Filter by status" },
          since_days: {
            type: "number",
            description: "Only show outreach from last N days",
          },
          limit: { type: "number", description: "Max results (default 50)" },
        },
      },
    },
    {
      name: "get_pipeline_summary",
      description:
        "Get a summary of your marketing pipeline — contact counts by lifecycle stage, engagement rates, and lead scores. Great for weekly reviews.",
      inputSchema: {
        type: "object",
        properties: { ...ORG_ID_PROP },
      },
    },
  ],

  handlers: {
    async search_contacts(client, args) {
      const ctx = toOrgContext(client);
      const result = await getContactsForOrg(ctx, {
        search: args.query as string | undefined,
        contact_type: args.contact_type,
        status: args.status,
        lifecycle_stage: args.lifecycle_stage,
        source: args.source as string | undefined,
        tags: args.tags as string[] | undefined,
        not_contacted_since_days: args.not_contacted_since_days as number | undefined,
        pageSize: (args.limit as number) || 20,
      } as Parameters<typeof getContactsForOrg>[1]);
      return ok(JSON.stringify(result.contacts, null, 2));
    },

    async add_contact(client, args) {
      const ctx = toOrgContext(client);
      const { org_id: _, ...contactData } = args;
      const data = await createContact(ctx, contactData as unknown as Parameters<typeof createContact>[1]);
      return ok(`Contact created: ${JSON.stringify(data, null, 2)}`);
    },

    async update_contact(client, args) {
      const ctx = toOrgContext(client);
      const data = await updateContact(
        ctx,
        args.contact_id as string,
        args.updates as Parameters<typeof updateContact>[2],
      );
      return ok(`Contact updated: ${JSON.stringify(data, null, 2)}`);
    },

    async log_outreach(client, args) {
      const ctx = toOrgContext(client);
      const { org_id: _, ...outreachData } = args;
      const data = await logOutreach(ctx, outreachData as unknown as Parameters<typeof logOutreach>[1]);
      return ok(`Outreach logged: ${JSON.stringify(data, null, 2)}`);
    },

    async get_outreach_history(client, args) {
      const ctx = toOrgContext(client);
      const data = await getOutreachHistory(ctx, {
        contact_id: args.contact_id as string | undefined,
        channel: args.channel,
        status: args.status,
        since_days: args.since_days as number | undefined,
        limit: args.limit as number | undefined,
      } as Parameters<typeof getOutreachHistory>[1]);
      return ok(JSON.stringify(data, null, 2));
    },

    async get_pipeline_summary(client) {
      const ctx = toOrgContext(client);
      const data = await getPipelineSummary(ctx);
      return ok(JSON.stringify(data, null, 2));
    },
  },
};
