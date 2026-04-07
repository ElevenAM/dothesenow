import type { ToolModule } from "./types.js";
import { ok } from "./types.js";
import { toOrgContext } from "../lib/supabase.js";
import {
  getStrategyDocs,
  createDocDirect,
  searchStrategyDocs,
} from "@dothesenow/queries";
import {
  getCompetitorsForOrg,
  upsertCompetitor,
} from "@dothesenow/queries";
import { createInsight } from "@dothesenow/queries";
import type { DocType } from "@dothesenow/types";

const ORG_ID_PROP = {
  org_id: {
    type: "string",
    description: "Organization UUID (falls back to ORG_ID env)",
  },
};

export const strategy: ToolModule = {
  definitions: [
    {
      name: "get_strategy_doc",
      description:
        "Retrieve a marketing strategy document by type. Returns the current active version. Types: master_strategy, competitive_analysis, value_props, brand_voice, personas, positioning, content_calendar, channel_strategy, pricing_strategy, playbook.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          doc_type: {
            type: "string",
            description: "The strategy document type to retrieve",
          },
        },
        required: ["doc_type"],
      },
    },
    {
      name: "update_strategy_doc",
      description:
        "Update a strategy document with new content. Creates a new version while preserving history. Include a change_summary explaining what changed and why.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          doc_type: {
            type: "string",
            description: "The strategy document type",
          },
          title: { type: "string", description: "Document title" },
          content: {
            type: "string",
            description: "Full markdown content (replaces entire doc)",
          },
          change_summary: {
            type: "string",
            description: "What changed and why",
          },
          changed_by: {
            type: "string",
            description: "'claude' or 'user'",
          },
        },
        required: ["doc_type", "content", "change_summary"],
      },
    },
    {
      name: "search_strategy",
      description:
        "Semantic search across all strategy documents. Use when you need to find relevant strategic context for a specific topic, persona, or campaign.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          query: {
            type: "string",
            description: "What are you looking for?",
          },
          doc_types: {
            type: "array",
            items: { type: "string" },
            description: "Limit to specific doc types (optional)",
          },
          limit: { type: "number", description: "Max results (default 5)" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_competitors",
      description:
        "List tracked competitors with their positioning, strengths, weaknesses, and threat level. Optionally filter by threat level.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          threat_level: {
            type: "string",
            description: "Filter: low, medium, high, critical",
          },
        },
      },
    },
    {
      name: "update_competitor",
      description:
        "Add or update a competitor entry with latest intelligence.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          id: {
            type: "string",
            description: "UUID to update (omit to create new)",
          },
          name: { type: "string" },
          website: { type: "string" },
          description: { type: "string" },
          target_market: { type: "string" },
          pricing: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          latest_moves: { type: "string" },
          our_advantage: { type: "string" },
          threat_level: { type: "string" },
        },
        required: ["name"],
      },
    },
    {
      name: "log_insight",
      description:
        "Record a marketing insight or learning. Use during weekly reviews or when analyzing campaign performance. Types: what_worked, what_failed, opportunity, trend, customer_feedback, metric_shift.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          insight_type: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          source: { type: "string" },
          evidence: { type: "string" },
          action_taken: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["insight_type", "title", "description"],
      },
    },
  ],

  handlers: {
    async get_strategy_doc(client, args) {
      const ctx = toOrgContext(client);
      const docs = await getStrategyDocs(ctx, {
        doc_type: args.doc_type as DocType,
        is_active: true,
      });
      const doc = docs[0] ?? null;
      return ok(
        doc
          ? JSON.stringify(doc, null, 2)
          : `No active ${args.doc_type} document found. Use update_strategy_doc to create one.`,
      );
    },

    async update_strategy_doc(client, args) {
      const ctx = toOrgContext(client);
      const docId = await createDocDirect(ctx, {
        doc_type: args.doc_type as DocType,
        title: (args.title as string) || (args.doc_type as string),
        content: args.content as string,
        change_summary: args.change_summary as string,
        changed_by: (args.changed_by as string) || "claude",
      });
      return ok(`Strategy doc updated: ${docId}`);
    },

    async search_strategy(client, args) {
      const ctx = toOrgContext(client);
      const data = await searchStrategyDocs(ctx, args.query as string, {
        doc_types: args.doc_types as string[] | undefined,
        limit: args.limit as number | undefined,
      });
      return ok(JSON.stringify(data, null, 2));
    },

    async get_competitors(client, args) {
      const ctx = toOrgContext(client);
      const data = await getCompetitorsForOrg(ctx, {
        threat_level: args.threat_level as string | undefined,
      });
      return ok(JSON.stringify(data, null, 2));
    },

    async update_competitor(client, args) {
      const ctx = toOrgContext(client);
      const { org_id: _, id, ...competitorData } = args;
      const data = await upsertCompetitor(
        ctx,
        id as string | undefined,
        competitorData as Parameters<typeof upsertCompetitor>[2],
      );
      return ok(
        id
          ? `Competitor updated: ${JSON.stringify(data, null, 2)}`
          : `Competitor added: ${JSON.stringify(data, null, 2)}`,
      );
    },

    async log_insight(client, args) {
      const ctx = toOrgContext(client);
      const { org_id: _, ...insightData } = args;
      const data = await createInsight(ctx, insightData as unknown as Parameters<typeof createInsight>[1]);
      return ok(`Insight logged: ${JSON.stringify(data, null, 2)}`);
    },
  },
};
