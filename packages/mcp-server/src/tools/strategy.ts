import type { ToolModule } from "./types.js";
import { ok } from "./types.js";

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
      const { data, error } = await client
        .from("mktg_strategy_docs")
        .select("*")
        .eq("org_id", client.orgId)
        .eq("doc_type", args.doc_type as string)
        .eq("is_active", true)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return ok(
        data
          ? JSON.stringify(data, null, 2)
          : `No active ${args.doc_type} document found. Use update_strategy_doc to create one.`,
      );
    },

    async update_strategy_doc(client, args) {
      // NOTE: The web app uses the update_strategy_doc RPC (migration 005) which
      // locks with FOR UPDATE. The MCP server can't use that RPC because it runs
      // with service_role (no auth.uid()). This 3-query pattern is safe because
      // idx_mktg_strategy_one_active_per_type prevents two active docs of the
      // same type. On concurrent conflict, the unique index rejects the second
      // insert and we return a clear retry message.
      await client
        .from("mktg_strategy_docs")
        .update({ is_active: false })
        .eq("org_id", client.orgId)
        .eq("doc_type", args.doc_type as string)
        .eq("is_active", true);

      const { data: prev } = await client
        .from("mktg_strategy_docs")
        .select("id, version")
        .eq("org_id", client.orgId)
        .eq("doc_type", args.doc_type as string)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      const { data, error } = await client
        .from("mktg_strategy_docs")
        .insert({
          org_id: client.orgId,
          doc_type: args.doc_type,
          title: (args.title as string) || (args.doc_type as string),
          content: args.content,
          version: prev ? (prev.version as number) + 1 : 1,
          previous_version_id: prev?.id || null,
          change_summary: args.change_summary,
          changed_by: (args.changed_by as string) || "claude",
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        // Unique index violation = concurrent edit. Guide the caller to retry.
        if (error.code === "23505") {
          throw new Error(
            "Concurrent strategy doc update detected — another edit was saved first. " +
            "Please retry to create a new version on top of the latest.",
          );
        }
        throw error;
      }
      return ok(
        `Strategy doc updated (v${data.version}): ${JSON.stringify(data, null, 2)}`,
      );
    },

    async search_strategy(client, args) {
      let query = client
        .from("mktg_strategy_docs")
        .select("id, doc_type, title, content, version, updated_at")
        .eq("org_id", client.orgId)
        .eq("is_active", true)
        .ilike("content", `%${args.query}%`);

      if (args.doc_types)
        query = query.in("doc_type", args.doc_types as string[]);

      const { data, error } = await query.limit(
        (args.limit as number) || 5,
      );
      if (error) throw error;
      return ok(JSON.stringify(data, null, 2));
    },

    async get_competitors(client, args) {
      let query = client
        .from("mktg_competitors")
        .select("*")
        .eq("org_id", client.orgId);
      if (args.threat_level) query = query.eq("threat_level", args.threat_level);
      const { data, error } = await query.order("threat_level");
      if (error) throw error;
      return ok(JSON.stringify(data, null, 2));
    },

    async update_competitor(client, args) {
      const { org_id: _, id, ...competitorData } = args;
      if (id) {
        const { data, error } = await client
          .from("mktg_competitors")
          .update({
            ...competitorData,
            last_analyzed: new Date().toISOString(),
          })
          .eq("id", id as string)
          .eq("org_id", client.orgId)
          .select()
          .single();
        if (error) throw error;
        return ok(`Competitor updated: ${JSON.stringify(data, null, 2)}`);
      } else {
        const { data, error } = await client
          .from("mktg_competitors")
          .insert({
            ...competitorData,
            org_id: client.orgId,
            last_analyzed: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) throw error;
        return ok(`Competitor added: ${JSON.stringify(data, null, 2)}`);
      }
    },

    async log_insight(client, args) {
      const { org_id: _, ...insightData } = args;
      const { data, error } = await client
        .from("mktg_insights")
        .insert({ ...insightData, org_id: client.orgId })
        .select()
        .single();
      if (error) throw error;
      return ok(`Insight logged: ${JSON.stringify(data, null, 2)}`);
    },
  },
};
