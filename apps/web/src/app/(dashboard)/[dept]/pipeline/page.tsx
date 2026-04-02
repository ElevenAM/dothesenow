import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PipelineFunnel } from "@/components/pipeline/pipeline-funnel";
import { EngagementCards } from "@/components/pipeline/engagement-cards";
import { BarChart3, Users } from "lucide-react";

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mktg_pipeline_summary")
    .select("*")
    .eq("org_id", membership.orgId);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-muted-foreground">
            Your sales and marketing pipeline overview.
          </p>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load pipeline data. Please try again later.
        </div>
      </div>
    );
  }

  const pipelineData = data ?? [];

  if (pipelineData.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-muted-foreground">
            Your sales and marketing pipeline overview.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium">No pipeline data yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Add contacts to see your pipeline funnel and engagement metrics.
          </p>
          <a
            href={`/${dept}/contacts`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Users className="h-4 w-4" />
            Go to Contacts
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-muted-foreground">
          Your sales and marketing pipeline overview.
        </p>
      </div>

      <EngagementCards data={pipelineData} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pipeline Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <PipelineFunnel data={pipelineData} />
        </CardContent>
      </Card>

      {/* Breakdown by contact type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">By Contact Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Stage</th>
                  <th className="pb-2 font-medium text-right">Count</th>
                  <th className="pb-2 font-medium text-right">7d Active</th>
                  <th className="pb-2 font-medium text-right">30d Active</th>
                  <th className="pb-2 font-medium text-right">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {pipelineData.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 capitalize">{row.contact_type}</td>
                    <td className="py-2 capitalize">{row.lifecycle_stage}</td>
                    <td className="py-2 text-right tabular-nums">{row.count}</td>
                    <td className="py-2 text-right tabular-nums">
                      {row.engaged_last_7d}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.engaged_last_30d}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {Math.round(Number(row.avg_lead_score))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
