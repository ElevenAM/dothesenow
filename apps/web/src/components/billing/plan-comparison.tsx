import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/stripe/config";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UpgradeButton } from "./upgrade-button";

interface PlanComparisonProps {
  currentPlan: PlanId;
}

export function PlanComparison({ currentPlan }: PlanComparisonProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Plans</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLAN_ORDER.filter((id) => id !== "enterprise").map((planId) => {
          const plan = PLANS[planId];
          const isCurrent = currentPlan === planId;

          return (
            <Card
              key={planId}
              className={
                isCurrent
                  ? "border-2 border-[var(--fgColor-accent)]"
                  : undefined
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent && <Badge variant="blue">Current</Badge>}
                </div>
                <CardDescription className="text-xs">
                  {plan.description}
                </CardDescription>
                <div className="pt-1">
                  {plan.monthlyPrice > 0 ? (
                    <>
                      <span className="text-2xl font-bold">
                        ${plan.monthlyPrice}
                      </span>
                      <span className="text-[var(--fgColor-muted)] text-sm ml-1">
                        /month
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold">Free</span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 mb-4">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-[var(--fgColor-muted)]"
                    >
                      <svg
                        className="w-4 h-4 mt-0.5 text-[var(--fgColor-success)] shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
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
                <UpgradeButton planId={planId} currentPlan={currentPlan} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Enterprise callout */}
      <Card className="mt-4">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="font-semibold">{PLANS.enterprise.name}</p>
            <p className="text-sm text-[var(--fgColor-muted)]">
              {PLANS.enterprise.description}. Unlimited AI credits, SSO, dedicated support.
            </p>
          </div>
          <a
            href="mailto:sales@dothesenow.com"
            className="text-sm font-medium text-[var(--fgColor-accent)] hover:underline whitespace-nowrap ml-4"
          >
            Contact sales
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
