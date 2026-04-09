import { authenticateApiRequest, apiResponse, apiError } from "@/lib/api/v1/middleware";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestMetrics } from "@dothesenow/queries";
import type { CreateExternalMetricInput, Json } from "@dothesenow/types";

export const dynamic = "force-dynamic";

const MAX_BATCH_SIZE = 100;

/**
 * POST /api/v1/metrics — Ingest external metrics.
 * Auth: Bearer API key with `api_write` scope.
 * Rate limited: 100 req/min per org via Upstash.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "api_write");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  // Validate body structure
  if (!body || typeof body !== "object") {
    return apiError("bad_request", "Request body must be a JSON object", 400);
  }

  const { metrics } = body as { metrics?: unknown[] };

  if (!Array.isArray(metrics)) {
    return apiError("bad_request", "Body must contain a 'metrics' array", 400);
  }

  if (metrics.length === 0) {
    return apiError("bad_request", "Metrics array cannot be empty", 400);
  }

  if (metrics.length > MAX_BATCH_SIZE) {
    return apiError(
      "bad_request",
      `Maximum ${MAX_BATCH_SIZE} metrics per request, got ${metrics.length}`,
      400,
    );
  }

  // Validate each metric
  const validated: CreateExternalMetricInput[] = [];
  const errors: { index: number; message: string }[] = [];

  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i] as Record<string, unknown>;
    const missing: string[] = [];

    if (!m.source || typeof m.source !== "string") missing.push("source");
    if (!m.metric_name || typeof m.metric_name !== "string") missing.push("metric_name");
    if (m.metric_value == null || typeof m.metric_value !== "number") missing.push("metric_value");
    if (!m.period_start || typeof m.period_start !== "string") missing.push("period_start");
    if (!m.period_end || typeof m.period_end !== "string") missing.push("period_end");

    if (missing.length > 0) {
      errors.push({ index: i, message: `Missing required fields: ${missing.join(", ")}` });
      continue;
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.period_start as string)) {
      errors.push({ index: i, message: "period_start must be YYYY-MM-DD format" });
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.period_end as string)) {
      errors.push({ index: i, message: "period_end must be YYYY-MM-DD format" });
      continue;
    }

    validated.push({
      source: m.source as string,
      metric_type: (m.metric_type as string) ?? undefined,
      metric_name: m.metric_name as string,
      metric_value: m.metric_value as number,
      dimensions: (m.dimensions as Record<string, string>) ?? undefined,
      period_start: m.period_start as string,
      period_end: m.period_end as string,
      raw_data: m.raw_data != null ? (m.raw_data as Json) : undefined,
      experiment_id: (m.experiment_id as string) ?? undefined,
    });
  }

  if (errors.length > 0 && validated.length === 0) {
    return apiError("validation_error", `All metrics failed validation: ${errors[0].message}`, 422);
  }

  const adminClient = createAdminClient();

  try {
    const result = await ingestMetrics(adminClient, auth.orgId, validated);

    return apiResponse(
      {
        ...result,
        total_submitted: metrics.length,
        total_accepted: validated.length,
        validation_errors: errors.length > 0 ? errors : undefined,
      },
      { org_id: auth.orgId },
    );
  } catch (err) {
    console.error("[api:v1:metrics] Ingestion failed:", err);
    return apiError("internal_error", "Failed to ingest metrics", 500);
  }
}
