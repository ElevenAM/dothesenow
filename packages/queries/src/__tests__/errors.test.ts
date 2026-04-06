import { describe, it, expect } from "vitest";
import { QueryError } from "../errors.js";

describe("QueryError", () => {
  it("has correct name", () => {
    const err = new QueryError("test message", "dtn_daily_tasks", "getTasksForOrg", "org-1");
    expect(err.name).toBe("QueryError");
  });

  it("has correct message", () => {
    const err = new QueryError("something failed", "mktg_contacts", "createContact", "org-2");
    expect(err.message).toBe("something failed");
  });

  it("stores table, operation, and orgId", () => {
    const err = new QueryError("err", "dtn_approval_queue", "reviewApproval", "org-3");
    expect(err.table).toBe("dtn_approval_queue");
    expect(err.operation).toBe("reviewApproval");
    expect(err.orgId).toBe("org-3");
  });

  it("preserves cause chain", () => {
    const originalError = new Error("pg: connection refused");
    const err = new QueryError("DB error", "dtn_daily_tasks", "getTaskById", "org-1", originalError);
    expect(err.cause).toBe(originalError);
  });

  it("cause is undefined when not provided", () => {
    const err = new QueryError("err", "test", "op", "org");
    expect(err.cause).toBeUndefined();
  });

  it("is an instance of Error", () => {
    const err = new QueryError("err", "test", "op", "org");
    expect(err).toBeInstanceOf(Error);
  });
});
