import type { ToolModule } from "./types.js";
import { ok } from "./types.js";
import { toOrgContext } from "../lib/supabase.js";
import {
  getTasksForOrg,
  getTaskById,
  createTaskForOrg,
  updateTaskForOrg,
  transitionTaskStatus,
  carryOverTasks,
  getStrategyDocs,
  reportTaskResult,
  getTaskContext,
} from "@dothesenow/queries";
import { TransitionSource, type TaskStatus } from "@dothesenow/types";

const ORG_ID_PROP = {
  org_id: {
    type: "string",
    description: "Organization UUID (falls back to ORG_ID env)",
  },
};

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function yesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export const dailyTasks: ToolModule = {
  definitions: [
    {
      name: "get_daily_tasks",
      description:
        "Get daily tasks for a specific date (defaults to today). Filter by executor type, status, assigned user, or priority.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format (default: today)",
          },
          executor_type: {
            type: "string",
            description: "Filter: self, n8n, claude_api, freelancer",
          },
          status: {
            type: "string",
            description:
              "Filter: pending, in_progress, waiting_approval, completed, skipped, failed, carried_over",
          },
          assigned_to: {
            type: "string",
            description: "Filter by assigned user UUID",
          },
          priority: {
            type: "string",
            description: "Filter: low, medium, high, urgent",
          },
        },
      },
    },
    {
      name: "create_daily_task",
      description:
        "Create a new daily task. Sets generated_by to 'claude' when created via MCP.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          title: { type: "string" },
          description: { type: "string" },
          task_type: {
            type: "string",
            description: "action, review, create, outreach, analysis",
          },
          priority: {
            type: "string",
            description: "low, medium, high, urgent",
          },
          executor_type: {
            type: "string",
            description: "self, n8n, claude_api, freelancer",
          },
          executor_config: {
            type: "object",
            description: "Config for non-self executors (webhook URL, etc.)",
          },
          scheduled_date: {
            type: "string",
            description: "YYYY-MM-DD (default: today)",
          },
          assigned_to: {
            type: "string",
            description: "User UUID to assign to",
          },
          department_id: {
            type: "string",
            description: "Department UUID",
          },
          source_strategy: { type: "string" },
          campaign_id: { type: "string" },
          contact_id: { type: "string" },
        },
        required: ["title"],
      },
    },
    {
      name: "update_daily_task",
      description:
        "Update a daily task. Status changes go through the state machine with audit trail. Non-status fields are updated directly.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          task_id: { type: "string", description: "UUID of the task" },
          title: { type: "string" },
          description: { type: "string" },
          task_type: { type: "string" },
          priority: { type: "string" },
          executor_type: { type: "string" },
          executor_config: { type: "object" },
          status: {
            type: "string",
            description:
              "pending, in_progress, waiting_approval, completed, skipped, failed",
          },
          assigned_to: { type: "string" },
          outcome_notes: { type: "string" },
        },
        required: ["task_id"],
      },
    },
    {
      name: "generate_daily_tasks",
      description:
        "Gather context for generating today's daily tasks: active strategy docs and yesterday's task outcomes. Returns structured data for Claude to reason over — does NOT auto-create tasks.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          date: {
            type: "string",
            description:
              "Target date for task generation in YYYY-MM-DD (default: today)",
          },
        },
      },
    },
    {
      name: "carry_over_tasks",
      description:
        "Copy incomplete tasks (pending/in_progress) from a given date to today. Marks originals as 'carried_over' with audit trail. Atomic — all or nothing.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          from_date: {
            type: "string",
            description:
              "Source date in YYYY-MM-DD (default: yesterday)",
          },
        },
      },
    },
    {
      name: "report_task_result",
      description:
        "Record structured result metrics for a completed task. Use when the user says 'I did X and got Y results' (e.g., '3 Reddit posts, 15/23/7 upvotes'). Stores metrics as structured data, auto-completes the task, and optionally logs outreach for engaged contacts.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          task_id: { type: "string", description: "UUID of the task" },
          metrics: {
            type: "object",
            description:
              "Structured metrics from the task (e.g., {upvotes: 15, comments: 3, impressions: 200}). Any key-value pairs.",
          },
          notes: {
            type: "string",
            description:
              "Qualitative notes about the result (e.g., 'Post resonated with therapist audience')",
          },
          contact_ids_engaged: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional list of contact UUIDs who were engaged as part of this task",
          },
        },
        required: ["task_id", "metrics"],
      },
    },
    {
      name: "get_task_context",
      description:
        "Get full context for a task in one call: the task itself plus its linked strategy doc, campaign, contact (with recent outreach), and similar completed tasks with their outcomes. Use this before starting work on a task to understand the full picture.",
      inputSchema: {
        type: "object",
        properties: {
          ...ORG_ID_PROP,
          task_id: { type: "string", description: "UUID of the task" },
        },
        required: ["task_id"],
      },
    },
  ],

  handlers: {
    async get_daily_tasks(client, args) {
      const ctx = toOrgContext(client);
      const date = (args.date as string) || todayString();
      const data = await getTasksForOrg(ctx, {
        scheduled_date: date,
        executor_type: args.executor_type,
        status: args.status,
        assigned_to: args.assigned_to as string | undefined,
        priority: args.priority,
      } as Parameters<typeof getTasksForOrg>[1]);
      return ok(JSON.stringify(data, null, 2));
    },

    async create_daily_task(client, args) {
      const ctx = toOrgContext(client);
      const { org_id: _, ...taskData } = args;
      const data = await createTaskForOrg(ctx, {
        ...taskData,
        scheduled_date: (taskData.scheduled_date as string) || todayString(),
        generated_by: "claude",
      } as unknown as Parameters<typeof createTaskForOrg>[1]);
      return ok(`Task created: ${JSON.stringify(data, null, 2)}`);
    },

    async update_daily_task(client, args) {
      const ctx = toOrgContext(client);
      const { org_id: _, task_id, status, ...fieldUpdates } = args;
      const taskId = task_id as string;

      // Status change goes through the state machine first
      let statusChanged = false;
      if (status) {
        await transitionTaskStatus(
          ctx,
          taskId,
          status as TaskStatus,
          TransitionSource.Mcp,
        );
        statusChanged = true;
      }

      // Apply non-status field updates if any
      const nonEmpty = Object.keys(fieldUpdates).length > 0;
      if (nonEmpty) {
        try {
          await updateTaskForOrg(ctx, taskId, fieldUpdates as Parameters<typeof updateTaskForOrg>[2]);
        } catch (fieldError) {
          if (statusChanged) {
            const msg = fieldError instanceof Error ? fieldError.message : String(fieldError);
            throw new Error(
              `Status changed to '${status}' but field updates failed: ${msg}. The task status IS updated — retry field changes only.`,
            );
          }
          throw fieldError;
        }
      }

      // Always return the full updated task for consistent response format
      const updated = await getTaskById(ctx, taskId);
      return ok(`Task updated: ${JSON.stringify(updated, null, 2)}`);
    },

    async generate_daily_tasks(client, args) {
      const ctx = toOrgContext(client);
      const targetDate = (args.date as string) || todayString();
      const yesterday = yesterdayString();

      const strategies = await getStrategyDocs(ctx, { is_active: true });
      const yesterdayTasks = await getTasksForOrg(ctx, { scheduled_date: yesterday });

      const tasks = yesterdayTasks ?? [];
      const result = {
        targetDate,
        strategies: strategies.map((s) => ({
          doc_type: s.doc_type,
          title: s.title,
          content: s.content,
        })),
        yesterdayTasks: {
          completed: tasks.filter((t) => t.status === "completed"),
          failed: tasks.filter((t) => t.status === "failed"),
          skipped: tasks.filter((t) => t.status === "skipped"),
          carriedOver: tasks.filter(
            (t) => t.status === "pending" || t.status === "in_progress",
          ),
        },
        suggestedFocus: [] as string[],
      };

      if (result.yesterdayTasks.failed.length > 0) {
        result.suggestedFocus.push(
          "Retry or reassign failed tasks from yesterday",
        );
      }
      if (result.yesterdayTasks.carriedOver.length > 0) {
        result.suggestedFocus.push(
          `${result.yesterdayTasks.carriedOver.length} tasks still incomplete from yesterday`,
        );
      }

      return ok(JSON.stringify(result, null, 2));
    },

    async carry_over_tasks(client, args) {
      const ctx = toOrgContext(client);
      const fromDate = (args.from_date as string) || yesterdayString();
      const result = await carryOverTasks(ctx, fromDate, todayString(), TransitionSource.Mcp);

      if (result.carried_count === 0) {
        return ok("No incomplete tasks to carry over.");
      }

      return ok(
        `Carried over ${result.carried_count} task(s) from ${result.from_date} to ${result.to_date}.`,
      );
    },

    async report_task_result(client, args) {
      const ctx = toOrgContext(client);
      const taskId = args.task_id as string;
      const metrics = args.metrics as Record<string, unknown>;
      const notes = args.notes as string | undefined;
      const contactIds = args.contact_ids_engaged as string[] | undefined;

      const updated = await reportTaskResult(
        ctx,
        taskId,
        { metrics, notes, contact_ids_engaged: contactIds },
        TransitionSource.Mcp,
      );

      return ok(`Task result recorded: ${JSON.stringify(updated, null, 2)}`);
    },

    async get_task_context(client, args) {
      const ctx = toOrgContext(client);
      const taskId = args.task_id as string;
      const context = await getTaskContext(ctx, taskId);
      return ok(JSON.stringify(context, null, 2));
    },
  },
};
