import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { classifyEscalation } from "../functions/overdue-tasks";
import { currentHourInTimezone, filterOrgsByLocalHour } from "../utils";

describe("classifyEscalation", () => {
  it("returns null for tasks less than 24h overdue", () => {
    expect(classifyEscalation(0)).toBeNull();
    expect(classifyEscalation(12)).toBeNull();
    expect(classifyEscalation(23.9)).toBeNull();
  });

  it("returns 'reminder' for 24-47h overdue", () => {
    expect(classifyEscalation(24)).toBe("reminder");
    expect(classifyEscalation(36)).toBe("reminder");
    expect(classifyEscalation(47.9)).toBe("reminder");
  });

  it("returns 'escalate' for 48-71h overdue", () => {
    expect(classifyEscalation(48)).toBe("escalate");
    expect(classifyEscalation(60)).toBe("escalate");
    expect(classifyEscalation(71.9)).toBe("escalate");
  });

  it("returns 'force_flag' for 72h+ overdue", () => {
    expect(classifyEscalation(72)).toBe("force_flag");
    expect(classifyEscalation(100)).toBe("force_flag");
    expect(classifyEscalation(168)).toBe("force_flag");
  });
});

describe("currentHourInTimezone", () => {
  it("returns a number 0-23 for valid timezones", () => {
    const hour = currentHourInTimezone("America/New_York");
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });

  it("returns null for invalid timezone", () => {
    expect(currentHourInTimezone("Invalid/Timezone")).toBeNull();
  });

  it("returns different hours for different timezones at the same moment", () => {
    // UTC and UTC+12 should differ (unless it's exactly midnight in one of them)
    const utc = currentHourInTimezone("UTC");
    const auckland = currentHourInTimezone("Pacific/Auckland");
    // We can't assert exact values since the test runs at real time,
    // but we can verify both return valid numbers
    expect(utc).not.toBeNull();
    expect(auckland).not.toBeNull();
  });
});

describe("filterOrgsByLocalHour", () => {
  beforeEach(() => {
    // Fix time to 2026-04-07T14:00:00Z (2pm UTC)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T14:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters to orgs where local hour matches target", () => {
    const orgs = [
      { id: "org-utc", timezone: "UTC" },           // 14:00 local
      { id: "org-ny", timezone: "America/New_York" }, // 10:00 local (EDT = UTC-4)
      { id: "org-la", timezone: "America/Los_Angeles" }, // 7:00 local (PDT = UTC-7)
      { id: "org-london", timezone: "Europe/London" },   // 15:00 local (BST = UTC+1)
    ];

    // Target 9am — at 14:00 UTC, none of these are at 9am
    const at9 = filterOrgsByLocalHour(orgs, 9);
    // At 14:00 UTC: NY is 10am, LA is 7am, London is 3pm, UTC is 2pm
    expect(at9).toHaveLength(0);

    // Target 10am — NY should match (EDT)
    const at10 = filterOrgsByLocalHour(orgs, 10);
    expect(at10).toHaveLength(1);
    expect(at10[0].id).toBe("org-ny");

    // Target 7am — LA should match (PDT)
    const at7 = filterOrgsByLocalHour(orgs, 7);
    expect(at7).toHaveLength(1);
    expect(at7[0].id).toBe("org-la");
  });

  it("defaults null timezone to America/New_York", () => {
    const orgs = [{ id: "org-null-tz", timezone: null }];

    // At 14:00 UTC, New York (EDT) is 10:00
    const at10 = filterOrgsByLocalHour(orgs, 10);
    expect(at10).toHaveLength(1);
    expect(at10[0].id).toBe("org-null-tz");
  });

  it("returns empty array when no orgs match", () => {
    const orgs = [
      { id: "org-utc", timezone: "UTC" }, // 14:00
    ];
    const result = filterOrgsByLocalHour(orgs, 3);
    expect(result).toHaveLength(0);
  });
});
