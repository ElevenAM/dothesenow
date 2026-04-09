import { overdueTaskDetection } from "./overdue-tasks";
import { agentExecutor } from "./agent-executor";
import { dailyTaskGeneration } from "./daily-task-generation";
import { strategyGeneration } from "./strategy-generation";
import { taskDecomposition } from "./task-decomposition";
import { executorDispatch } from "./executor-dispatch";
import {
  blockerClassification,
  blockerResolver,
  blockerEscalation,
} from "./blocker-resolution";
import {
  slackMentionHandler,
  slackCommandHandler,
} from "./slack-event-handler";
import {
  slackMorningDMCron,
  slackMorningDMHandler,
} from "./slack-morning-dm";
import { slackEodSummary } from "./slack-eod-summary";
import { slackThreadSync } from "./slack-thread-sync";
import {
  weeklyRetrospectiveCron,
  weeklyRetrospectiveHandler,
} from "./weekly-retrospective";
import {
  strategyRefinementCron,
  strategyRefinement,
} from "./strategy-refinement";
import { contactCsvImport } from "./contact-csv-import";
import { hubspotInitialSync } from "./hubspot-initial-sync";
import {
  hubspotIncrementalSyncCron,
  hubspotIncrementalSyncHandler,
} from "./hubspot-incremental-sync";
import { hubspotOutboundSync } from "./hubspot-outbound-sync";
import { hubspotWebhookHandler } from "./hubspot-webhook-handler";
import {
  googleAnalyticsSyncCron,
  googleAnalyticsSyncHandler,
} from "./google-analytics-sync";
import {
  metricsWeeklyAggregatorCron,
  metricsWeeklyAggregatorHandler,
} from "./metrics-weekly-aggregator";
import { webhookDelivery } from "./webhook-delivery";
import { dailyMaintenanceCleanup } from "./daily-maintenance-cleanup";

/**
 * All Inngest functions registered with the app.
 * Auto-discovery pattern: add new function imports here and they'll
 * be automatically registered via the /api/inngest route.
 */
export const functions = [
  overdueTaskDetection,
  agentExecutor,
  dailyTaskGeneration,
  strategyGeneration,
  taskDecomposition,
  executorDispatch,
  blockerClassification,
  blockerResolver,
  blockerEscalation,
  slackMentionHandler,
  slackCommandHandler,
  slackMorningDMCron,
  slackMorningDMHandler,
  slackEodSummary,
  slackThreadSync,
  weeklyRetrospectiveCron,
  weeklyRetrospectiveHandler,
  strategyRefinementCron,
  strategyRefinement,
  contactCsvImport,
  hubspotInitialSync,
  hubspotIncrementalSyncCron,
  hubspotIncrementalSyncHandler,
  hubspotOutboundSync,
  hubspotWebhookHandler,
  googleAnalyticsSyncCron,
  googleAnalyticsSyncHandler,
  metricsWeeklyAggregatorCron,
  metricsWeeklyAggregatorHandler,
  webhookDelivery,
  dailyMaintenanceCleanup,
];
