import type { ToolModule } from "./types.js";
import { ok } from "./types.js";
import { toOrgContext } from "../lib/supabase.js";
import {
  getMarketplaceTasks,
  createMarketplaceTask,
  reviewSubmission,
  getFreelancerLeaderboard,
  sendTaskMessage,
} from "@dothesenow/queries";

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
              "blog_post (deliverable), social_content, email_copy, design, video, seo_audit, research, outreach, ad_copy, landing_page, case_study, other",
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
        "Review a freelancer's task submission. Approve, request revision, or reject. Atomically updates submission, task, and freelancer stats.",
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
      const ctx = toOrgContext(client);
      const { org_id: _, ...taskData } = args;
      const data = await createMarketplaceTask(ctx, taskData as unknown as Parameters<typeof createMarketplaceTask>[1]);
      return ok(`Task created: ${JSON.stringify(data, null, 2)}`);
    },

    async list_tasks(client, args) {
      const ctx = toOrgContext(client);
      const data = await getMarketplaceTasks(ctx, {
        status: args.status,
        task_type: args.task_type as string | undefined,
        assigned_to: args.assigned_to as string | undefined,
        campaign_id: args.campaign_id as string | undefined,
        limit: args.limit as number | undefined,
      } as Parameters<typeof getMarketplaceTasks>[1]);
      return ok(JSON.stringify(data, null, 2));
    },

    async review_submission(client, args) {
      const ctx = toOrgContext(client);
      const data = await reviewSubmission(ctx, args.submission_id as string, {
        status: args.status as "approved" | "revision_requested" | "rejected",
        reviewer_notes: args.reviewer_notes as string | undefined,
        ai_review: args.ai_review as string | undefined,
        rating: args.rating as number | undefined,
      });
      return ok(`Submission reviewed: ${JSON.stringify(data, null, 2)}`);
    },

    async get_freelancer_leaderboard(client, args) {
      const ctx = toOrgContext(client);
      const data = await getFreelancerLeaderboard(ctx, {
        skills: args.skills as string[] | undefined,
        engagement_type: args.engagement_type,
        min_rating: args.min_rating as number | undefined,
      } as Parameters<typeof getFreelancerLeaderboard>[1]);
      return ok(JSON.stringify(data, null, 2));
    },

    async send_task_message(client, args) {
      const ctx = toOrgContext(client);
      const data = await sendTaskMessage(ctx, {
        task_id: args.task_id as string,
        content: args.content as string,
        sender_type: args.sender_type as string | undefined,
      } as Parameters<typeof sendTaskMessage>[1]);
      return ok(`Message sent: ${JSON.stringify(data, null, 2)}`);
    },
  },
};
