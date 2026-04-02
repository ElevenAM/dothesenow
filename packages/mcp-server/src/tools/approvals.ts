import type { ToolModule } from "./types.js";
import { ok } from "./types.js";

const ORG_ID_PROP = {
  org_id: {
    type: "string",
    description: "Organization UUID (falls back to ORG_ID env)",
  },
};

export const approvals: ToolModule = {
  definitions: [
    {
      name: "submit_for_approval",
      description:
        "Submit content for human review. Creates an entry in the approval queue. If daily_task_id is provided, copies department_id from the linked task.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          title: { type: "string", description: "Title of the content" },
          content: {
            type: "string",
            description: "Full content to be reviewed",
          },
          item_type: {
            type: "string",
            description:
              "social_post, blog_post, email_draft, task_submission, strategy_change",
          },
          submitted_by_type: {
            type: "string",
            description: "freelancer, n8n, claude_api, member",
          },
          submitted_by_id: {
            type: "string",
            description: "User UUID of submitter (optional)",
          },
          daily_task_id: {
            type: "string",
            description:
              "UUID of linked daily task (copies department_id from task)",
          },
          department_id: {
            type: "string",
            description: "Department UUID (auto-set if daily_task_id provided)",
          },
          metadata: {
            type: "object",
            description: "Additional metadata (platform, channel, etc.)",
          },
          assigned_reviewer: {
            type: "string",
            description: "User UUID of assigned reviewer",
          },
        },
        required: ["title", "content", "item_type"],
      },
    },
    {
      name: "list_pending_approvals",
      description:
        "List items in the approval queue. Defaults to pending items. Supports filtering by status, item_type, and submitted_by_type.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          status: {
            type: "string",
            description:
              "Filter: pending (default), approved, rejected, revision_requested",
          },
          item_type: {
            type: "string",
            description:
              "Filter: social_post, blog_post, email_draft, task_submission, strategy_change",
          },
          submitted_by_type: {
            type: "string",
            description: "Filter: freelancer, n8n, claude_api, member",
          },
          limit: {
            type: "number",
            description: "Max results (default: 20)",
          },
        },
      },
    },
    {
      name: "review_approval",
      description:
        "Review an approval item: approve, reject, or request revision. Atomically updates the approval and linked daily task status.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          approval_id: { type: "string", description: "UUID of the approval item" },
          status: {
            type: "string",
            description: "approved, rejected, revision_requested",
          },
          reviewer_notes: {
            type: "string",
            description: "Feedback or notes for the submitter",
          },
        },
        required: ["approval_id", "status"],
      },
    },
  ],

  handlers: {
    async submit_for_approval(client, args) {
      const {
        org_id: _,
        title,
        content,
        item_type,
        submitted_by_type,
        submitted_by_id,
        daily_task_id,
        department_id,
        metadata,
        assigned_reviewer,
      } = args;

      let deptId = department_id as string | null;

      // If daily_task_id is provided, copy department_id from the task
      if (daily_task_id && !deptId) {
        const { data: task } = await client
          .from("dtn_daily_tasks")
          .select("department_id")
          .eq("id", daily_task_id as string)
          .eq("org_id", client.orgId)
          .single();
        deptId = task?.department_id ?? null;
      }

      const { data, error } = await client
        .from("dtn_approval_queue")
        .insert({
          org_id: client.orgId,
          department_id: deptId,
          title: title as string,
          content: content as string,
          item_type: item_type as string,
          submitted_by_type: (submitted_by_type as string) || "member",
          submitted_by_id: (submitted_by_id as string) || null,
          daily_task_id: (daily_task_id as string) || null,
          metadata: (metadata as Record<string, unknown>) || {},
          assigned_reviewer: (assigned_reviewer as string) || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      // If linked to a task, update task status to waiting_approval
      if (daily_task_id) {
        await client
          .from("dtn_daily_tasks")
          .update({ status: "waiting_approval" })
          .eq("id", daily_task_id as string)
          .eq("org_id", client.orgId);
      }

      return ok(JSON.stringify(data, null, 2));
    },

    async list_pending_approvals(client, args) {
      const status = (args.status as string) || "pending";
      const limit = (args.limit as number) || 20;

      let query = client
        .from("dtn_approval_queue")
        .select("*")
        .eq("org_id", client.orgId)
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (args.item_type) {
        query = query.eq("item_type", args.item_type as string);
      }
      if (args.submitted_by_type) {
        query = query.eq("submitted_by_type", args.submitted_by_type as string);
      }

      const { data, error } = await query;
      if (error) throw error;

      return ok(JSON.stringify(data, null, 2));
    },

    async review_approval(client, args) {
      const { approval_id, status, reviewer_notes } = args;

      // Use the atomic RPC function for review
      const { data, error } = await client.rpc("review_approval_item", {
        p_approval_id: approval_id as string,
        p_org_id: client.orgId,
        p_reviewer_id: "00000000-0000-0000-0000-000000000000", // MCP reviews don't have a user context
        p_status: status as string,
        p_reviewer_notes: (reviewer_notes as string) || null,
      });

      if (error) throw error;

      return ok(JSON.stringify(data, null, 2));
    },
  },
};
