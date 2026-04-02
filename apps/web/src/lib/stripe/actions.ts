"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe/client";
import { PLANS, type PlanId } from "@/lib/stripe/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Create a Stripe Checkout Session and redirect the user to Stripe.
 * Only org owners and admins can initiate checkout.
 */
export async function createCheckoutSession(planId: PlanId) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const plan = PLANS[planId];
  if (!plan.priceId) {
    throw new Error("Cannot subscribe to the free plan via checkout");
  }

  // Get user's org membership and verify role
  const { data: membership } = await supabase
    .from("dtn_memberships")
    .select(
      "org_id, role, dtn_organizations(id, name, stripe_customer_id, plan)"
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) {
    throw new Error("No active organization membership");
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new Error("Only owners and admins can manage billing");
  }

  const org = membership.dtn_organizations as unknown as {
    id: string;
    name: string;
    stripe_customer_id: string | null;
    plan: string;
  };

  // Get or create Stripe customer
  let customerId = org.stripe_customer_id;

  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user.email,
      metadata: { org_id: org.id, org_name: org.name },
    });
    customerId = customer.id;

    // Save customer ID to org (use admin-level update via RLS service_role
    // but the authenticated user owns this org so the update should work)
    await supabase
      .from("dtn_organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", org.id);
  }

  // Determine the return URL from the request origin
  const headersList = await headers();
  const origin = headersList.get("origin") || "http://localhost:3000";

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${origin}/settings/billing?success=true`,
    cancel_url: `${origin}/settings/billing?canceled=true`,
    subscription_data: {
      metadata: { org_id: org.id },
    },
    metadata: { org_id: org.id },
  });

  if (!session.url) {
    throw new Error("Failed to create checkout session");
  }

  redirect(session.url);
}

/**
 * Create a Stripe Customer Portal session and redirect the user.
 * Allows managing payment methods, invoices, and cancellation.
 */
export async function createPortalSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  // Get user's org and verify they have a Stripe customer
  const { data: membership } = await supabase
    .from("dtn_memberships")
    .select("org_id, role, dtn_organizations(id, stripe_customer_id)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) {
    throw new Error("No active organization membership");
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new Error("Only owners and admins can manage billing");
  }

  const org = membership.dtn_organizations as unknown as {
    id: string;
    stripe_customer_id: string | null;
  };

  if (!org.stripe_customer_id) {
    throw new Error("No billing account found. Subscribe to a plan first.");
  }

  const headersList = await headers();
  const origin = headersList.get("origin") || "http://localhost:3000";

  const session = await getStripe().billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${origin}/settings/billing`,
  });

  redirect(session.url);
}
