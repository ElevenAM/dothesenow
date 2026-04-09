import { getRequestContext } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getDepartmentId } from "@/lib/departments";
import {
  getTasksForOrg,
  getTasksSummary,
  getMembershipsForOrg,
  getOrgIntegrations,
} from "@dothesenow/queries";
import { getExecutorAvailability } from "@/lib/daily-tasks/dispatch";
import { getAllExecutorMetadata } from "@/lib/executors/registry";
import { RealtimeListener } from "@/components/realtime-listener";
import { TasksPageClient } from "@/components/daily-tasks/tasks-page-client";
import type { TeamMember } from "@/lib/daily-tasks/actions";
import { PRIORITY_RANK } from "@/lib/daily-tasks/constants";

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ dept: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { dept } = await params;
  const resolvedSearch = await searchParams;
  const date =
    resolvedSearch.date || new Date().toISOString().split("T")[0];

  // Single auth call (cached across RSC render tree)
  const { membership, user } = await getRequestContext();
  const supabase = await createClient();
  const ctx = { client: supabase, orgId: membership.orgId };
  const departmentId = await getDepartmentId(membership.orgId, dept);

  const [tasks, summary, memberships, integrations] = await Promise.all([
    getTasksForOrg(ctx, {
      scheduled_date: date,
      department_id: departmentId ?? undefined,
    }),
    getTasksSummary(ctx, date),
    getMembershipsForOrg(ctx),
    getOrgIntegrations(ctx),
  ]);

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

  // Sort tasks by priority
  tasks.sort(
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
        tasks={tasks}
        summary={summary}
        date={date}
        dept={dept}
        members={members}
        currentUserId={user.id}
        executorAvailability={executorAvailability}
        executorTypes={executorTypes}
      />
    </RealtimeListener>
  );
}
