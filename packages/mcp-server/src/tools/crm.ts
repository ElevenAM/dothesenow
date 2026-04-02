import type { ToolModule } from "./types.js";
import { ok } from "./types.js";

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
      let query = client
        .from("mktg_contacts")
        .select("*")
        .eq("org_id", client.orgId);

      if (args.query) {
        const q = args.query as string;
        query = query.or(
          `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%,notes.ilike.%${q}%`,
        );
      }
      if (args.contact_type)
        query = query.eq("contact_type", args.contact_type);
      if (args.status) query = query.eq("status", args.status);
      if (args.lifecycle_stage)
        query = query.eq("lifecycle_stage", args.lifecycle_stage);
      if (args.source) query = query.ilike("source", `%${args.source}%`);
      if (args.tags) query = query.overlaps("tags", args.tags as string[]);
      if (args.not_contacted_since_days) {
        const cutoff = new Date();
        cutoff.setDate(
          cutoff.getDate() - (args.not_contacted_since_days as number),
        );
        query = query.or(
          `last_engaged.is.null,last_engaged.lt.${cutoff.toISOString()}`,
        );
      }

      const { data, error } = await query
        .order("last_engaged", { ascending: false, nullsFirst: false })
        .limit((args.limit as number) || 20);

      if (error) throw error;
      return ok(JSON.stringify(data, null, 2));
    },

    async add_contact(client, args) {
      const { org_id: _, ...contactData } = args;
      const { data, error } = await client
        .from("mktg_contacts")
        .insert({ ...contactData, org_id: client.orgId })
        .select()
        .single();
      if (error) throw error;
      return ok(`Contact created: ${JSON.stringify(data, null, 2)}`);
    },

    async update_contact(client, args) {
      const { data, error } = await client
        .from("mktg_contacts")
        .update(args.updates as Record<string, unknown>)
        .eq("id", args.contact_id as string)
        .eq("org_id", client.orgId)
        .select()
        .single();
      if (error) throw error;
      return ok(`Contact updated: ${JSON.stringify(data, null, 2)}`);
    },

    async log_outreach(client, args) {
      const { org_id: _, contact_id, ...outreachData } = args;
      const { data, error } = await client
        .from("mktg_outreach_log")
        .insert({
          contact_id,
          ...outreachData,
          org_id: client.orgId,
        })
        .select()
        .single();
      if (error) throw error;

      await client
        .from("mktg_contacts")
        .update({ last_engaged: new Date().toISOString() })
        .eq("id", contact_id as string)
        .eq("org_id", client.orgId);

      return ok(`Outreach logged: ${JSON.stringify(data, null, 2)}`);
    },

    async get_outreach_history(client, args) {
      let query = client
        .from("mktg_outreach_log")
        .select("*, mktg_contacts(first_name, last_name, email, company)")
        .eq("org_id", client.orgId);

      if (args.contact_id)
        query = query.eq("contact_id", args.contact_id as string);
      if (args.channel) query = query.eq("channel", args.channel);
      if (args.status) query = query.eq("status", args.status);
      if (args.since_days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (args.since_days as number));
        query = query.gte("sent_at", cutoff.toISOString());
      }

      const { data, error } = await query
        .order("sent_at", { ascending: false })
        .limit((args.limit as number) || 50);
      if (error) throw error;
      return ok(JSON.stringify(data, null, 2));
    },

    async get_pipeline_summary(client) {
      const { data, error } = await client
        .from("mktg_pipeline_summary")
        .select("*")
        .eq("org_id", client.orgId);
      if (error) throw error;
      return ok(JSON.stringify(data, null, 2));
    },
  },
};
