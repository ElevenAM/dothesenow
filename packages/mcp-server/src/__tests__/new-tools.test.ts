/**
 * Tests for new MCP tools: report_task_result, get_task_context, update_outreach.
 *
 * These tests require a running Supabase instance.
 * Setup: same as tenant-isolation.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { OrgScopedClient } from "../lib/supabase.js";
import { dailyTasks } from "../tools/daily-tasks.js";
import { crm } from "../tools/crm.js";

const ORG_ID = "00000000-cccc-0000-0000-000000000003";

let supabase: SupabaseClient;
let client: OrgScopedClient;

beforeAll(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }

  supabase = createClient(url, key);
  client = new OrgScopedClient(supabase, ORG_ID);

  await supabase.from("dtn_organizations").upsert([
    {
      id: ORG_ID,
      name: "_test_org_new_tools",
      slug: "_test_org_new_tools",
      plan: "free",
      plan_status: "active",
      ai_credits_remaining: 100,
    },
  ]);
});

afterAll(async () => {
  const tables = [
    "dtn_task_events",
    "dtn_approval_queue",
    "dtn_daily_tasks",
    "mktg_outreach_log",
    "mktg_contacts",
    "mktg_strategy_docs",
    "mktg_campaigns",
  ];

  for (const table of tables) {
    await supabase.from(table).delete().eq("org_id", ORG_ID);
  }

  await supabase.from("dtn_organizations").delete().eq("id", ORG_ID);
});

// ─── Helpers ────────────────────────────────────────────────────

function parseResult(result: { content: { text: string }[] }, prefix: string) {
  return JSON.parse(result.content[0].text.replace(prefix, ""));
}

async function createTestTask(title: string, overrides: Record<string, unknown> = {}) {
  const result = await dailyTasks.handlers.create_daily_task(client, {
    title,
    ...overrides,
  });
  return parseResult(result, "Task created: ");
}

async function createTestContact(firstName: string, overrides: Record<string, unknown> = {}) {
  const result = await crm.handlers.add_contact(client, {
    first_name: firstName,
    ...overrides,
  });
  return parseResult(result, "Contact created: ");
}

// ─── report_task_result ─────────────────────────────────────────

describe("report_task_result", () => {
  it("stores metrics and auto-completes task", async () => {
    const task = await createTestTask("Reddit posts test");

    // Move to in_progress first (required by state machine)
    await dailyTasks.handlers.update_daily_task(client, {
      task_id: task.id,
      status: "in_progress",
    });

    const result = await dailyTasks.handlers.report_task_result(client, {
      task_id: task.id,
      metrics: { upvotes: 15, comments: 3, posts_made: 3 },
      notes: "Posts resonated with therapist audience",
    });

    expect(result.isError).toBeFalsy();
    const updated = parseResult(result, "Task result recorded: ");
    expect(updated.result_metrics).toEqual({
      upvotes: 15,
      comments: 3,
      posts_made: 3,
    });
    expect(updated.outcome_notes).toBe("Posts resonated with therapist audience");
    expect(updated.status).toBe("completed");
  });

  it("stores metrics on already-completed task without error", async () => {
    const task = await createTestTask("Already done task");

    // Move through state machine: pending → in_progress → completed
    await dailyTasks.handlers.update_daily_task(client, {
      task_id: task.id,
      status: "in_progress",
    });
    await dailyTasks.handlers.update_daily_task(client, {
      task_id: task.id,
      status: "completed",
    });

    // Report results on completed task — should store metrics without error
    const result = await dailyTasks.handlers.report_task_result(client, {
      task_id: task.id,
      metrics: { views: 100 },
    });

    expect(result.isError).toBeFalsy();
    const updated = parseResult(result, "Task result recorded: ");
    expect(updated.result_metrics).toEqual({ views: 100 });
    expect(updated.status).toBe("completed");
  });

  it("fails for non-existent task", async () => {
    try {
      await dailyTasks.handlers.report_task_result(client, {
        task_id: "00000000-0000-0000-0000-000000000000",
        metrics: { test: 1 },
      });
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeDefined();
    }
  });
});

// ─── get_task_context ───────────────────────────────────────────

describe("get_task_context", () => {
  it("returns task with linked entities", async () => {
    // Create a contact
    const contact = await createTestContact("Jane", {
      last_name: "Context",
      email: "jane@context.test",
    });

    // Create a strategy doc
    await supabase.from("mktg_strategy_docs").insert({
      org_id: ORG_ID,
      doc_type: "brand_voice",
      title: "Test Brand Voice",
      content: "Be warm and professional",
      is_active: true,
    });

    // Create a task linked to the contact with source_strategy
    const task = await createTestTask("Follow up with Jane", {
      contact_id: contact.id,
      source_strategy: "brand_voice",
      task_type: "outreach",
    });

    // Log some outreach for the contact
    await crm.handlers.log_outreach(client, {
      contact_id: contact.id,
      channel: "email",
      content: "Initial outreach about partnership",
      status: "sent",
    });

    const result = await dailyTasks.handlers.get_task_context(client, {
      task_id: task.id,
    });

    expect(result.isError).toBeFalsy();
    const context = JSON.parse(result.content[0].text);

    expect(context.task.id).toBe(task.id);
    expect(context.task.title).toBe("Follow up with Jane");

    // Strategy doc should be present
    expect(context.strategy_doc).not.toBeNull();
    expect(context.strategy_doc.title).toBe("Test Brand Voice");

    // Contact should be present
    expect(context.contact).not.toBeNull();
    expect(context.contact.first_name).toBe("Jane");

    // Recent outreach should be present
    expect(context.recent_outreach.length).toBeGreaterThanOrEqual(1);
    expect(context.recent_outreach[0].channel).toBe("email");
  });

  it("returns null for unlinked entities", async () => {
    const task = await createTestTask("Standalone task");

    const result = await dailyTasks.handlers.get_task_context(client, {
      task_id: task.id,
    });

    const context = JSON.parse(result.content[0].text);
    expect(context.task.id).toBe(task.id);
    expect(context.strategy_doc).toBeNull();
    expect(context.campaign).toBeNull();
    expect(context.contact).toBeNull();
    expect(context.recent_outreach).toEqual([]);
  });

  it("fails for non-existent task", async () => {
    try {
      await dailyTasks.handlers.get_task_context(client, {
        task_id: "00000000-0000-0000-0000-000000000000",
      });
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeDefined();
    }
  });
});

// ─── update_outreach ────────────────────────────────────────────

describe("update_outreach", () => {
  it("updates outreach status to replied", async () => {
    const contact = await createTestContact("Mike", {
      last_name: "Outreach",
    });

    // Log initial outreach
    const logResult = await crm.handlers.log_outreach(client, {
      contact_id: contact.id,
      channel: "email",
      content: "Partnership proposal",
      status: "sent",
    });
    const logged = parseResult(logResult, "Outreach logged: ");

    // Update to replied
    const updateResult = await crm.handlers.update_outreach(client, {
      outreach_id: logged.id,
      status: "replied",
      response_at: new Date().toISOString(),
      notes: "Positive response, wants to schedule a call",
    });

    expect(updateResult.isError).toBeFalsy();
    const updated = parseResult(updateResult, "Outreach updated: ");
    expect(updated.status).toBe("replied");
    expect(updated.notes).toBe("Positive response, wants to schedule a call");
    expect(updated.response_at).toBeTruthy();
  });

  it("fails for non-existent outreach entry", async () => {
    try {
      await crm.handlers.update_outreach(client, {
        outreach_id: "00000000-0000-0000-0000-000000000000",
        status: "replied",
      });
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeDefined();
    }
  });
});
