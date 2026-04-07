import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type PlanId, PLANS } from "@/lib/stripe/config";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { PlanComparison } from "@/components/billing/plan-comparison";
import { CreditUsage } from "@/components/billing/credit-usage";
import { getCreditUsage } from "@/lib/credits/actions";
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

  // Get credit usage
  let creditUsage: { remaining: number; total: number; resetAt: string | null } | null = null;
  try {
    const usage = await getCreditUsage();
    creditUsage = { remaining: usage.remaining, total: usage.total, resetAt: usage.resetAt };
  } catch (error) {
    console.error("[billing] getCreditUsage failed:", error);
    // Graceful degradation — credits section won't render
  }

  const currentPlan = PLANS[org.plan] || PLANS.free;
  const isOwnerOrAdmin =
    membership.role === "owner" || membership.role === "admin";

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-[var(--fgColor-muted)] mt-1">
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
            <div className="text-sm text-[var(--fgColor-muted)] space-y-1">
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
                <p className="text-[var(--fgColor-attention)]">
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
        <div className="rounded-md border border-[var(--fgColor-attention)]/20 bg-[#fff8c5] p-4">
          <p className="text-sm font-medium text-[var(--fgColor-attention)]">
            Your payment failed. Please update your payment method to avoid
            losing access to premium features.
          </p>
        </div>
      )}

      {/* Credit Usage */}
      {creditUsage && (
        <CreditUsage
          remaining={creditUsage.remaining}
          total={creditUsage.total}
          resetAt={creditUsage.resetAt}
        />
      )}

      {/* Plan Comparison */}
      {isOwnerOrAdmin && <PlanComparison currentPlan={org.plan} />}

      {/* Non-admin notice */}
      {!isOwnerOrAdmin && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-[var(--fgColor-muted)]">
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
      return <Badge variant="default">{status}</Badge>;
  }
}
