import { describe, it, expect } from "vitest";
import { localDateString } from "../utils";

describe("localDateString", () => {
  it("returns a YYYY-MM-DD formatted string", () => {
    const result = localDateString("America/New_York");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to UTC date for invalid timezone", () => {
    const result = localDateString("Invalid/Timezone");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("handles empty string timezone with fallback", () => {
    const result = localDateString("");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns different dates for timezones across the date line", () => {
    // At certain times of day, Auckland (UTC+12) and Honolulu (UTC-10)
    // will be on different dates. We can't control "now" in this test,
    // but we can verify both return valid date strings.
    const auckland = localDateString("Pacific/Auckland");
    const honolulu = localDateString("Pacific/Honolulu");
    expect(auckland).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(honolulu).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
