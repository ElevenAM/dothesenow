import { unstable_cache } from "next/cache";
import { getRequestContext } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDepartmentId } from "@/lib/departments";
import {
  getTasksForOrg,
  getTasksSummary,
  getMembershipsForOrg,
  getOrgIntegrations,
  getStrategyDocs,
  getCreditBalance,
} from "@dothesenow/queries";
import { TASK_DECOMPOSITION_COST } from "@dothesenow/prompts";
import { getExecutorAvailability } from "@/lib/daily-tasks/dispatch";
import { getAllExecutorMetadata } from "@/lib/executors/registry";
import { RealtimeListener } from "@/components/realtime-listener";
import { TasksPageClient } from "@/components/daily-tasks/tasks-page-client";
import type { TeamMember } from "@/lib/daily-tasks/actions";
import { PRIORITY_RANK } from "@/lib/daily-tasks/constants";

const getCachedTasksData = unstable_cache(
  async (orgId: string, date: string, departmentId: string | null) => {
    const admin = createAdminClient();
    const ctx = { client: admin, orgId };
    const [tasks, summary, memberships, integrations] = await Promise.all([
      getTasksForOrg(ctx, {
        scheduled_date: date,
        department_id: departmentId ?? undefined,
      }),
      getTasksSummary(ctx, date),
      getMembershipsForOrg(ctx),
      getOrgIntegrations(ctx),
    ]);
    return { tasks, summary, memberships, integrations };
  },
  ["tasks"],
  { revalidate: 30, tags: ["tasks"] },
);

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ dept: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { dept } = await params;
  const resolvedSearch = await searchParams;

  const { membership, user, org } = await getRequestContext();

  const tz = org.timezone ?? "America/New_York";
  const date =
    resolvedSearch.date ||
    new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const departmentId = await getDepartmentId(membership.orgId, dept);

  const { tasks, summary, memberships, integrations } =
    await getCachedTasksData(membership.orgId, date, departmentId);

  // Determine auto-generation status for today's empty task list
  let autoGenStatus: "ready" | "no_strategy" | "no_credits" | null = null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  if (date === today && tasks.length === 0) {
    const adminCtx = createAdminClient();
    const ctx = { client: adminCtx, orgId: membership.orgId };
    const docs = await getStrategyDocs(ctx, {
      is_active: true,
      doc_type: "master_strategy",
    });
    if (docs.length === 0) {
      autoGenStatus = "no_strategy";
    } else {
      const { remaining } = await getCreditBalance(ctx);
      autoGenStatus =
        remaining >= TASK_DECOMPOSITION_COST ? "ready" : "no_credits";
    }
  }

  // Transform memberships → TeamMember[]
  const members: TeamMember[] = memberships
    .filter((m) => m.user_id !== null)
    .map((m) => ({
      userId: m.user_id as string,
      displayName: m.profile?.display_name ?? null,
      email: m.profile?.email ?? "",
      role: m.role,
      specialties: m.specialties ?? [],
    }));

  // Sort tasks by priority (shallow copy to avoid mutating cached array)
  const sortedTasks = [...tasks].sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3),
  );

  const executorAvailability = getExecutorAvailability(integrations);
  const executorTypes = getAllExecutorMetadata().map((m) => ({
    value: m.type,
    label: m.label,
    icon: m.icon,
  }));

  return (
    <RealtimeListener table="dtn_daily_tasks" orgId={membership.orgId}>
      <TasksPageClient
        tasks={sortedTasks}
        summary={summary}
        date={date}
        today={today}
        dept={dept}
        members={members}
        currentUserId={user.id}
        executorAvailability={executorAvailability}
        executorTypes={executorTypes}
        autoGenStatus={autoGenStatus}
      />
    </RealtimeListener>
  );
}
