import { inngest } from "../client";
import { filterOrgsByLocalHour, localDateString } from "../utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgs, getTasksForOrg, getTeamWithSpecialties } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import { sendTaskBatchEmail } from "@/lib/email/send-task-batch";

/**
 * Morning email digest cron — runs every hour, finds orgs at 9am local time,
 * then fans out to the per-org handler to send daily task digest emails.
 *
 * Replaces the old event-driven emailTaskBatchNotification which fired
 * on every task/batch.created event.
 */
export const emailMorningDigestCron = inngest.createFunction(
  { id: "email-morning-digest-cron", triggers: [{ cron: "0 * * * *" }], retries: 1 },
  async ({ step }) => {
    const supabase = createAdminClient();

    const orgs = await step.run("get-orgs-for-hour", async () => {
      const allOrgs = await getActiveOrgs(supabase);
      return filterOrgsByLocalHour(allOrgs, 9);
    });

    if (orgs.length === 0) {
      console.log("[inngest:morning-digest] No orgs at 9am local — skipping");
      return { processed: 0 };
    }

    console.log(`[inngest:morning-digest] ${orgs.length} orgs at their local 9am`);

    // Per-org prerequisite check before fanning out (matches slackMorningDMCron pattern)
    const events: { name: "email/morning-digest.send"; data: { org_id: string; target_date: string } }[] = [];

    for (const org of orgs) {
      const evt = await step.run(`check-org-${org.id}`, async () => {
        const targetDate = localDateString(org.timezone ?? "America/New_York");

        // Check if tasks exist for today before fanning out
        const ctx: OrgContext = { client: supabase, orgId: org.id };
        const tasks = await getTasksForOrg(ctx, { scheduled_date: targetDate });

        if (tasks.length === 0) {
          console.log(`[inngest:morning-digest] Org ${org.id}: 0 tasks for ${targetDate} — skipping`);
          return null;
        }

        return {
          name: "email/morning-digest.send" as const,
          data: { org_id: org.id, target_date: targetDate },
        };
      });

      if (evt) events.push(evt);
    }

    if (events.length > 0) {
      await step.sendEvent("fan-out-morning-digest", events);
    }

    return { processed: events.length };
  },
);

/**
 * Morning email digest handler — triggered per org.
 * Loads today's tasks and sends a digest email to each team member.
 *
 * Idempotency: keyed on org_id + target_date to prevent duplicate emails
 * if the cron retries or fires twice on the same day.
 */
export const emailMorningDigestHandler = inngest.createFunction(
  {
    id: "email-morning-digest-handler",
    triggers: [{ event: "email/morning-digest.send" }],
    concurrency: [{ limit: 5 }],
    retries: 1,
    idempotency: "event.data.org_id + '-digest-' + event.data.target_date",
  },
  async ({ event, step }) => {
    const { org_id, target_date } = event.data;
    const supabase = createAdminClient();

    // Load tasks, team members, and org name in a single step
    const context = await step.run("load-context", async () => {
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      const tasks = await getTasksForOrg(ctx, { scheduled_date: target_date });
      const members = await getTeamWithSpecialties(ctx);

      const { data: org } = await supabase
        .from("dtn_organizations")
        .select("name")
        .eq("id", org_id)
        .single();

      return {
        orgName: org?.name ?? "Your Organization",
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          executor_type: t.executor_type,
          assigned_to: t.assigned_to,
          description: t.description,
        })),
        members: members
          .filter((m) => m.profile?.email && m.user_id)
          .map((m) => ({
            userId: m.user_id!,
            email: m.profile!.email,
            displayName:
              m.profile?.display_name ??
              m.profile!.email.split("@")[0],
          })),
      };
    });

    if (context.tasks.length === 0) {
      console.log(
        `[inngest:morning-digest] Org ${org_id}: 0 tasks — skipping`,
      );
      return { sent: 0, reason: "no_tasks" };
    }

    if (context.members.length === 0) {
      console.log(
        `[inngest:morning-digest] Org ${org_id}: no members with email — skipping`,
      );
      return { sent: 0, reason: "no_members_with_email" };
    }

    // Send an email to each member with their assigned tasks
    let sent = 0;
    for (const member of context.members) {
      const memberTasks = context.tasks.filter(
        (t) => t.assigned_to === member.userId || !t.assigned_to,
      );

      if (memberTasks.length === 0) continue;

      const result = await step.run(
        `email-${member.userId}`,
        async () => {
          return sendTaskBatchEmail({
            to: member.email,
            displayName: member.displayName,
            orgName: context.orgName,
            targetDate: target_date,
            tasks: memberTasks,
          });
        },
      );

      if (result.success) {
        sent++;
      } else {
        console.error(
          `[inngest:morning-digest] Org ${org_id}: failed to send to ${member.email} — ${result.error}`,
        );
      }
    }

    console.log(
      `[inngest:morning-digest] Org ${org_id}: tasks=${context.tasks.length} sent=${sent}/${context.members.length}`,
    );

    return { sent };
  },
);
