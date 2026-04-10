import type { ToolModule } from "./types.js";
import { ok } from "./types.js";
import { toOrgContext } from "../lib/supabase.js";
import {
  getTaskById,
  transitionTaskStatus,
  getApprovalsForOrg,
  createApproval,
  reviewApproval,
} from "@dothesenow/queries";
import { TransitionSource } from "@dothesenow/types";

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
              "social_post, blog_post (deliverable), email_draft, task_submission, strategy_change",
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
              "Filter: social_post, blog_post (deliverable), email_draft, task_submission, strategy_change",
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
          reviewer_id: {
            type: "string",
            description: "UUID of the reviewer (optional, null if no user context)",
          },
        },
        required: ["approval_id", "status"],
      },
    },
  ],

  handlers: {
    async submit_for_approval(client, args) {
      const ctx = toOrgContext(client);
      let deptId = args.department_id as string | null;

      // If daily_task_id is provided, copy department_id from the task
      if (args.daily_task_id && !deptId) {
        const task = await getTaskById(ctx, args.daily_task_id as string);
        deptId = task?.department_id ?? null;
      }

      const data = await createApproval(ctx, {
        title: args.title as string,
        content: args.content as string,
        item_type: args.item_type as string,
        submitted_by_type: (args.submitted_by_type as string) || "member",
        submitted_by_id: (args.submitted_by_id as string) || null,
        daily_task_id: (args.daily_task_id as string) || null,
        department_id: deptId,
        metadata: (args.metadata as Record<string, unknown>) || null,
        assigned_reviewer: (args.assigned_reviewer as string) || null,
      } as Parameters<typeof createApproval>[1]);

      // If linked to a task, transition to waiting_approval via state machine
      if (args.daily_task_id) {
        try {
          await transitionTaskStatus(
            ctx,
            args.daily_task_id as string,
            "waiting_approval",
            TransitionSource.Mcp,
          );
        } catch (transitionError) {
          const msg = transitionError instanceof Error ? transitionError.message : String(transitionError);
          throw new Error(
            `Approval item created (id: ${data.id}) but linked task could not transition to waiting_approval: ${msg}. The approval exists but task status is unchanged.`,
          );
        }
      }

      return ok(JSON.stringify(data, null, 2));
    },

    async list_pending_approvals(client, args) {
      const ctx = toOrgContext(client);
      const result = await getApprovalsForOrg(ctx, {
        status: (args.status as string) || "pending",
        item_type: args.item_type,
        submitted_by_type: args.submitted_by_type,
        pageSize: (args.limit as number) || 20,
      } as Parameters<typeof getApprovalsForOrg>[1]);
      return ok(JSON.stringify(result.items, null, 2));
    },

    async review_approval(client, args) {
      const ctx = toOrgContext(client);
      const data = await reviewApproval(
        ctx,
        args.approval_id as string,
        (args.reviewer_id as string) || null,
        {
          status: args.status as string,
          reviewer_notes: (args.reviewer_notes as string) || null,
        } as Parameters<typeof reviewApproval>[3],
        "mcp",
      );
      return ok(JSON.stringify(data, null, 2));
    },
  },
};
