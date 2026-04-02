import type { ToolModule } from "./types.js";
import { ok } from "./types.js";

const ORG_ID_PROP = {
  org_id: {
    type: "string",
    description: "Organization UUID (falls back to ORG_ID env)",
  },
};

export const marketplace: ToolModule = {
  definitions: [
    {
      name: "create_task",
      description:
        "Post a new task to the freelancer marketplace. Generates a task brief from context while keeping sensitive strategy docs private. Only the 'brief', 'brand_guidelines', and 'reference_materials' fields are visible to freelancers.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          title: { type: "string" },
          description: {
            type: "string",
            description:
              "Internal description (not shared with freelancers)",
          },
          task_type: {
            type: "string",
            description:
              "blog_post, social_content, email_copy, design, video, seo_audit, research, outreach, ad_copy, landing_page, case_study, other",
          },
          brief: {
            type: "string",
            description: "The task brief shared with freelancers",
          },
          brand_guidelines: {
            type: "string",
            description: "Relevant brand voice excerpt for freelancers",
          },
          reference_materials: {
            type: "string",
            description: "Links or content freelancers need",
          },
          required_skills: { type: "array", items: { type: "string" } },
          deliverables: {
            type: "string",
            description: "What exactly needs to be submitted",
          },
          engagement_type: {
            type: "string",
            description: "freelance or work_to_hire",
          },
          budget: { type: "number" },
          payment_type: {
            type: "string",
            description: "fixed, hourly, or milestone",
          },
          priority: {
            type: "string",
            description: "low, medium, high, urgent",
          },
          due_date: { type: "string", description: "ISO date" },
          campaign_id: {
            type: "string",
            description: "Link to a campaign (optional)",
          },
          status: {
            type: "string",
            description: "draft (default) or open",
          },
        },
        required: ["title", "task_type", "brief"],
      },
    },
    {
      name: "list_tasks",
      description:
        "List marketplace tasks. Filter by status, type, assigned freelancer, or campaign.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
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
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          submission_id: { type: "string" },
          status: {
            type: "string",
            description: "approved, revision_requested, rejected",
          },
          reviewer_notes: {
            type: "string",
            description: "Your feedback to the freelancer",
          },
          ai_review: {
            type: "string",
            description: "Claude's quality assessment",
          },
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
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          skills: {
            type: "array",
            items: { type: "string" },
            description: "Filter by required skills",
          },
          engagement_type: {
            type: "string",
            description: "freelance, work_to_hire, or both",
          },
          min_rating: {
            type: "number",
            description: "Minimum average rating",
          },
        },
      },
    },
    {
      name: "send_task_message",
      description:
        "Send a message to a freelancer about a task. Messages are scoped to the task — freelancers cannot see other tasks or strategy docs.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          task_id: { type: "string" },
          content: { type: "string" },
          sender_type: {
            type: "string",
            description: "owner or ai",
          },
        },
        required: ["task_id", "content"],
      },
    },
  ],

  handlers: {
    async create_task(client, args) {
      const { org_id: _, ...taskData } = args;
      const { data, error } = await client
        .from("mktg_tasks")
        .insert({
          ...taskData,
          org_id: client.orgId,
          generated_by_ai: true,
          status: (taskData.status as string) || "draft",
        })
        .select()
        .single();
      if (error) throw error;
      return ok(`Task created: ${JSON.stringify(data, null, 2)}`);
    },

    async list_tasks(client, args) {
      let query = client
        .from("mktg_tasks")
        .select("*, mktg_freelancers(name, email)")
        .eq("org_id", client.orgId);

      if (args.status) query = query.eq("status", args.status);
      if (args.task_type) query = query.eq("task_type", args.task_type);
      if (args.assigned_to) query = query.eq("assigned_to", args.assigned_to);
      if (args.campaign_id) query = query.eq("campaign_id", args.campaign_id);

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit((args.limit as number) || 20);
      if (error) throw error;
      return ok(JSON.stringify(data, null, 2));
    },

    async review_submission(client, args) {
      const { org_id: _, submission_id, ...reviewData } = args;
      const { data, error } = await client
        .from("mktg_task_submissions")
        .update({
          ...reviewData,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", submission_id as string)
        .eq("org_id", client.orgId)
        .select()
        .single();
      if (error) throw error;

      // TODO: Phase 5 — wrap these 3 writes in a Postgres function for atomicity.
      // Currently, if the freelancer stats update fails, task is marked completed
      // but stats are inconsistent.
      if (reviewData.status === "approved") {
        await client
          .from("mktg_tasks")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", data.task_id)
          .eq("org_id", client.orgId);

        if (data.freelancer_id) {
          const { data: freelancer } = await client
            .from("mktg_freelancers")
            .select("tasks_completed, avg_rating")
            .eq("id", data.freelancer_id)
            .eq("org_id", client.orgId)
            .single();
          if (freelancer) {
            const newCount = (freelancer.tasks_completed || 0) + 1;
            const newRating = reviewData.rating
              ? ((freelancer.avg_rating || 0) * (newCount - 1) +
                  (reviewData.rating as number)) /
                newCount
              : freelancer.avg_rating;
            await client
              .from("mktg_freelancers")
              .update({ tasks_completed: newCount, avg_rating: newRating })
              .eq("id", data.freelancer_id)
              .eq("org_id", client.orgId);
          }
        }
      }

      return ok(
        `Submission reviewed: ${JSON.stringify(data, null, 2)}`,
      );
    },

    async get_freelancer_leaderboard(client, args) {
      let query;

      if (args.skills) {
        query = client
          .from("mktg_freelancers")
          .select("*")
          .eq("org_id", client.orgId)
          .eq("available", true)
          .overlaps("skills", args.skills as string[]);
      } else {
        query = client
          .from("mktg_freelancer_leaderboard")
          .select("*")
          .eq("org_id", client.orgId);
      }
      if (args.engagement_type && args.engagement_type !== "both")
        query = query.eq("engagement_type", args.engagement_type);
      if (args.min_rating)
        query = query.gte("avg_rating", args.min_rating);

      const { data, error } = await query;
      if (error) throw error;
      return ok(JSON.stringify(data, null, 2));
    },

    async send_task_message(client, args) {
      const { data, error } = await client
        .from("mktg_task_messages")
        .insert({
          task_id: args.task_id,
          content: args.content,
          sender_type: (args.sender_type as string) || "owner",
          org_id: client.orgId,
        })
        .select()
        .single();
      if (error) throw error;
      return ok(`Message sent: ${JSON.stringify(data, null, 2)}`);
    },
  },
};
