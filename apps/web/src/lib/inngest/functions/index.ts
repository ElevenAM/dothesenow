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
];
