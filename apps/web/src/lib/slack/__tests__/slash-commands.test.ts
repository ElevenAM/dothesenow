import { describe, it, expect } from "vitest";
import { parseSlashCommand } from "../handlers/slash-commands";

describe("parseSlashCommand", () => {
  it("parses 'tasks' command", () => {
    const result = parseSlashCommand("tasks");
    expect(result.subCommand).toBe("tasks");
    expect(result.args).toBe("");
  });

  it("parses 'complete' with task ID", () => {
    const result = parseSlashCommand("complete abc-123");
    expect(result.subCommand).toBe("complete");
    expect(result.args).toBe("abc-123");
  });

  it("parses 'create' with multi-word title", () => {
    const result = parseSlashCommand("create Write a blog post about AI");
    expect(result.subCommand).toBe("create");
    expect(result.args).toBe("Write a blog post about AI");
  });

  it("defaults to 'tasks' for empty input", () => {
    const result = parseSlashCommand("");
    expect(result.subCommand).toBe("tasks");
    expect(result.args).toBe("");
  });

  it("handles 'help' command", () => {
    const result = parseSlashCommand("help");
    expect(result.subCommand).toBe("help");
    expect(result.args).toBe("");
  });

  it("normalizes command to lowercase", () => {
    const result = parseSlashCommand("COMPLETE abc-123");
    expect(result.subCommand).toBe("complete");
    expect(result.args).toBe("abc-123");
  });

  it("trims whitespace", () => {
    const result = parseSlashCommand("  tasks  ");
    expect(result.subCommand).toBe("tasks");
    expect(result.args).toBe("");
  });
});
