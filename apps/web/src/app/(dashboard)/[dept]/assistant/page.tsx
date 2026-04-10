import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTasksForOrg } from "@dothesenow/queries";
import { AssistantShell } from "@/components/chat/assistant-shell";
import type { ChatSessionSummary } from "@/lib/chat/actions";

export default async function AssistantPage() {
  const { org } = await getAuthenticatedMembership();
  const admin = createAdminClient();
  const ctx = { client: admin, orgId: org.id };

  const tz = org.timezone ?? "America/New_York";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  // Fetch tasks and sessions in parallel
  const [tasks, sessionsResult] = await Promise.all([
    getTasksForOrg(ctx, { scheduled_date: today }),
    admin
      .from("dtn_chat_sessions")
      .select("id, title, updated_at")
      .eq("org_id", org.id)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  const pendingTasks = (tasks ?? [])
    .filter((t) => t.status === "pending" || t.status === "in_progress")
    .map((t) => ({
      id: t.id,
      title: t.title,
      task_type: t.task_type,
      priority: t.priority,
      status: t.status,
    }));

  const sessions: ChatSessionSummary[] = sessionsResult.data ?? [];

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col -m-6">
      <AssistantShell
        initialSessions={sessions}
        pendingTasks={pendingTasks}
      />
    </div>
  );
}
