import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PLANS, type PlanId } from "@/lib/stripe/config";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's org with billing fields
  const { data: membership } = await supabase
    .from("dtn_memberships")
    .select(
      "org_id, role, dtn_organizations(id, name, plan, plan_status, stripe_customer_id, stripe_subscription_id)"
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) {
    redirect("/onboarding");
  }

  const org = membership.dtn_organizations as unknown as {
    id: string;
    name: string;
    plan: PlanId;
    plan_status: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  };

  // Get subscription details if they exist
  let subscription: {
    current_period_end: string;
    cancel_at: string | null;
  } | null = null;

  if (org.stripe_subscription_id) {
    const { data } = await supabase
      .from("dtn_subscriptions")
      .select("current_period_end, cancel_at")
      .eq("stripe_subscription_id", org.stripe_subscription_id)
      .single();
    subscription = data;
  }

  const currentPlan = PLANS[org.plan] || PLANS.free;
  const isOwnerOrAdmin =
    membership.role === "owner" || membership.role === "admin";

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and billing details
        </p>
      </div>

      {/* Current Plan Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current plan</CardTitle>
              <CardDescription className="mt-1">
                {org.name} is on the{" "}
                <span className="font-medium text-foreground">
                  {currentPlan.name}
                </span>{" "}
                plan
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <PlanStatusBadge status={org.plan_status} />
              {isOwnerOrAdmin && org.stripe_customer_id && (
                <ManageBillingButton />
              )}
            </div>
          </div>
        </CardHeader>
        {subscription && (
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-1">
              {subscription.current_period_end && (
                <p>
                  Current period ends:{" "}
                  <span className="text-foreground">
                    {new Date(
                      subscription.current_period_end
                    ).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </p>
              )}
              {subscription.cancel_at && (
                <p className="text-[var(--label-yellow-fg)]">
                  Cancels on:{" "}
                  {new Date(subscription.cancel_at).toLocaleDateString(
                    "en-US",
                    {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    }
                  )}
                </p>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Past Due Warning */}
      {org.plan_status === "past_due" && (
        <div className="rounded-md border border-[var(--label-yellow-fg)]/20 bg-[var(--label-yellow-bg)] p-4">
          <p className="text-sm font-medium text-[var(--label-yellow-fg)]">
            Your payment failed. Please update your payment method to avoid
            losing access to premium features.
          </p>
        </div>
      )}

      {/* Plan Comparison */}
      {isOwnerOrAdmin && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]).map(
              ([planId, plan]) => (
                <Card
                  key={planId}
                  className={
                    org.plan === planId
                      ? "border-2 border-foreground"
                      : undefined
                  }
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{plan.name}</CardTitle>
                      {org.plan === planId && (
                        <Badge variant="secondary">Current</Badge>
                      )}
                    </div>
                    <CardDescription>{plan.description}</CardDescription>
                    <div className="pt-2">
                      <span className="text-3xl font-bold">
                        ${plan.monthlyPrice}
                      </span>
                      {plan.monthlyPrice > 0 && (
                        <span className="text-muted-foreground ml-1">/month</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 mb-6">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-center text-sm text-muted-foreground"
                        >
                          <svg
                            className="w-4 h-4 mr-2 text-success shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <UpgradeButton planId={planId} currentPlan={org.plan} />
                  </CardContent>
                </Card>
              )
            )}
          </div>
        </div>
      )}

      {/* Non-admin notice */}
      {!isOwnerOrAdmin && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Only organization owners and admins can manage billing. Contact
              your organization admin to change plans.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlanStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <Badge variant="green">Active</Badge>;
    case "trialing":
      return <Badge variant="blue">Trial</Badge>;
    case "past_due":
      return <Badge variant="yellow">Past due</Badge>;
    case "canceled":
      return <Badge variant="default">Canceled</Badge>;
    default:
      return null;
  }
}
