"use client";

import { useTransition } from "react";
import { createCheckoutSession, createPortalSession } from "@/lib/stripe/actions";
import { Button } from "@/components/ui/button";
import { PLAN_HIERARCHY } from "@dothesenow/types";
import type { PlanId } from "@/lib/stripe/config";

interface UpgradeButtonProps {
  planId: PlanId;
  currentPlan: string;
}

export function UpgradeButton({ planId, currentPlan }: UpgradeButtonProps) {
  const [isPending, startTransition] = useTransition();

  const isCurrentPlan = currentPlan === planId;
  const currentIdx = PLAN_HIERARCHY.indexOf(currentPlan as PlanId);
  const targetIdx = PLAN_HIERARCHY.indexOf(planId);
  const isUpgrade = targetIdx > currentIdx;
  const isDowngrade = targetIdx < currentIdx;

  if (isCurrentPlan) {
    return (
      <Button variant="outline" disabled className="w-full">
        Current plan
      </Button>
    );
  }

  if (planId === "free") {
    return null;
  }

  if (planId === "enterprise") {
    return null;
  }

  // Downgrades go through the portal
  if (isDowngrade) {
    return (
      <Button
        variant="outline"
        className="w-full"
        disabled={isPending}
        onClick={() => {
          startTransition(() => {
            createPortalSession();
          });
        }}
      >
        {isPending ? "Redirecting..." : "Downgrade"}
      </Button>
    );
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
      {isPending ? "Redirecting..." : `Upgrade to ${planId.charAt(0).toUpperCase() + planId.slice(1)}`}
    </Button>
  );
}
