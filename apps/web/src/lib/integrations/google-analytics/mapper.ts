import type { CreateExternalMetricInput } from "@dothesenow/types";
import type { GAReportResponse } from "./client";

/**
 * Standard metrics to pull from GA4 daily.
 */
export const GA_DAILY_METRICS = [
  { name: "sessions" },
  { name: "screenPageViews" },
  { name: "conversions" },
  { name: "bounceRate" },
  { name: "activeUsers" },
];

/** Metric name mapping: GA4 API name → DTN metric name */
const METRIC_NAME_MAP: Record<string, string> = {
  sessions: "sessions",
  screenPageViews: "page_views",
  conversions: "conversions",
  bounceRate: "bounce_rate",
  activeUsers: "active_users",
};

/**
 * Map a GA4 report response (with date + sessionDefaultChannelGroup dimensions)
 * into CreateExternalMetricInput rows for dtn_external_metrics.
 */
export function mapGAReportToMetrics(
  report: GAReportResponse,
  metricNames: string[],
  dateRange: { startDate: string; endDate: string },
): CreateExternalMetricInput[] {
  const results: CreateExternalMetricInput[] = [];

  if (!report.rows) return results;

  for (const row of report.rows) {
    const dimValues = row.dimensionValues ?? [];
    const metricValues = row.metricValues ?? [];

    // First dimension is date (YYYYMMDD), second is channel (optional)
    const dateStr = dimValues[0]?.value ?? "";
    const channel = dimValues[1]?.value ?? "";

    // Convert YYYYMMDD to YYYY-MM-DD
    const periodDate = dateStr.length === 8
      ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
      : dateRange.startDate;

    const dimensions: Record<string, string> = {};
    if (channel) dimensions.channel = channel;

    for (let i = 0; i < metricNames.length && i < metricValues.length; i++) {
      const gaName = metricNames[i];
      const dtnName = METRIC_NAME_MAP[gaName] ?? gaName;
      const value = parseFloat(metricValues[i]?.value ?? "0");

      if (isNaN(value)) continue;

      results.push({
        source: "google_analytics",
        metric_type: "traffic",
        metric_name: dtnName,
        metric_value: value,
        dimensions,
        period_start: periodDate,
        period_end: periodDate,
      });
    }
  }

  return results;
}
