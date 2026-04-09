import { unstable_cache } from "next/cache";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { PluginSetupBanner } from "@/components/dashboard/plugin-setup-banner";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgApiKeys } from "@dothesenow/queries";
import { CheckSquare, Users, ShieldCheck, FileText } from "lucide-react";

const getCachedOverviewData = unstable_cache(
  async (orgId: string, today: string) => {
    const admin = createAdminClient();
    const ctx = { client: admin, orgId };

    const apiKeys = await getOrgApiKeys(ctx);

    const [tasksResult, contactsResult, approvalsResult, strategyResult] =
      await Promise.all([
        admin
          .from("dtn_daily_tasks")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("scheduled_date", today)
          .eq("status", "pending"),
        admin
          .from("mktg_contacts")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("status", "active"),
        admin
          .from("dtn_approval_queue")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("status", "pending"),
        admin
          .from("mktg_strategy_docs")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("is_active", true),
      ]);

    return {
      apiKeyCount: apiKeys.length,
      tasksCount: tasksResult.count ?? 0,
      contactsCount: contactsResult.count ?? 0,
      approvalsCount: approvalsResult.count ?? 0,
      strategyCount: strategyResult.count ?? 0,
    };
  },
  ["overview"],
  { revalidate: 30, tags: ["overview"] },
);

export default async function DepartmentOverview({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const { membership, org } = await getAuthenticatedMembership();
  const orgId = membership.orgId;
  const tz = org.timezone ?? "America/New_York";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  const data = await getCachedOverviewData(orgId, today);

  const stats = [
    {
      label: "Today's Tasks",
      value: data.tasksCount,
      icon: CheckSquare,
      href: `/${dept}/tasks`,
      color: "text-[var(--label-blue-fg)]",
    },
    {
      label: "Active Contacts",
      value: data.contactsCount,
      icon: Users,
      href: `/${dept}/contacts`,
      color: "text-[var(--label-green-fg)]",
    },
    {
      label: "Pending Approvals",
      value: data.approvalsCount,
      icon: ShieldCheck,
      href: `/${dept}/approvals`,
      color: "text-[var(--label-yellow-fg)]",
    },
    {
      label: "Strategy Docs",
      value: data.strategyCount,
      icon: FileText,
      href: `/${dept}/strategy`,
      color: "text-[var(--label-purple-fg)]",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold capitalize">{dept}</h1>
        <p className="text-muted-foreground">Department overview</p>
      </div>

      <PluginSetupBanner apiKeyCount={data.apiKeyCount} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ActivityFeed orgId={orgId} />
    </div>
  );
}
