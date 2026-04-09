import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getIntegrationSecret,
  incrementWebhookFailureCount,
  resetWebhookFailureCount,
  deactivateWebhookSubscription,
} from "@dothesenow/queries";
import { createHmac } from "crypto";

const MAX_ATTEMPTS = 3;
const AUTO_DISABLE_THRESHOLD = 5;
const CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BACKOFF_DELAYS = [10, 30, 90]; // seconds

/**
 * Webhook delivery function.
 * HMAC-SHA256 signs the payload and POSTs to the target URL.
 * Retries up to 3 times with exponential backoff.
 * Auto-disables after 5 consecutive failures.
 */
export const webhookDelivery = inngest.createFunction(
  {
    id: "webhook-delivery",
    triggers: [{ event: "webhook/deliver" }],
    concurrency: [{ limit: 5 }],
    retries: 0, // We handle retries manually via re-emit
  },
  async ({ event, step }) => {
    const { subscription_id, org_id, event_type, payload, attempt } = event.data;
    const supabase = createAdminClient();

    // Step 1: Load subscription and check circuit breaker
    const sub = await step.run("load-subscription", async () => {
      const { data, error } = await supabase
        .from("dtn_webhook_subscriptions")
        .select("id, target_url, vault_secret_id, is_active, last_failure_at, failure_count")
        .eq("id", subscription_id)
        .single();

      if (error || !data) return null;
      return data;
    });

    if (!sub || !sub.is_active) {
      return { status: "skipped", reason: "inactive_or_missing" };
    }

    // Circuit breaker: skip if last failure was within 5 minutes
    if (sub.last_failure_at) {
      const lastFailure = new Date(sub.last_failure_at).getTime();
      if (Date.now() - lastFailure < CIRCUIT_BREAKER_WINDOW_MS && attempt === 0) {
        return { status: "skipped", reason: "circuit_breaker" };
      }
    }

    // Step 2: Sign and deliver
    const deliveryResult = await step.run("deliver", async () => {
      // Get signing secret from Vault
      const signingSecret = await getIntegrationSecret(supabase, sub.vault_secret_id);

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({
        event_type,
        timestamp,
        data: payload,
      });

      // HMAC-SHA256 signature
      const signaturePayload = `${timestamp}.${body}`;
      const signature = createHmac("sha256", signingSecret)
        .update(signaturePayload)
        .digest("hex");

      // POST to target
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

      try {
        const res = await fetch(sub.target_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-DTN-Signature": `sha256=${signature}`,
            "X-DTN-Event": event_type,
            "X-DTN-Timestamp": timestamp,
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok || (res.status >= 200 && res.status < 300)) {
          return { success: true, status: res.status };
        }

        return { success: false, status: res.status, error: `HTTP ${res.status}` };
      } catch (err) {
        clearTimeout(timeout);
        return {
          success: false,
          status: 0,
          error: err instanceof Error ? err.message : "Network error",
        };
      }
    });

    // Step 3: Handle result
    if (deliveryResult.success) {
      await step.run("on-success", async () => {
        await resetWebhookFailureCount(supabase, subscription_id);
      });
      return { status: "delivered", httpStatus: deliveryResult.status };
    }

    // Failure path
    const newFailureCount = await step.run("on-failure", async () => {
      return incrementWebhookFailureCount(supabase, subscription_id);
    });

    // Auto-disable if threshold reached
    if (newFailureCount >= AUTO_DISABLE_THRESHOLD) {
      await step.run("auto-disable", async () => {
        await deactivateWebhookSubscription(supabase, subscription_id);
        console.warn(
          `[webhook:delivery] Subscription ${subscription_id} auto-disabled after ${newFailureCount} consecutive failures`,
        );
      });
      return { status: "disabled", failures: newFailureCount };
    }

    // Retry with backoff if under max attempts
    if (attempt < MAX_ATTEMPTS - 1) {
      const delaySec = BACKOFF_DELAYS[attempt] ?? 90;
      await step.sleep(`backoff-${attempt}`, `${delaySec}s`);

      await step.sendEvent("retry", {
        name: "webhook/deliver",
        data: {
          subscription_id,
          org_id,
          event_type,
          payload,
          attempt: attempt + 1,
        },
      });

      return { status: "retrying", attempt: attempt + 1, delay: delaySec };
    }

    return { status: "failed", attempts: attempt + 1, error: "error" in deliveryResult ? deliveryResult.error : "unknown" };
  },
);
