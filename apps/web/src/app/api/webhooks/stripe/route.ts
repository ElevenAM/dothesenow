import Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { planFromPriceId } from "@/lib/stripe/config";
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
 */
function mapStripeStatus(
  stripeStatus: string
): "trialing" | "active" | "past_due" | "canceled" {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
    case "paused":
    default:
      return "canceled";
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
    event = stripe.webhooks.constructEvent(
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

  // Idempotency check: skip if event already processed
  const { data: existingEvent } = await supabase
    .from("dtn_stripe_events")
    .select("id")
    .eq("id", event.id)
    .single();

  if (existingEvent) {
    return new Response("Event already processed", { status: 200 });
  }

  // Record event before processing (crash-safe: prevents reprocessing)
  const { error: insertError } = await supabase
    .from("dtn_stripe_events")
    .insert({ id: event.id, event_type: event.type });

  if (insertError) {
    console.error("Failed to record stripe event:", insertError.message);
    return new Response("Failed to record event", { status: 500 });
  }

  // Process the event
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orgId = session.metadata?.org_id;
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
          await stripe.subscriptions.retrieve(subscriptionId);
        const firstItem = subscription.items.data[0];
        const priceId = firstItem?.price.id;
        const plan = priceId ? planFromPriceId(priceId) : null;

        if (!plan) {
          console.error("Could not map price ID to plan:", priceId);
          break;
        }

        // Update org with Stripe IDs and plan
        await supabase
          .from("dtn_organizations")
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan: plan,
            plan_status: "active",
          })
          .eq("id", orgId);

        // Period dates are on the subscription item in Stripe SDK v21+
        const periodStart = firstItem?.current_period_start;
        const periodEnd = firstItem?.current_period_end;

        // Upsert subscription record
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
          .select("id")
          .eq("stripe_subscription_id", subscriptionId)
          .single();

        if (!org) {
          console.error(
            "No org found for subscription:",
            subscriptionId
          );
          break;
        }

        // Update org plan and status
        const orgUpdate: Record<string, string> = { plan_status: status };
        if (plan) {
          orgUpdate.plan = plan;
        }
        await supabase
          .from("dtn_organizations")
          .update(orgUpdate)
          .eq("id", org.id);

        // Period dates are on the subscription item in Stripe SDK v21+
        const periodStart = firstItem?.current_period_start;
        const periodEnd = firstItem?.current_period_end;

        // Update subscription record
        const subUpdate: Record<string, string | null> = {
          status: status,
          current_period_start: periodStart
            ? new Date(periodStart * 1000).toISOString()
            : null,
          current_period_end: periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null,
        };
        if (plan) {
          subUpdate.plan = plan;
        }
        if (subscription.cancel_at) {
          subUpdate.cancel_at = new Date(
            subscription.cancel_at * 1000
          ).toISOString();
        }
        await supabase
          .from("dtn_subscriptions")
          .update(subUpdate)
          .eq("stripe_subscription_id", subscriptionId);

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
          await supabase
            .from("dtn_organizations")
            .update({
              plan: "free",
              plan_status: "canceled",
              stripe_subscription_id: null,
            })
            .eq("id", org.id);
        }

        // Update subscription record
        await supabase
          .from("dtn_subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", subscriptionId);

        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = getSubscriptionIdFromInvoice(invoice);

        if (subscriptionId) {
          // Set org to past_due (grace period starts)
          await supabase
            .from("dtn_organizations")
            .update({ plan_status: "past_due" })
            .eq("stripe_subscription_id", subscriptionId);

          await supabase
            .from("dtn_subscriptions")
            .update({ status: "past_due" })
            .eq("stripe_subscription_id", subscriptionId);
        }

        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subscriptionId = getSubscriptionIdFromInvoice(invoice);

        if (subscriptionId) {
          // Restore active status (payment recovered after past_due)
          await supabase
            .from("dtn_organizations")
            .update({ plan_status: "active" })
            .eq("stripe_subscription_id", subscriptionId);

          await supabase
            .from("dtn_subscriptions")
            .update({ status: "active" })
            .eq("stripe_subscription_id", subscriptionId);
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
    return new Response(`Webhook processing error: ${message}`, {
      status: 500,
    });
  }

  return new Response("OK", { status: 200 });
}
