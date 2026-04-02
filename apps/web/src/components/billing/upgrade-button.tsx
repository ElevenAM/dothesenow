"use client";

import { useTransition } from "react";
import { createCheckoutSession } from "@/lib/stripe/actions";
import { Button } from "@/components/ui/button";
import type { PlanId } from "@/lib/stripe/config";

interface UpgradeButtonProps {
  planId: PlanId;
  currentPlan: string;
}

export function UpgradeButton({ planId, currentPlan }: UpgradeButtonProps) {
  const [isPending, startTransition] = useTransition();

  const isCurrentPlan = currentPlan === planId;
  const isDowngrade = currentPlan === "premium" && planId === "free";

  if (isCurrentPlan) {
    return (
      <Button variant="outline" disabled className="w-full">
        Current plan
      </Button>
    );
  }

  if (isDowngrade || planId === "free") {
    return null;
  }

  return (
    <Button
      className="w-full"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          createCheckoutSession(planId);
        });
      }}
    >
      {isPending ? "Redirecting..." : "Upgrade to Premium"}
    </Button>
  );
}
