import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTasksForOrg } from "@dothesenow/queries";
import { ChatPanel } from "@/components/chat/chat-panel";

export default async function AssistantPage() {
  const { org } = await getAuthenticatedMembership();
  const admin = createAdminClient();
  const ctx = { client: admin, orgId: org.id };

  const tz = org.timezone ?? "America/New_York";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  const tasks = await getTasksForOrg(ctx, { scheduled_date: today });
  const pendingTasks = (tasks ?? [])
    .filter((t) => t.status === "pending" || t.status === "in_progress")
    .map((t) => ({
      id: t.id,
      title: t.title,
      task_type: t.task_type,
      priority: t.priority,
      status: t.status,
    }));

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col -m-6">
      <ChatPanel pendingTasks={pendingTasks} />
    </div>
  );
}
