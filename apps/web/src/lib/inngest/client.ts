import { Inngest } from "inngest";

/**
 * Typed event payloads for all Inngest functions in the app.
 * New events should be added here so all functions share the same schema.
 */
export type Events = {
  "task/overdue.detect": { data: Record<string, never> };
  "task/agent.execute": { data: { task_id: string; org_id: string } };
  "task/daily.generate": { data: { org_id: string; target_date?: string } };
  "task/decompose.manual": {
    data: { org_id: string; triggered_by: string; target_date: string };
  };
  "strategy/generate": {
    data: { org_id: string; triggered_by: string; generation_id: string };
  };
};

export const inngest = new Inngest({ id: "dothesenow" });
