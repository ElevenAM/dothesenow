import { describe, it, expect } from "vitest";
import {
  TaskStatus,
  Priority,
  TaskType,
  ExecutorType,
  GeneratedBy,
  ContactType,
  ContactStatus,
  LifecycleStage,
  OutreachChannel,
  OutreachDirection,
  OutreachStatus,
  DocType,
  ApprovalItemType,
  ApprovalStatus,
  SubmittedByType,
  CampaignType,
  MemberRole,
} from "../enums.js";

function enumValues(obj: Record<string, string>): string[] {
  return Object.values(obj);
}

function assertNoDuplicates(obj: Record<string, string>, name: string) {
  const values = enumValues(obj);
  const unique = new Set(values);
  expect(unique.size, `${name} has duplicate values`).toBe(values.length);
}

describe("TaskStatus", () => {
  it("has all expected values", () => {
    expect(enumValues(TaskStatus)).toEqual([
      "pending", "in_progress", "waiting_approval",
      "completed", "skipped", "failed", "carried_over",
      "blocked",
    ]);
  });
  it("has no duplicate values", () => assertNoDuplicates(TaskStatus, "TaskStatus"));
});

describe("Priority", () => {
  it("has all expected values", () => {
    expect(enumValues(Priority)).toEqual(["low", "medium", "high", "urgent"]);
  });
  it("has no duplicate values", () => assertNoDuplicates(Priority, "Priority"));
});

describe("TaskType", () => {
  it("has all expected values", () => {
    expect(enumValues(TaskType)).toEqual(["action", "review", "create", "outreach", "analysis"]);
  });
  it("has no duplicate values", () => assertNoDuplicates(TaskType, "TaskType"));
});

describe("ExecutorType", () => {
  it("has all expected values", () => {
    expect(enumValues(ExecutorType)).toEqual(["self", "n8n", "claude_api", "freelancer", "jasper_api"]);
  });
  it("has no duplicate values", () => assertNoDuplicates(ExecutorType, "ExecutorType"));
});

describe("GeneratedBy", () => {
  it("has all expected values", () => {
    expect(enumValues(GeneratedBy)).toEqual(["user", "claude", "system"]);
  });
});

describe("ContactType", () => {
  it("has all expected values", () => {
    expect(enumValues(ContactType)).toEqual([
      "lead", "prospect", "customer", "partner",
      "therapist", "influencer", "media", "other",
    ]);
  });
  it("has no duplicate values", () => assertNoDuplicates(ContactType, "ContactType"));
});

describe("ContactStatus", () => {
  it("has all expected values", () => {
    expect(enumValues(ContactStatus)).toEqual(["active", "inactive", "do_not_contact", "churned"]);
  });
});

describe("LifecycleStage", () => {
  it("has all expected values", () => {
    expect(enumValues(LifecycleStage)).toEqual([
      "awareness", "consideration", "decision", "customer", "advocate",
    ]);
  });
});

describe("OutreachChannel", () => {
  it("has all expected values", () => {
    expect(enumValues(OutreachChannel)).toEqual([
      "email", "linkedin", "reddit", "twitter", "phone",
      "in_person", "tiktok", "instagram", "other",
    ]);
  });
  it("has no duplicate values", () => assertNoDuplicates(OutreachChannel, "OutreachChannel"));
});

describe("OutreachDirection", () => {
  it("has expected values", () => {
    expect(enumValues(OutreachDirection)).toEqual(["outbound", "inbound"]);
  });
});

describe("OutreachStatus", () => {
  it("has all expected values", () => {
    expect(enumValues(OutreachStatus)).toEqual([
      "drafted", "sent", "delivered", "opened", "replied", "bounced", "no_response",
    ]);
  });
});

describe("DocType", () => {
  it("has all expected values", () => {
    expect(enumValues(DocType)).toEqual([
      "master_strategy", "competitive_analysis", "value_props",
      "brand_voice", "personas", "positioning", "content_calendar",
      "channel_strategy", "pricing_strategy", "playbook", "other",
    ]);
  });
  it("has no duplicate values", () => assertNoDuplicates(DocType, "DocType"));
});

describe("ApprovalItemType", () => {
  it("has all expected values", () => {
    expect(enumValues(ApprovalItemType)).toEqual([
      "social_post", "blog_post", "email_draft", "task_submission", "strategy_change",
      "blocker_decision",
    ]);
  });
});

describe("ApprovalStatus", () => {
  it("has all expected values", () => {
    expect(enumValues(ApprovalStatus)).toEqual(["pending", "approved", "rejected", "revision_requested"]);
  });
});

describe("SubmittedByType", () => {
  it("has all expected values", () => {
    expect(enumValues(SubmittedByType)).toEqual(["freelancer", "n8n", "claude_api", "member", "jasper_api"]);
  });
});

describe("CampaignType", () => {
  it("has all expected values", () => {
    expect(enumValues(CampaignType)).toEqual([
      "email_sequence", "content_series", "social_campaign",
      "launch", "partnership", "event", "other",
    ]);
  });
});

describe("MemberRole", () => {
  it("has all expected values", () => {
    expect(enumValues(MemberRole)).toEqual(["owner", "admin", "member"]);
  });
});

describe("all enums", () => {
  const allEnums = {
    TaskStatus, Priority, TaskType, ExecutorType, GeneratedBy,
    ContactType, ContactStatus, LifecycleStage,
    OutreachChannel, OutreachDirection, OutreachStatus,
    DocType, ApprovalItemType, ApprovalStatus, SubmittedByType,
    CampaignType, MemberRole,
  };

  it("every enum is non-empty", () => {
    for (const [name, enumObj] of Object.entries(allEnums)) {
      expect(Object.keys(enumObj).length, `${name} is empty`).toBeGreaterThan(0);
    }
  });

  it("all enum values are lowercase strings", () => {
    for (const [name, enumObj] of Object.entries(allEnums)) {
      for (const value of Object.values(enumObj)) {
        expect(value, `${name} has non-lowercase value: ${value}`).toBe(value.toLowerCase());
      }
    }
  });
});
