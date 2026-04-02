/**
 * Tenant isolation tests for MCP server tools.
 *
 * These tests verify that every tool properly scopes data by org_id,
 * preventing cross-org data leakage. Requires a running Supabase instance
 * (local via `supabase start` or remote with service role key).
 *
 * Setup:
 *   - Copy .env to .env.test with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - For local: SUPABASE_URL=http://127.0.0.1:54321
 *   - Run: npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { OrgScopedClient } from "../lib/supabase.js";
import { crm } from "../tools/crm.js";
import { strategy } from "../tools/strategy.js";
import { marketplace } from "../tools/marketplace.js";
import { campaigns } from "../tools/campaigns.js";
import { dailyTasks } from "../tools/daily-tasks.js";

// Fixed test UUIDs — deterministic for cleanup
const ORG_A_ID = "00000000-aaaa-0000-0000-000000000001";
const ORG_B_ID = "00000000-bbbb-0000-0000-000000000002";

let supabase: SupabaseClient;
let clientA: OrgScopedClient;
let clientB: OrgScopedClient;

beforeAll(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. " +
        "Use .env or .env.test for local Supabase.",
    );
  }

  supabase = createClient(url, key);
  clientA = new OrgScopedClient(supabase, ORG_A_ID);
  clientB = new OrgScopedClient(supabase, ORG_B_ID);

  // Ensure test orgs exist
  await supabase.from("dtn_organizations").upsert([
    {
      id: ORG_A_ID,
      name: "_test_org_a",
      slug: "_test_org_a",
      plan: "free",
      plan_status: "active",
    },
    {
      id: ORG_B_ID,
      name: "_test_org_b",
      slug: "_test_org_b",
      plan: "free",
      plan_status: "active",
    },
  ]);
});

afterAll(async () => {
  // Clean up test data in reverse dependency order
  const tables = [
    "dtn_daily_tasks",
    "mktg_outreach_log",
    "mktg_task_messages",
    "mktg_task_submissions",
    "mktg_tasks",
    "mktg_insights",
    "mktg_competitors",
    "mktg_strategy_docs",
    "mktg_contacts",
    "mktg_campaigns",
    "mktg_weekly_reviews",
    "dtn_organizations",
  ];

  for (const table of tables) {
    await supabase
      .from(table)
      .delete()
      .in("org_id", [ORG_A_ID, ORG_B_ID]);
  }

  // Delete orgs themselves (must come after FK refs)
  await supabase
    .from("dtn_organizations")
    .delete()
    .in("id", [ORG_A_ID, ORG_B_ID]);
});

describe("CRM tenant isolation", () => {
  it("add_contact inserts with correct org_id", async () => {
    const result = await crm.handlers.add_contact(clientA, {
      first_name: "TestA",
      last_name: "Contact",
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text.replace("Contact created: ", ""));
    expect(parsed.org_id).toBe(ORG_A_ID);
  });

  it("search_contacts returns only own org data", async () => {
    // Add contact to org B
    await crm.handlers.add_contact(clientB, {
      first_name: "TestB",
      last_name: "Contact",
    });

    // Search from org A should not see org B's contacts
    const result = await crm.handlers.search_contacts(clientA, {});
    const data = JSON.parse(result.content[0].text);
    for (const contact of data) {
      expect(contact.org_id).toBe(ORG_A_ID);
    }
  });

  it("update_contact is scoped to org", async () => {
    // Create contact in org A
    const createResult = await crm.handlers.add_contact(clientA, {
      first_name: "ToUpdate",
    });
    const created = JSON.parse(
      createResult.content[0].text.replace("Contact created: ", ""),
    );

    // Attempt update from org B — should fail (no rows)
    try {
      await crm.handlers.update_contact(clientB, {
        contact_id: created.id,
        updates: { first_name: "Hacked" },
      });
      // Should throw because .single() on zero rows throws
      expect.unreachable("Should have thrown");
    } catch {
      // Expected: org B can't update org A's contact
    }
  });
});

describe("Strategy tenant isolation", () => {
  it("get_strategy_doc returns only own org docs", async () => {
    // Create strategy doc in org A
    await strategy.handlers.update_strategy_doc(clientA, {
      doc_type: "test_doc",
      title: "Org A Strategy",
      content: "Content for A",
      change_summary: "test",
    });

    // Query from org B — should find nothing
    const result = await strategy.handlers.get_strategy_doc(clientB, {
      doc_type: "test_doc",
    });
    expect(result.content[0].text).toContain("No active");
  });
});

describe("Daily tasks tenant isolation", () => {
  it("create_daily_task sets correct org_id", async () => {
    const result = await dailyTasks.handlers.create_daily_task(clientA, {
      title: "Test task A",
    });
    const parsed = JSON.parse(
      result.content[0].text.replace("Task created: ", ""),
    );
    expect(parsed.org_id).toBe(ORG_A_ID);
    expect(parsed.generated_by).toBe("claude");
  });

  it("get_daily_tasks returns only own org tasks", async () => {
    // Create task in org B
    await dailyTasks.handlers.create_daily_task(clientB, {
      title: "Test task B",
    });

    // Query from org A
    const result = await dailyTasks.handlers.get_daily_tasks(clientA, {});
    const data = JSON.parse(result.content[0].text);
    for (const task of data) {
      expect(task.org_id).toBe(ORG_A_ID);
    }
  });

  it("update_daily_task is scoped to org", async () => {
    const createResult = await dailyTasks.handlers.create_daily_task(
      clientA,
      { title: "Scoped update test" },
    );
    const created = JSON.parse(
      createResult.content[0].text.replace("Task created: ", ""),
    );

    // Attempt update from org B
    try {
      await dailyTasks.handlers.update_daily_task(clientB, {
        task_id: created.id,
        status: "completed",
      });
      expect.unreachable("Should have thrown");
    } catch {
      // Expected: org B can't update org A's task
    }
  });

  it("carry_over_tasks only affects own org", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Create pending task for yesterday in org A
    await dailyTasks.handlers.create_daily_task(clientA, {
      title: "Carry test A",
      scheduled_date: yesterdayStr,
    });

    // Carry over from org B — should carry zero
    const result = await dailyTasks.handlers.carry_over_tasks(clientB, {
      from_date: yesterdayStr,
    });
    expect(result.content[0].text).toContain("No incomplete tasks");
  });
});

describe("Marketplace tenant isolation", () => {
  it("create_task inserts with correct org_id", async () => {
    const result = await marketplace.handlers.create_task(clientA, {
      title: "Test marketplace task",
      task_type: "blog_post",
      brief: "Write about testing",
    });
    const parsed = JSON.parse(
      result.content[0].text.replace("Task created: ", ""),
    );
    expect(parsed.org_id).toBe(ORG_A_ID);
  });

  it("list_tasks returns only own org tasks", async () => {
    await marketplace.handlers.create_task(clientB, {
      title: "Org B marketplace task",
      task_type: "social_content",
      brief: "B's brief",
    });

    const result = await marketplace.handlers.list_tasks(clientA, {});
    const data = JSON.parse(result.content[0].text);
    for (const task of data) {
      expect(task.org_id).toBe(ORG_A_ID);
    }
  });
});

describe("Campaigns tenant isolation", () => {
  it("create_campaign inserts with correct org_id", async () => {
    const result = await campaigns.handlers.create_campaign(clientA, {
      name: "Test campaign",
      campaign_type: "email_sequence",
    });
    const parsed = JSON.parse(
      result.content[0].text.replace("Campaign created: ", ""),
    );
    expect(parsed.org_id).toBe(ORG_A_ID);
  });
});
