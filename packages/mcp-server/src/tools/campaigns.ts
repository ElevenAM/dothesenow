import type { ToolModule } from "./types.js";
import { ok } from "./types.js";

const ORG_ID_PROP = {
  org_id: {
    type: "string",
    description: "Organization UUID (falls back to ORG_ID env)",
  },
};

export const campaigns: ToolModule = {
  definitions: [
    {
      name: "create_campaign",
      description:
        "Create a marketing campaign to group related outreach, content, and tasks.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          name: { type: "string" },
          description: { type: "string" },
          campaign_type: {
            type: "string",
            description:
              "email_sequence, content_series, social_campaign, launch, partnership, event, other",
          },
          target_persona: { type: "string" },
          target_tags: { type: "array", items: { type: "string" } },
          budget: { type: "number" },
          start_date: { type: "string" },
          end_date: { type: "string" },
        },
        required: ["name", "campaign_type"],
      },
    },
    {
      name: "create_weekly_review",
      description:
        "Generate and store a weekly marketing review. Pulls together pipeline stats, outreach metrics, task completion rates, and strategic insights into a single summary.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          week_start: {
            type: "string",
            description: "ISO date for week start",
          },
          week_end: {
            type: "string",
            description: "ISO date for week end",
          },
          metrics: {
            type: "object",
            description: "KPI data (website visits, signups, etc.)",
          },
          wins: { type: "array", items: { type: "string" } },
          challenges: { type: "array", items: { type: "string" } },
          learnings: { type: "array", items: { type: "string" } },
          strategy_changes: { type: "string" },
          next_week_priorities: { type: "array", items: { type: "string" } },
          ai_summary: { type: "string" },
        },
        required: ["week_start", "week_end"],
      },
    },
  ],

  handlers: {
    async create_campaign(client, args) {
      const { org_id: _, ...campaignData } = args;
      const { data, error } = await client
        .from("mktg_campaigns")
        .insert({ ...campaignData, org_id: client.orgId })
        .select()
        .single();
      if (error) throw error;
      return ok(`Campaign created: ${JSON.stringify(data, null, 2)}`);
    },

    async create_weekly_review(client, args) {
      const { org_id: _, ...reviewData } = args;
      const { data, error } = await client
        .from("mktg_weekly_reviews")
        .insert({ ...reviewData, org_id: client.orgId })
        .select()
        .single();
      if (error) throw error;
      return ok(`Weekly review saved: ${JSON.stringify(data, null, 2)}`);
    },
  },
};
