import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { planFromPriceId } from "@/lib/stripe/config";
import { PLAN_LIMITS, type PlanTier } from "@dothesenow/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Extract subscription ID from an Invoice object.
 * In Stripe SDK v21, invoice.subscription moved to invoice.parent.subscription_details.subscription.
 */
function getSubscriptionIdFromInvoice(
  invoice: Stripe.Invoice
): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

/**
 * Map Stripe subscription status to our plan_status enum.
 * Our DB allows: 'trialing', 'active', 'past_due', 'canceled'
 *
 * IMPORTANT: Unknown statuses return null (no-op) rather than defaulting to
 * "canceled" — this prevents paying customers from losing access if Stripe
 * adds a new status we haven't mapped yet.
 */
function mapStripeStatus(
  stripeStatus: string
): "trialing" | "active" | "past_due" | "canceled" | null {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "unpaid":
      return "canceled";
    case "incomplete":
    case "paused":
      return null;
    default:
      console.warn(`[stripe-webhook] Unknown subscription status: "${stripeStatus}" — skipping plan_status update`);
      return null;
  }
}

/** Get the credit allocation for a plan tier. Throws for unknown plans. */
function creditsForPlan(plan: string): number {
  const limits = PLAN_LIMITS[plan as PlanTier];
  if (limits == null) {
    throw new Error(`Unknown plan tier: "${plan}" — cannot determine credit allocation`);
  }
  return limits.credits;
}

