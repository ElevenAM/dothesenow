import type { ToolModule } from "./types.js";
import { ok } from "./types.js";

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
        "Update a daily task. Auto-sets completed_at when status changes to 'completed'.",
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
        "Copy incomplete tasks (pending/in_progress) from a given date to today. Marks originals as 'carried_over'. Idempotent — already carried-over tasks are skipped.",
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
  ],

  handlers: {
    async get_daily_tasks(client, args) {
      const date = (args.date as string) || todayString();

      let query = client
        .from("dtn_daily_tasks")
        .select("*")
        .eq("org_id", client.orgId)
        .eq("scheduled_date", date);

      if (args.executor_type)
        query = query.eq("executor_type", args.executor_type);
      if (args.status) query = query.eq("status", args.status);
      if (args.assigned_to)
        query = query.eq("assigned_to", args.assigned_to);
      if (args.priority) query = query.eq("priority", args.priority);

      const { data, error } = await query.order("created_at", {
        ascending: true,
      });
      if (error) throw error;
      return ok(JSON.stringify(data, null, 2));
    },

    async create_daily_task(client, args) {
      const {
        org_id: _,
        ...taskData
      } = args;

      const { data, error } = await client
        .from("dtn_daily_tasks")
        .insert({
          ...taskData,
          org_id: client.orgId,
          scheduled_date:
            (taskData.scheduled_date as string) || todayString(),
          generated_by: "claude",
        })
        .select()
        .single();
      if (error) throw error;
      return ok(`Task created: ${JSON.stringify(data, null, 2)}`);
    },

    async update_daily_task(client, args) {
      const { org_id: _, task_id, ...updates } = args;

      const updatePayload: Record<string, unknown> = { ...updates };
      if (updates.status === "completed") {
        updatePayload.completed_at = new Date().toISOString();
      }

      const { data, error } = await client
        .from("dtn_daily_tasks")
        .update(updatePayload)
        .eq("id", task_id as string)
        .eq("org_id", client.orgId)
        .select()
        .single();
      if (error) throw error;
      return ok(`Task updated: ${JSON.stringify(data, null, 2)}`);
    },

    async generate_daily_tasks(client, args) {
      const targetDate = (args.date as string) || todayString();
      const yesterday = yesterdayString();

      // Fetch active strategy docs
      const { data: strategies, error: stratErr } = await client
        .from("mktg_strategy_docs")
        .select("doc_type, title, content")
        .eq("org_id", client.orgId)
        .eq("is_active", true);
      if (stratErr) throw stratErr;

      // Fetch yesterday's tasks with outcomes
      const { data: yesterdayTasks, error: taskErr } = await client
        .from("dtn_daily_tasks")
        .select("*")
        .eq("org_id", client.orgId)
        .eq("scheduled_date", yesterday);
      if (taskErr) throw taskErr;

      const tasks = yesterdayTasks ?? [];
      const result = {
        targetDate,
        strategies: strategies ?? [],
        yesterdayTasks: {
          completed: tasks.filter(
            (t: Record<string, unknown>) => t.status === "completed",
          ),
          failed: tasks.filter(
            (t: Record<string, unknown>) => t.status === "failed",
          ),
          skipped: tasks.filter(
            (t: Record<string, unknown>) => t.status === "skipped",
          ),
          carriedOver: tasks.filter(
            (t: Record<string, unknown>) =>
              t.status === "pending" || t.status === "in_progress",
          ),
        },
        suggestedFocus: [] as string[],
      };

      // Auto-derive suggested focus areas
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
      const fromDate = (args.from_date as string) || yesterdayString();
      const today = todayString();

      // Atomic: mark originals as carried_over and return them
      const { data: marked, error: markError } = await client
        .from("dtn_daily_tasks")
        .update({ status: "carried_over" })
        .eq("org_id", client.orgId)
        .eq("scheduled_date", fromDate)
        .in("status", ["pending", "in_progress"])
        .select();
      if (markError) throw markError;

      if (!marked || marked.length === 0) {
        return ok("No incomplete tasks to carry over.");
      }

      // Create copies for today
      const copies = marked.map((task: Record<string, unknown>) => ({
        org_id: client.orgId,
        department_id: task.department_id,
        created_by: task.created_by,
        assigned_to: task.assigned_to,
        title: task.title,
        description: task.description,
        task_type: task.task_type,
        priority: task.priority,
        executor_type: task.executor_type,
        executor_config: task.executor_config,
        mktg_task_id: task.mktg_task_id,
        status: "pending",
        scheduled_date: today,
        source_strategy: task.source_strategy,
        campaign_id: task.campaign_id,
        contact_id: task.contact_id,
        generated_by: task.generated_by,
        generation_context: task.generation_context,
      }));

      const { error: insertError } = await client
        .from("dtn_daily_tasks")
        .insert(copies);
      if (insertError) throw insertError;

      return ok(
        `Carried over ${marked.length} task(s) from ${fromDate} to ${today}.`,
      );
    },
  },
};
