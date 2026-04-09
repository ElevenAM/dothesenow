import { unstable_cache } from "next/cache";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getExperimentsForOrg,
  getChannelPerformance,
  getWeeklyReviews,
} from "@dothesenow/queries";
import { RealtimeListener } from "@/components/realtime-listener";
import { ChannelPerformance } from "@/components/results/channel-performance";
import { ExperimentTracker } from "@/components/results/experiment-tracker";
import { WeeklyRetrospective } from "@/components/results/weekly-retrospective";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendingUp } from "lucide-react";

const getCachedResultsData = unstable_cache(
  async (orgId: string) => {
    const admin = createAdminClient();
    const ctx = { client: admin, orgId };
    const [experiments, channelPerformance, retrospectives] = await Promise.all([
      getExperimentsForOrg(ctx),
      getChannelPerformance(ctx),
      getWeeklyReviews(ctx, 8),
    ]);
    return { experiments, channelPerformance, retrospectives };
  },
  ["results"],
  { revalidate: 60, tags: ["results"] },
);

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const { membership } = await getAuthenticatedMembership();

  const { experiments, channelPerformance, retrospectives } =
    await getCachedResultsData(membership.orgId);

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