/** Throw if a Supabase mutation returned an error. */
function assertMutation(
  result: { error: { message: string } | null },
  context: string,
): void {
  if (result.error) {
    throw new Error(`[stripe-webhook] ${context}: ${result.error.message}`);
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  // Verify webhook signature
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe webhook signature verification failed:", message);
    return new Response(`Webhook signature error: ${message}`, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotency: attempt INSERT. On duplicate, check if it's a failed event that should be retried.
  const { error: insertError } = await supabase
    .from("dtn_stripe_events")
    .insert({ id: event.id, event_type: event.type, status: "processing" });

  if (insertError) {
    if (insertError.code === "23505") {
      // Duplicate — check if the previous attempt failed and should be retried
      const { data: existing } = await supabase
        .from("dtn_stripe_events")
        .select("status")
        .eq("id", event.id)
        .single();

      if (existing?.status === "failed") {
        // Re-claim for processing
        await supabase
          .from("dtn_stripe_events")
          .update({ status: "processing" })
          .eq("id", event.id)
          .eq("status", "failed");
      } else {
        return new Response("Event already processed", { status: 200 });
      }
    } else {
      console.error("Failed to record stripe event:", insertError.message);
      return new Response("Failed to record event", { status: 500 });
    }
  }

  // Process the event — if processing fails, mark the event as failed so retries can re-process it.
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orgId = session.metadata?.org_id;

        // ── Credit pack purchase (one-time payment, not subscription) ──
        if (session.metadata?.credit_pack_id) {
          const credits = parseInt(session.metadata.credits ?? "0", 10);
          const packId = session.metadata.credit_pack_id;

          if (!orgId || credits <= 0) {
            console.error(
              "checkout.session.completed (credit pack) missing fields:",
              { orgId, packId, credits }
            );
            break;
          }

          const { error: grantError } = await supabase.rpc("grant_credits", {
            p_org_id: orgId,
            p_amount: credits,
            p_reason: `Credit pack purchase: ${packId}`,
          });

          if (grantError) {
            throw new Error(
              `Failed to grant credits for pack ${packId}: ${grantError.message}`
            );
          }

          break;
        }

        // ── Subscription checkout ──
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        if (!orgId || !subscriptionId || !customerId) {
          console.error(
            "checkout.session.completed missing required fields:",
            { orgId, subscriptionId, customerId }
          );
          break;
        }

        // Fetch the full subscription to get price details
        const subscription =
          await getStripe().subscriptions.retrieve(subscriptionId);
        const firstItem = subscription.items.data[0];
        const priceId = firstItem?.price.id;
        const plan = priceId ? planFromPriceId(priceId) : null;

        if (!plan) {
          console.error("Could not map price ID to plan:", priceId);
          break;
        }

        // Update org with Stripe IDs, plan, and initial credit allocation
        const credits = creditsForPlan(plan);
        assertMutation(
          await supabase
            .from("dtn_organizations")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              plan: plan,
              plan_status: "active",
              ai_credits_remaining: credits,
              ai_credits_reset_at: new Date().toISOString(),
            })
            .eq("id", orgId),
          "Failed to update org on checkout"
        );

        // Period dates are on the subscription item in Stripe SDK v21+
        const periodStart = firstItem?.current_period_start;
        const periodEnd = firstItem?.current_period_end;

        // Upsert subscription record
        assertMutation(
          await supabase.from("dtn_subscriptions").upsert(
            {
              org_id: orgId,
              stripe_subscription_id: subscriptionId,
              stripe_customer_id: customerId,
              plan: plan,
              status: "active",
              current_period_start: periodStart
                ? new Date(periodStart * 1000).toISOString()
                : null,
              current_period_end: periodEnd
                ? new Date(periodEnd * 1000).toISOString()
                : null,
            },
            { onConflict: "stripe_subscription_id" }
          ),
          "Failed to upsert subscription on checkout"
        );

        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;
        const firstItem = subscription.items.data[0];
        const priceId = firstItem?.price.id;
        const plan = priceId ? planFromPriceId(priceId) : null;
        const status = mapStripeStatus(subscription.status);

        // Find the org by subscription ID
        const { data: org } = await supabase
          .from("dtn_organizations")
          .select("id, plan, ai_credits_remaining")
          .eq("stripe_subscription_id", subscriptionId)
          .single();

        if (!org) {
          console.error(
            "No org found for subscription:",
            subscriptionId
          );
          break;
        }

        // Build update payload
        const orgUpdate: Record<string, unknown> = {};
        if (status) {
          orgUpdate.plan_status = status;
        }
        if (plan) {
          orgUpdate.plan = plan;

          // If plan changed (upgrade/downgrade), adjust credits proportionally:
          // add the delta between new and old plan limits to current balance.
          if (plan !== org.plan) {
            const newCredits = creditsForPlan(plan);
            const oldCredits = creditsForPlan(org.plan);

            if (newCredits === -1) {
              // Upgrading to unlimited
              orgUpdate.ai_credits_remaining = -1;
            } else if (org.ai_credits_remaining === -1) {
              // Downgrading from unlimited — start fresh at new plan limit
              orgUpdate.ai_credits_remaining = newCredits;
            } else {
              // Add the delta (can be negative for downgrades)
              const delta = newCredits - oldCredits;
              orgUpdate.ai_credits_remaining = Math.max(
                0,
                org.ai_credits_remaining + delta,
              );
            }
            orgUpdate.ai_credits_reset_at = new Date().toISOString();
          }
        }
        if (Object.keys(orgUpdate).length > 0) {
          assertMutation(
            await supabase
              .from("dtn_organizations")
              .update(orgUpdate)
              .eq("id", org.id),
            "Failed to update org on subscription change"
          );
        }

        // Period dates are on the subscription item in Stripe SDK v21+
        const periodStart = firstItem?.current_period_start;
        const periodEnd = firstItem?.current_period_end;

        // Update subscription record
        const subUpdate: Record<string, string | null> = {
          current_period_start: periodStart
            ? new Date(periodStart * 1000).toISOString()
            : null,
          current_period_end: periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null,
        };
        if (status) {
          subUpdate.status = status;
        }
        if (plan) {
          subUpdate.plan = plan;
        }
        if (subscription.cancel_at) {
          subUpdate.cancel_at = new Date(
            subscription.cancel_at * 1000
          ).toISOString();
        }
        assertMutation(
          await supabase
            .from("dtn_subscriptions")
            .update(subUpdate)
            .eq("stripe_subscription_id", subscriptionId),
          "Failed to update subscription record"
        );

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;

        // Find the org and downgrade to free
        const { data: org } = await supabase
          .from("dtn_organizations")
          .select("id")
          .eq("stripe_subscription_id", subscriptionId)
          .single();

        if (org) {
          assertMutation(
            await supabase
              .from("dtn_organizations")
              .update({
                plan: "free",
                plan_status: "canceled",
                stripe_subscription_id: null,
                ai_credits_remaining: 0,
                ai_credits_reset_at: null,
              })
              .eq("id", org.id),
            "Failed to downgrade org on subscription deletion"
          );
        }

        // Update subscription record
        assertMutation(
          await supabase
            .from("dtn_subscriptions")
            .update({ status: "canceled" })
            .eq("stripe_subscription_id", subscriptionId),
          "Failed to update subscription status to canceled"
        );

        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = getSubscriptionIdFromInvoice(invoice);

        if (subscriptionId) {
          // Set org to past_due (grace period starts)
          assertMutation(
            await supabase
              .from("dtn_organizations")
              .update({ plan_status: "past_due" })
              .eq("stripe_subscription_id", subscriptionId),
            "Failed to set org past_due on payment failure"
          );

          assertMutation(
            await supabase
              .from("dtn_subscriptions")
              .update({ status: "past_due" })
              .eq("stripe_subscription_id", subscriptionId),
            "Failed to set subscription past_due"
          );
        }

        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subscriptionId = getSubscriptionIdFromInvoice(invoice);

        if (subscriptionId) {
          // Only reset credits on recurring billing cycles, not prorations
          const billingReason = invoice.billing_reason;

          // Restore active status (payment recovered after past_due)
          assertMutation(
            await supabase
              .from("dtn_organizations")
              .update({ plan_status: "active" })
              .eq("stripe_subscription_id", subscriptionId),
            "Failed to restore org active status"
          );

          assertMutation(
            await supabase
              .from("dtn_subscriptions")
              .update({ status: "active" })
              .eq("stripe_subscription_id", subscriptionId),
            "Failed to restore subscription active status"
          );

          // Reset credits only on subscription cycle renewals.
          // Uses atomic GREATEST to preserve any purchased credit surplus.
          if (billingReason === "subscription_cycle") {
            const { data: org } = await supabase
              .from("dtn_organizations")
              .select("id, plan")
              .eq("stripe_subscription_id", subscriptionId)
              .single();

            if (org) {
              const credits = creditsForPlan(org.plan);
              const { error: resetError } = await supabase.rpc(
                "reset_credits",
                { p_org_id: org.id, p_plan_credits: credits }
              );
              if (resetError) {
                throw new Error(
                  `Failed to reset credits on billing cycle: ${resetError.message}`
                );
              }
            }
          }
        }

        break;
      }

      default:
        // Unhandled event type — log and return 200 so Stripe doesn't retry
        console.log("Unhandled Stripe event type:", event.type);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error processing Stripe event ${event.type}:`, message);

    // Mark event as failed so future retries from Stripe re-attempt processing
    await supabase
      .from("dtn_stripe_events")
      .update({ status: "failed" })
      .eq("id", event.id);

    return new Response(`Webhook processing error: ${message}`, {
      status: 500,
    });
  }

  // Mark event as successfully processed
  await supabase
    .from("dtn_stripe_events")
    .update({ status: "done" })
    .eq("id", event.id);

  return new Response("OK", { status: 200 });
}
