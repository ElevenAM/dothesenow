/**
 * Marketing Ops MCP Server
 *
 * Connects your CRM, strategy hub, and talent marketplace to Claude Desktop
 * via the Model Context Protocol. This is a STANDALONE project — deploy it
 * against a NEW Supabase project, NOT your BridgeCalm database.
 *
 * Setup:
 *   1. Create a new Supabase project for marketing ops
 *   2. Run supabase-migration.sql in that project's SQL Editor
 *   3. Copy .env.example to .env and fill in your new project credentials
 *   4. npm install && npm run build
 *   5. Add to Claude Desktop's MCP config (see README)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// ============================================================================
// SUPABASE CLIENT (connects to your NEW marketing ops project)
// ============================================================================

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // service role for full access from MCP
);

// ============================================================================
// MCP SERVER SETUP
// ============================================================================

const server = new Server(
  {
    name: "marketing-ops",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ---- CRM TOOLS ----
    {
      name: "search_contacts",
      description:
        "Search your marketing CRM contacts. Filter by type (lead, prospect, customer, partner, therapist, influencer, media), status, tags, location, persona, or free text. Returns matching contacts with their outreach history summary.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Free text search across name, email, company, notes" },
          contact_type: { type: "string", description: "Filter by type: lead, prospect, customer, partner, therapist, influencer, media, other" },
          status: { type: "string", description: "Filter by status: active, inactive, do_not_contact, churned" },
          tags: { type: "array", items: { type: "string" }, description: "Filter by tags (matches any)" },
          lifecycle_stage: { type: "string", description: "Filter by stage: awareness, consideration, decision, customer, advocate" },
          source: { type: "string", description: "Filter by acquisition source (reddit, linkedin, referral, etc.)" },
          not_contacted_since_days: { type: "number", description: "Find contacts not engaged in N days" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
    {
      name: "add_contact",
      description:
        "Add a new contact to the marketing CRM. Use after discovering a potential lead, partner, or therapist during outreach.",
      inputSchema: {
        type: "object" as const,
        properties: {
          first_name: { type: "string" },
          last_name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          company: { type: "string" },
          title: { type: "string" },
          contact_type: { type: "string", description: "lead, prospect, customer, partner, therapist, influencer, media, other" },
          source: { type: "string", description: "Where you found them" },
          persona: { type: "string", description: "Which persona from strategy doc" },
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
        type: "object" as const,
        properties: {
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
        type: "object" as const,
        properties: {
          contact_id: { type: "string", description: "UUID of the contact" },
          channel: { type: "string", description: "email, linkedin, reddit, twitter, phone, in_person, tiktok, instagram, other" },
          direction: { type: "string", description: "outbound or inbound" },
          subject: { type: "string" },
          content: { type: "string", description: "The message or summary" },
          persona_used: { type: "string", description: "Which persona/angle was used" },
          campaign_id: { type: "string", description: "Link to a campaign (optional)" },
          status: { type: "string", description: "drafted, sent, delivered, opened, replied, bounced, no_response" },
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
        type: "object" as const,
        properties: {
          contact_id: { type: "string", description: "UUID of a specific contact (optional)" },
          channel: { type: "string", description: "Filter by channel" },
          status: { type: "string", description: "Filter by status" },
          since_days: { type: "number", description: "Only show outreach from last N days" },
          limit: { type: "number", description: "Max results (default 50)" },
        },
      },
    },
    {
      name: "get_pipeline_summary",
      description:
        "Get a summary of your marketing pipeline — contact counts by lifecycle stage, engagement rates, and lead scores. Great for weekly reviews.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },

    // ---- STRATEGY TOOLS ----
    {
      name: "get_strategy_doc",
      description:
        "Retrieve a marketing strategy document by type. Returns the current active version. Types: master_strategy, competitive_analysis, value_props, brand_voice, personas, positioning, content_calendar, channel_strategy, pricing_strategy, playbook.",
      inputSchema: {
        type: "object" as const,
        properties: {
          doc_type: { type: "string", description: "The strategy document type to retrieve" },
        },
        required: ["doc_type"],
      },
    },
    {
      name: "update_strategy_doc",
      description:
        "Update a strategy document with new content. Creates a new version while preserving history. Include a change_summary explaining what changed and why.",
      inputSchema: {
        type: "object" as const,
        properties: {
          doc_type: { type: "string", description: "The strategy document type" },
          title: { type: "string", description: "Document title" },
          content: { type: "string", description: "Full markdown content (replaces entire doc)" },
          change_summary: { type: "string", description: "What changed and why" },
          changed_by: { type: "string", description: "'claude' or 'user'" },
        },
        required: ["doc_type", "content", "change_summary"],
      },
    },
    {
      name: "search_strategy",
      description:
        "Semantic search across all strategy documents. Use when you need to find relevant strategic context for a specific topic, persona, or campaign.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "What are you looking for?" },
          doc_types: { type: "array", items: { type: "string" }, description: "Limit to specific doc types (optional)" },
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
        type: "object" as const,
        properties: {
          threat_level: { type: "string", description: "Filter: low, medium, high, critical" },
        },
      },
    },
    {
      name: "update_competitor",
      description:
        "Add or update a competitor entry with latest intelligence.",
      inputSchema: {
        type: "object" as const,
        properties: {
          id: { type: "string", description: "UUID to update (omit to create new)" },
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
        type: "object" as const,
        properties: {
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

    // ---- MARKETPLACE TOOLS ----
    {
      name: "create_task",
      description:
        "Post a new task to the freelancer marketplace. Generates a task brief from context while keeping sensitive strategy docs private. Only the 'brief', 'brand_guidelines', and 'reference_materials' fields are visible to freelancers.",
      inputSchema: {
        type: "object" as const,
        properties: {
          title: { type: "string" },
          description: { type: "string", description: "Internal description (not shared with freelancers)" },
          task_type: { type: "string", description: "blog_post, social_content, email_copy, design, video, seo_audit, research, outreach, ad_copy, landing_page, case_study, other" },
          brief: { type: "string", description: "The task brief shared with freelancers" },
          brand_guidelines: { type: "string", description: "Relevant brand voice excerpt for freelancers" },
          reference_materials: { type: "string", description: "Links or content freelancers need" },
          required_skills: { type: "array", items: { type: "string" } },
          deliverables: { type: "string", description: "What exactly needs to be submitted" },
          engagement_type: { type: "string", description: "freelance or work_to_hire" },
          budget: { type: "number" },
          payment_type: { type: "string", description: "fixed, hourly, or milestone" },
          priority: { type: "string", description: "low, medium, high, urgent" },
          due_date: { type: "string", description: "ISO date" },
          campaign_id: { type: "string", description: "Link to a campaign (optional)" },
          status: { type: "string", description: "draft (default) or open" },
        },
        required: ["title", "task_type", "brief"],
      },
    },
    {
      name: "list_tasks",
      description:
        "List marketplace tasks. Filter by status, type, assigned freelancer, or campaign.",
      inputSchema: {
        type: "object" as const,
        properties: {
          status: { type: "string" },
          task_type: { type: "string" },
          assigned_to: { type: "string" },
          campaign_id: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "review_submission",
      description:
        "Review a freelancer's task submission. Approve, request revision, or reject. Optionally include AI-assisted quality assessment.",
      inputSchema: {
        type: "object" as const,
        properties: {
          submission_id: { type: "string" },
          status: { type: "string", description: "approved, revision_requested, rejected" },
          reviewer_notes: { type: "string", description: "Your feedback to the freelancer" },
          ai_review: { type: "string", description: "Claude's quality assessment" },
          rating: { type: "number", description: "1-5 rating" },
        },
        required: ["submission_id", "status"],
      },
    },
    {
      name: "get_freelancer_leaderboard",
      description:
        "View available freelancers ranked by rating, reliability, and completed tasks. Use to find the right person for a new task.",
      inputSchema: {
        type: "object" as const,
        properties: {
          skills: { type: "array", items: { type: "string" }, description: "Filter by required skills" },
          engagement_type: { type: "string", description: "freelance, work_to_hire, or both" },
          min_rating: { type: "number", description: "Minimum average rating" },
        },
      },
    },
    {
      name: "send_task_message",
      description:
        "Send a message to a freelancer about a task. Messages are scoped to the task — freelancers cannot see other tasks or strategy docs.",
      inputSchema: {
        type: "object" as const,
        properties: {
          task_id: { type: "string" },
          content: { type: "string" },
          sender_type: { type: "string", description: "owner or ai" },
        },
        required: ["task_id", "content"],
      },
    },

    // ---- CAMPAIGNS & REVIEWS ----
    {
      name: "create_campaign",
      description:
        "Create a marketing campaign to group related outreach, content, and tasks.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          campaign_type: { type: "string", description: "email_sequence, content_series, social_campaign, launch, partnership, event, other" },
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
        type: "object" as const,
        properties: {
          week_start: { type: "string", description: "ISO date for week start" },
          week_end: { type: "string", description: "ISO date for week end" },
          metrics: { type: "object", description: "KPI data (website visits, signups, etc.)" },
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
}));

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ---- CRM ----
      case "search_contacts": {
        let query = supabase.from("mktg_contacts").select("*");

        if (args?.query) {
          query = query.or(
            `first_name.ilike.%${args.query}%,last_name.ilike.%${args.query}%,email.ilike.%${args.query}%,company.ilike.%${args.query}%,notes.ilike.%${args.query}%`
          );
        }
        if (args?.contact_type) query = query.eq("contact_type", args.contact_type);
        if (args?.status) query = query.eq("status", args.status);
        if (args?.lifecycle_stage) query = query.eq("lifecycle_stage", args.lifecycle_stage);
        if (args?.source) query = query.ilike("source", `%${args.source}%`);
        if (args?.tags) query = query.overlaps("tags", args.tags);
        if (args?.not_contacted_since_days) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - (args.not_contacted_since_days as number));
          query = query.or(`last_engaged.is.null,last_engaged.lt.${cutoff.toISOString()}`);
        }

        const { data, error } = await query
          .order("last_engaged", { ascending: false, nullsFirst: false })
          .limit((args?.limit as number) || 20);

        if (error) throw error;
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "add_contact": {
        const { data, error } = await supabase
          .from("mktg_contacts")
          .insert(args as any)
          .select()
          .single();
        if (error) throw error;
        return { content: [{ type: "text", text: `Contact created: ${JSON.stringify(data, null, 2)}` }] };
      }

      case "update_contact": {
        const { contact_id, updates } = args as any;
        const { data, error } = await supabase
          .from("mktg_contacts")
          .update(updates)
          .eq("id", contact_id)
          .select()
          .single();
        if (error) throw error;
        return { content: [{ type: "text", text: `Contact updated: ${JSON.stringify(data, null, 2)}` }] };
      }

      case "log_outreach": {
        const { contact_id, ...outreachData } = args as any;
        const { data, error } = await supabase
          .from("mktg_outreach_log")
          .insert({ contact_id, ...outreachData })
          .select()
          .single();
        if (error) throw error;

        // Update contact's last_engaged
        await supabase
          .from("mktg_contacts")
          .update({ last_engaged: new Date().toISOString() })
          .eq("id", contact_id);

        return { content: [{ type: "text", text: `Outreach logged: ${JSON.stringify(data, null, 2)}` }] };
      }

      case "get_outreach_history": {
        let query = supabase
          .from("mktg_outreach_log")
          .select("*, mktg_contacts(first_name, last_name, email, company)");

        if (args?.contact_id) query = query.eq("contact_id", args.contact_id);
        if (args?.channel) query = query.eq("channel", args.channel);
        if (args?.status) query = query.eq("status", args.status);
        if (args?.since_days) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - (args.since_days as number));
          query = query.gte("sent_at", cutoff.toISOString());
        }

        const { data, error } = await query
          .order("sent_at", { ascending: false })
          .limit((args?.limit as number) || 50);
        if (error) throw error;
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "get_pipeline_summary": {
        const { data, error } = await supabase
          .from("mktg_pipeline_summary")
          .select("*");
        if (error) throw error;
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      // ---- STRATEGY ----
      case "get_strategy_doc": {
        const { data, error } = await supabase
          .from("mktg_strategy_docs")
          .select("*")
          .eq("doc_type", args!.doc_type)
          .eq("is_active", true)
          .single();
        if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
        return {
          content: [{
            type: "text",
            text: data
              ? JSON.stringify(data, null, 2)
              : `No active ${args!.doc_type} document found. Use update_strategy_doc to create one.`,
          }],
        };
      }

      case "update_strategy_doc": {
        // Deactivate current version
        await supabase
          .from("mktg_strategy_docs")
          .update({ is_active: false })
          .eq("doc_type", args!.doc_type as string)
          .eq("is_active", true);

        // Get previous version for linking
        const { data: prev } = await supabase
          .from("mktg_strategy_docs")
          .select("id, version")
          .eq("doc_type", args!.doc_type as string)
          .order("version", { ascending: false })
          .limit(1)
          .single();

        const { data, error } = await supabase
          .from("mktg_strategy_docs")
          .insert({
            doc_type: args!.doc_type,
            title: args!.title || args!.doc_type,
            content: args!.content,
            version: prev ? (prev.version as number) + 1 : 1,
            previous_version_id: prev?.id || null,
            change_summary: args!.change_summary,
            changed_by: args!.changed_by || "claude",
            is_active: true,
          })
          .select()
          .single();
        if (error) throw error;
        return { content: [{ type: "text", text: `Strategy doc updated (v${data.version}): ${JSON.stringify(data, null, 2)}` }] };
      }

      case "search_strategy": {
        // Text-based search fallback (vector search requires embedding generation)
        let query = supabase
          .from("mktg_strategy_docs")
          .select("id, doc_type, title, content, version, updated_at")
          .eq("is_active", true)
          .ilike("content", `%${args!.query}%`);

        if (args?.doc_types) query = query.in("doc_type", args.doc_types as string[]);

        const { data, error } = await query.limit((args?.limit as number) || 5);
        if (error) throw error;
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "get_competitors": {
        let query = supabase.from("mktg_competitors").select("*");
        if (args?.threat_level) query = query.eq("threat_level", args.threat_level);
        const { data, error } = await query.order("threat_level");
        if (error) throw error;
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "update_competitor": {
        const { id, ...competitorData } = args as any;
        if (id) {
          const { data, error } = await supabase
            .from("mktg_competitors")
            .update({ ...competitorData, last_analyzed: new Date().toISOString() })
            .eq("id", id)
            .select()
            .single();
          if (error) throw error;
          return { content: [{ type: "text", text: `Competitor updated: ${JSON.stringify(data, null, 2)}` }] };
        } else {
          const { data, error } = await supabase
            .from("mktg_competitors")
            .insert({ ...competitorData, last_analyzed: new Date().toISOString() })
            .select()
            .single();
          if (error) throw error;
          return { content: [{ type: "text", text: `Competitor added: ${JSON.stringify(data, null, 2)}` }] };
        }
      }

      case "log_insight": {
        const { data, error } = await supabase
          .from("mktg_insights")
          .insert(args as any)
          .select()
          .single();
        if (error) throw error;
        return { content: [{ type: "text", text: `Insight logged: ${JSON.stringify(data, null, 2)}` }] };
      }

      // ---- MARKETPLACE ----
      case "create_task": {
        const { data, error } = await supabase
          .from("mktg_tasks")
          .insert({
            ...args as any,
            generated_by_ai: true,
            status: (args as any).status || "draft",
          })
          .select()
          .single();
        if (error) throw error;
        return { content: [{ type: "text", text: `Task created: ${JSON.stringify(data, null, 2)}` }] };
      }

      case "list_tasks": {
        let query = supabase
          .from("mktg_tasks")
          .select("*, mktg_freelancers(name, email)");

        if (args?.status) query = query.eq("status", args.status);
        if (args?.task_type) query = query.eq("task_type", args.task_type);
        if (args?.assigned_to) query = query.eq("assigned_to", args.assigned_to);
        if (args?.campaign_id) query = query.eq("campaign_id", args.campaign_id);

        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit((args?.limit as number) || 20);
        if (error) throw error;
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "review_submission": {
        const { submission_id, ...reviewData } = args as any;
        const { data, error } = await supabase
          .from("mktg_task_submissions")
          .update({
            ...reviewData,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", submission_id)
          .select()
          .single();
        if (error) throw error;

        // If approved, update task status
        if (reviewData.status === "approved") {
          await supabase
            .from("mktg_tasks")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", data.task_id);

          // Update freelancer stats
          if (data.freelancer_id) {
            const { data: freelancer } = await supabase
              .from("mktg_freelancers")
              .select("tasks_completed, avg_rating")
              .eq("id", data.freelancer_id)
              .single();
            if (freelancer) {
              const newCount = (freelancer.tasks_completed || 0) + 1;
              const newRating = reviewData.rating
                ? ((freelancer.avg_rating || 0) * (newCount - 1) + reviewData.rating) / newCount
                : freelancer.avg_rating;
              await supabase
                .from("mktg_freelancers")
                .update({ tasks_completed: newCount, avg_rating: newRating })
                .eq("id", data.freelancer_id);
            }
          }
        }

        return { content: [{ type: "text", text: `Submission reviewed: ${JSON.stringify(data, null, 2)}` }] };
      }

      case "get_freelancer_leaderboard": {
        let query = supabase.from("mktg_freelancer_leaderboard").select("*");

        if (args?.skills) {
          // Filter freelancers who have any of the required skills
          query = supabase
            .from("mktg_freelancers")
            .select("*")
            .eq("available", true)
            .overlaps("skills", args.skills as string[]);
        }
        if (args?.min_rating) query = query.gte("avg_rating", args.min_rating);

        const { data, error } = await query;
        if (error) throw error;
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "send_task_message": {
        const { data, error } = await supabase
          .from("mktg_task_messages")
          .insert({
            task_id: args!.task_id,
            content: args!.content,
            sender_type: args!.sender_type || "owner",
          })
          .select()
          .single();
        if (error) throw error;
        return { content: [{ type: "text", text: `Message sent: ${JSON.stringify(data, null, 2)}` }] };
      }

      // ---- CAMPAIGNS & REVIEWS ----
      case "create_campaign": {
        const { data, error } = await supabase
          .from("mktg_campaigns")
          .insert(args as any)
          .select()
          .single();
        if (error) throw error;
        return { content: [{ type: "text", text: `Campaign created: ${JSON.stringify(data, null, 2)}` }] };
      }

      case "create_weekly_review": {
        const { data, error } = await supabase
          .from("mktg_weekly_reviews")
          .insert(args as any)
          .select()
          .single();
        if (error) throw error;
        return { content: [{ type: "text", text: `Weekly review saved: ${JSON.stringify(data, null, 2)}` }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error in ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

// ============================================================================
// START SERVER
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Marketing Ops MCP server running on stdio");
}

main().catch(console.error);
