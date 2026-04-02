import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import {
  getDailyTasks,
  getDailyTasksSummary,
  getTeamMembers,
  fetchExecutorAvailability,
} from "@/lib/daily-tasks/actions";
import { RealtimeListener } from "@/components/realtime-listener";
import { TasksPageClient } from "@/components/daily-tasks/tasks-page-client";

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

  const { membership, user } = await getAuthenticatedMembership();

  const [tasks, summary, members, executorAvailability] = await Promise.all([
    getDailyTasks(dept, date),
    getDailyTasksSummary(dept, date),
    getTeamMembers(),
    fetchExecutorAvailability(),
  ]);

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
      />
    </RealtimeListener>
  );
}
