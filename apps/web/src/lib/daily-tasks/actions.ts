"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { dispatchTask } from "@/lib/daily-tasks/dispatch";

export interface DailyTask {
  id: string;
  org_id: string;
  department_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  task_type: "action" | "review" | "create" | "outreach" | "analysis";
  priority: "low" | "medium" | "high" | "urgent";
  executor_type: "self" | "n8n" | "claude_api" | "freelancer";
  executor_config: Record<string, unknown>;
  mktg_task_id: string | null;
  status:
    | "pending"
    | "in_progress"
    | "waiting_approval"
    | "completed"
    | "skipped"
    | "failed"
    | "carried_over";
  scheduled_date: string;
  outcome_notes: string | null;
  completed_at: string | null;
  source_strategy: string | null;
  campaign_id: string | null;
  contact_id: string | null;
  generated_by: "user" | "claude" | "system";
  generation_context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined profile fields
  assigned_profile?: { display_name: string | null; email: string } | null;
  creator_profile?: { display_name: string | null; email: string } | null;
}

export interface DailyTasksSummary {
  executor_type: string;
  total: number;
  completed: number;
  pending: number;
  in_progress: number;
  failed: number;
}

export interface TeamMember {
  userId: string;
  displayName: string | null;
  email: string;
  role: string;
}

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

async function getDepartmentId(
  orgId: string,
  deptSlug: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dtn_departments")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", deptSlug)
    .single();
  return data?.id ?? null;
}

export async function getDailyTasks(deptSlug: string, date?: string) {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();
  const targetDate = date || todayString();

  const departmentId = await getDepartmentId(membership.orgId, deptSlug);

  let query = supabase
    .from("dtn_daily_tasks")
    .select(
      "*, assigned_profile:profiles!dtn_daily_tasks_assigned_to_fkey(display_name, email), creator_profile:profiles!dtn_daily_tasks_created_by_fkey(display_name, email)",
    )
    .eq("org_id", membership.orgId)
    .eq("scheduled_date", targetDate);

  if (departmentId) {
    query = query.eq("department_id", departmentId);
  }

  const { data, error } = await query.order("created_at", {
    ascending: true,
  });

  if (error) throw new Error(error.message);

  // Client-side priority sort (one day's tasks is a small set)
  const tasks = (data ?? []) as DailyTask[];
  tasks.sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3),
  );

  return tasks;
}

export async function getDailyTasksSummary(deptSlug: string, date?: string) {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();
  const targetDate = date || todayString();

  const { data, error } = await supabase
    .from("dtn_daily_tasks_summary")
    .select("*")
    .eq("org_id", membership.orgId)
    .eq("scheduled_date", targetDate);

  if (error) throw new Error(error.message);
  return (data ?? []) as DailyTasksSummary[];
}

export async function createDailyTask(
  deptSlug: string,
  taskData: {
    title: string;
    description?: string;
    task_type?: DailyTask["task_type"];
    priority?: DailyTask["priority"];
    executor_type?: DailyTask["executor_type"];
    executor_config?: Record<string, unknown>;
    scheduled_date?: string;
    assigned_to?: string;
    source_strategy?: string;
    campaign_id?: string;
    contact_id?: string;
  },
) {
  const { membership, user } = await getAuthenticatedMembership();
  const supabase = await createClient();
  const departmentId = await getDepartmentId(membership.orgId, deptSlug);

  const { data, error } = await supabase
    .from("dtn_daily_tasks")
    .insert({
      ...taskData,
      org_id: membership.orgId,
      department_id: departmentId,
      created_by: user.id,
      assigned_to: taskData.assigned_to || user.id,
      scheduled_date: taskData.scheduled_date || todayString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Dispatch to executor if non-self (fire-and-forget with error recovery)
  const created = data as DailyTask;
  dispatchTask(created);

  revalidatePath("/", "layout");
  return created;
}

export async function updateDailyTask(
  taskId: string,
  updates: Partial<
    Pick<
      DailyTask,
      | "title"
      | "description"
      | "task_type"
      | "priority"
      | "executor_type"
      | "executor_config"
      | "status"
      | "scheduled_date"
      | "assigned_to"
      | "outcome_notes"
      | "source_strategy"
      | "campaign_id"
      | "contact_id"
    >
  >,
) {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = { ...updates };

  // Auto-set completed_at when completing
  if (updates.status === "completed") {
    updatePayload.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("dtn_daily_tasks")
    .update(updatePayload)
    .eq("id", taskId)
    .eq("org_id", membership.orgId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return data as DailyTask;
}

export async function completeDailyTask(
  taskId: string,
  outcomeNotes?: string,
) {
  return updateDailyTask(taskId, {
    status: "completed",
    outcome_notes: outcomeNotes || undefined,
  });
}

export async function skipDailyTask(taskId: string) {
  return updateDailyTask(taskId, { status: "skipped" });
}

export async function carryOverTasks(
  deptSlug: string,
  fromDate: string,
) {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();
  const departmentId = await getDepartmentId(membership.orgId, deptSlug);
  const today = todayString();

  // Atomic: mark originals as carried_over and return them
  let markQuery = supabase
    .from("dtn_daily_tasks")
    .update({ status: "carried_over" as const })
    .eq("org_id", membership.orgId)
    .eq("scheduled_date", fromDate)
    .in("status", ["pending", "in_progress"])
    .select();

  if (departmentId) {
    markQuery = markQuery.eq("department_id", departmentId);
  }

  const { data: marked, error: markError } = await markQuery;
  if (markError) throw new Error(markError.message);

  if (!marked || marked.length === 0) {
    return { count: 0 };
  }

  // Create copies for today
  const copies = marked.map((task: Record<string, unknown>) => ({
    org_id: membership.orgId,
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

  const { error: insertError } = await supabase
    .from("dtn_daily_tasks")
    .insert(copies);
  if (insertError) throw new Error(insertError.message);

  revalidatePath("/", "layout");
  return { count: marked.length };
}

export async function getTeamMembers() {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dtn_memberships")
    .select("user_id, role, profiles(display_name, email)")
    .eq("org_id", membership.orgId)
    .eq("is_active", true)
    .not("user_id", "is", null);

  if (error) throw new Error(error.message);

  return (data ?? []).map((m) => {
    const profile = m.profiles as unknown as {
      display_name: string | null;
      email: string;
    } | null;
    return {
      userId: m.user_id as string,
      displayName: profile?.display_name ?? null,
      email: profile?.email ?? "",
      role: m.role,
    } as TeamMember;
  });
}
