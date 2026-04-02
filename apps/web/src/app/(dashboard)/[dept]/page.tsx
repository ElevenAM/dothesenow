import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { CheckSquare, Users, ShieldCheck, FileText } from "lucide-react";

export default async function DepartmentOverview({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const { membership } = await getAuthenticatedMembership();
  const orgId = membership.orgId;
  const supabase = await createClient();

  // Fetch summary stats
  const [tasksResult, contactsResult, approvalsResult, strategyResult] = await Promise.all([
    supabase
      .from("dtn_daily_tasks")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("scheduled_date", new Date().toISOString().split("T")[0])
      .eq("status", "pending"),
    supabase
      .from("mktg_contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "active"),
    supabase
      .from("dtn_approval_queue")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending"),
    supabase
      .from("mktg_strategy_docs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("is_active", true),
  ]);

  const stats = [
    {
      label: "Today's Tasks",
      value: tasksResult.count ?? 0,
      icon: CheckSquare,
      href: `/${dept}/tasks`,
      color: "text-blue-600",
    },
    {
      label: "Active Contacts",
      value: contactsResult.count ?? 0,
      icon: Users,
      href: `/${dept}/contacts`,
      color: "text-green-600",
    },
    {
      label: "Pending Approvals",
      value: approvalsResult.count ?? 0,
      icon: ShieldCheck,
      href: `/${dept}/approvals`,
      color: "text-amber-600",
    },
    {
      label: "Strategy Docs",
      value: strategyResult.count ?? 0,
      icon: FileText,
      href: `/${dept}/strategy`,
      color: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold capitalize">{dept}</h1>
        <p className="text-gray-500">Department overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
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
