import { describe, it, expect } from "vitest";
import type {
  DailyTask,
  Contact,
  StrategyDoc,
  ApprovalItem,
  Organization,
  Membership,
  Department,
  CreateTaskInput,
  CreateContactInput,
} from "../domain.js";

// These tests verify that the domain types are well-formed by creating
// conforming objects. This serves as living documentation of the expected shape.

describe("DailyTask interface", () => {
  it("accepts a valid task object", () => {
    const task: DailyTask = {
      id: "uuid-1",
      org_id: "org-1",
      department_id: null,
      created_by: "user-1",
      assigned_to: "user-1",
      title: "Write blog post",
      description: "Draft the Q1 retrospective",
      task_type: "create",
      priority: "high",
      executor_type: "self",
      executor_config: null,
      mktg_task_id: null,
      status: "pending",
      scheduled_date: "2026-04-06",
      outcome_notes: null,
      completed_at: null,
      source_strategy: null,
      campaign_id: null,
      contact_id: null,
      generated_by: "user",
      generation_context: null,
      created_at: "2026-04-06T00:00:00Z",
      updated_at: "2026-04-06T00:00:00Z",
    };
    expect(task.id).toBe("uuid-1");
    expect(task.status).toBe("pending");
  });

  it("accepts null for all nullable fields", () => {
    const task: DailyTask = {
      id: "uuid-2",
      org_id: "org-1",
      department_id: null,
      created_by: null,
      assigned_to: null,
      title: "Minimal task",
      description: null,
      task_type: "action",
      priority: "low",
      executor_type: "self",
      executor_config: null,
      mktg_task_id: null,
      status: "pending",
      scheduled_date: "2026-04-06",
      outcome_notes: null,
      completed_at: null,
      source_strategy: null,
      campaign_id: null,
      contact_id: null,
      generated_by: null,
      generation_context: null,
      created_at: null,
      updated_at: null,
    };
    expect(task.title).toBe("Minimal task");
  });
});

describe("Contact interface", () => {
  it("accepts a valid contact object", () => {
    const contact: Contact = {
      id: "uuid-c1",
      org_id: "org-1",
      owner_id: "user-1",
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      phone: null,
      company: "Acme",
      title: "CTO",
      contact_type: "prospect",
      status: "active",
      lifecycle_stage: "consideration",
      tags: ["saas", "enterprise"],
      location: "NYC",
      source: "linkedin",
      persona: "technical-buyer",
      lead_score: 85,
      last_engaged: "2026-04-01T00:00:00Z",
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    };
    expect(contact.first_name).toBe("Jane");
    expect(contact.contact_type).toBe("prospect");
  });
});

describe("StrategyDoc interface", () => {
  it("accepts a valid strategy doc", () => {
    const doc: StrategyDoc = {
      id: "uuid-s1",
      org_id: "org-1",
      doc_type: "master_strategy",
      title: "2026 Marketing Strategy",
      content: "# Strategy\n\nDetails here...",
      version: 1,
      tags: ["q1", "growth"],
      previous_version_id: null,
      change_summary: null,
      changed_by: "user-1",
      is_active: true,
      embedding: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(doc.doc_type).toBe("master_strategy");
  });
});

describe("ApprovalItem interface", () => {
  it("accepts a valid approval item", () => {
    const item: ApprovalItem = {
      id: "uuid-a1",
      org_id: "org-1",
      department_id: "dept-1",
      item_type: "blog_post",
      title: "Q1 Blog Draft",
      content: "Blog content here",
      metadata: { word_count: 500 },
      submitted_by_type: "claude_api",
      submitted_by_id: null,
      assigned_reviewer: "user-1",
      daily_task_id: "task-1",
      status: "pending",
      reviewer_notes: null,
      reviewed_at: null,
      publish_config: null,
      created_at: "2026-04-06T00:00:00Z",
      updated_at: "2026-04-06T00:00:00Z",
    };
    expect(item.status).toBe("pending");
    expect(item.submitted_by_type).toBe("claude_api");
  });
});

describe("Organization interface", () => {
  it("accepts a valid org", () => {
    const org: Organization = {
      id: "org-1",
      name: "Acme Corp",
      slug: "acme-corp",
      plan: "free",
      plan_status: "active",
      logo_url: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      settings: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(org.slug).toBe("acme-corp");
  });
});

describe("Membership interface", () => {
  it("accepts a valid membership", () => {
    const m: Membership = {
      id: "mem-1",
      org_id: "org-1",
      user_id: "user-1",
      role: "owner",
      is_active: true,
      invited_email: null,
      invited_by: null,
      invited_at: null,
      accepted_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(m.role).toBe("owner");
  });

  it("accepts a pending invite membership", () => {
    const m: Membership = {
      id: "mem-2",
      org_id: "org-1",
      user_id: null,
      role: "member",
      is_active: false,
      invited_email: "bob@example.com",
      invited_by: "user-1",
      invited_at: "2026-04-06T00:00:00Z",
      accepted_at: null,
      created_at: "2026-04-06T00:00:00Z",
    };
    expect(m.user_id).toBeNull();
    expect(m.invited_email).toBe("bob@example.com");
  });
});

describe("Department interface", () => {
  it("accepts a valid department", () => {
    const dept: Department = {
      id: "dept-1",
      org_id: "org-1",
      name: "Marketing",
      slug: "marketing",
      icon: "megaphone",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(dept.slug).toBe("marketing");
  });
});

describe("CreateTaskInput", () => {
  it("requires only title", () => {
    const input: CreateTaskInput = { title: "Test task" };
    expect(input.title).toBe("Test task");
  });

  it("accepts all optional fields", () => {
    const input: CreateTaskInput = {
      title: "Full task",
      description: "Details",
      task_type: "review",
      priority: "urgent",
      executor_type: "claude_api",
      scheduled_date: "2026-04-07",
      department_id: "dept-1",
      assigned_to: "user-2",
      source_strategy: "strategy-1",
      campaign_id: "camp-1",
      contact_id: "contact-1",
      generated_by: "system",
    };
    expect(input.executor_type).toBe("claude_api");
  });
});

describe("CreateContactInput", () => {
  it("requires only first_name", () => {
    const input: CreateContactInput = { first_name: "Alice" };
    expect(input.first_name).toBe("Alice");
  });
});
