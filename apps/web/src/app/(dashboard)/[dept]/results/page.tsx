import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import {
  getResultsDashboardData,
  getWeeklyRetrospectivesList,
} from "@/lib/results/actions";
import { RealtimeListener } from "@/components/realtime-listener";
import { ChannelPerformance } from "@/components/results/channel-performance";
import { ExperimentTracker } from "@/components/results/experiment-tracker";
import { WeeklyRetrospective } from "@/components/results/weekly-retrospective";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendingUp } from "lucide-react";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const { membership } = await getAuthenticatedMembership();

  const [dashboardData, retrospectives] = await Promise.all([
    getResultsDashboardData(),
    getWeeklyRetrospectivesList(8),
  ]);

  const { experiments, channelPerformance } = dashboardData;

  const hasData =
    experiments.length > 0 ||
    channelPerformance.length > 0 ||
    retrospectives.length > 0;

  return (
    <RealtimeListener table="dtn_experiments" orgId={membership.orgId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Results & Insights</h1>
          <p className="text-muted-foreground">
            Track experiment outcomes, channel performance, and weekly
            retrospectives.
          </p>
        </div>

        {hasData ? (
          <Tabs defaultValue="channels">
            <TabsList>
              <TabsTrigger value="channels">Channel Performance</TabsTrigger>
              <TabsTrigger value="experiments">
                Experiments ({experiments.length})
              </TabsTrigger>
              <TabsTrigger value="retrospectives">Retrospectives</TabsTrigger>
            </TabsList>
            <TabsContent value="channels">
              <ChannelPerformance data={channelPerformance} />
            </TabsContent>
            <TabsContent value="experiments">
              <ExperimentTracker experiments={experiments} />
            </TabsContent>
            <TabsContent value="retrospectives">
              <WeeklyRetrospective retrospectives={retrospectives} />
            </TabsContent>
          </Tabs>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="No results yet"
            description="Results will appear here once you have strategy-linked tasks, experiments, or weekly retrospectives."
            actionLabel="Go to Tasks"
            actionHref={`/${dept}/tasks`}
          />
        )}
      </div>
    </RealtimeListener>
  );
}
