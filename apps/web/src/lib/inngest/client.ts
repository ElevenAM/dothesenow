import { Inngest } from "inngest";

/**
 * Typed event payloads for all Inngest functions in the app.
 * New events should be added here so all functions share the same schema.
 */
export type Events = {
  "task/overdue.detect": { data: Record<string, never> };
  "task/agent.execute": { data: { task_id: string; org_id: string } };
  "task/dispatch.requested": {
    data: { task_id: string; org_id: string; executor_type: string };
  };
  "task/daily.generate": { data: { org_id: string; target_date?: string } };
  "task/decompose.manual": {
    data: { org_id: string; triggered_by: string; target_date: string };
  };
  "strategy/generate": {
    data: { org_id: string; triggered_by: string; generation_id: string };
  };
  "blocker/reported": {
    data: { blocker_id: string; task_id: string; org_id: string };
  };
  "blocker/classified": {
    data: {
      blocker_id: string;
      task_id: string;
      org_id: string;
      blocker_type: string;
      route: string;
    };
  };
  "blocker/resolution.attempt": {
    data: {
      blocker_id: string;
      task_id: string;
      org_id: string;
      route: string;
      attempt: number;
    };
  };
  "blocker/escalation.check": {
    data: {
      blocker_id: string;
      task_id: string;
      org_id: string;
      current_level: number;
    };
  };
  "slack/mention.received": {
    data: {
      team_id: string;
      channel_id: string;
      user_id: string;
      text: string;
      event_id: string;
    };
  };
  "slack/command.received": {
    data: {
      team_id: string;
      dtn_user_id: string;
      command: string;
      text: string;
      response_url: string;
    };
  };
  "slack/morning-dm.send": {
    data: { org_id: string };
  };
  "task/status.changed": {
    data: {
      task_id: string;
      org_id: string;
      old_status: string;
      new_status: string;
      source: string;
      actor_id: string | null;
      changed_at: string;
    };
  };
};

export const inngest = new Inngest({ id: "dothesenow" });
