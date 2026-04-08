import { overdueTaskDetection } from "./overdue-tasks";
import { agentExecutor } from "./agent-executor";
import { dailyTaskGeneration } from "./daily-task-generation";
import { strategyGeneration } from "./strategy-generation";
import { taskDecomposition } from "./task-decomposition";
import { executorDispatch } from "./executor-dispatch";

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
];
