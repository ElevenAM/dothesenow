/**
 * Map a task type to the strategy doc types relevant for Claude's system prompt.
 * Shared between the Inngest agent-executor and the legacy /api/executors/claude route.
 */
export function relevantDocTypes(taskType: string): string[] {
  switch (taskType) {
    case "create":
      return ["brand_voice", "content_calendar", "personas", "master_strategy"];
    case "outreach":
      return ["value_props", "personas", "positioning", "master_strategy"];
    case "analysis":
      return ["competitive_analysis", "master_strategy", "positioning"];
    default:
      return ["master_strategy", "brand_voice"];
  }
}

/**
 * Get the current hour (0–23) in a given IANA timezone.
 * Returns null if the timezone string is invalid.
 */
export function currentHourInTimezone(timezone: string): number | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === "hour");
    if (!hourPart) return null;
    // Intl returns "24" for midnight in hour12:false — normalize to 0
    const hour = parseInt(hourPart.value, 10);
    return hour === 24 ? 0 : hour;
  } catch {
    return null;
  }
}

/**
 * Get the current date as YYYY-MM-DD in a given IANA timezone.
 * Important for cron functions: at 5pm Pacific the UTC date may be the next day.
 */
export function localDateString(timezone: string): string {
  const tz = timezone || "America/New_York";
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // en-CA locale formats as YYYY-MM-DD
    return formatter.format(new Date());
  } catch {
    // Invalid timezone — fall back to UTC
    return new Date().toISOString().split("T")[0];
  }
}

/**
 * Filter orgs to only those where the current time matches a target local hour.
 * Used by cron functions to fan out by timezone (e.g., process orgs at their local 9am).
 */
export function filterOrgsByLocalHour(
  orgs: { id: string; timezone: string | null }[],
  targetHour: number,
): { id: string; timezone: string | null }[] {
  return orgs.filter((org) => {
    const tz = org.timezone ?? "America/New_York";
    const hour = currentHourInTimezone(tz);
    return hour === targetHour;
  });
}