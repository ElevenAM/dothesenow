"use client";

import { useState, useTransition } from "react";
import { createCheckoutSession, createPortalSession } from "@/lib/stripe/actions";
import { Button } from "@/components/ui/button";
import { PLAN_HIERARCHY } from "@dothesenow/types";
import type { PlanId } from "@/lib/stripe/config";

interface UpgradeButtonProps {
  planId: PlanId;
  currentPlan: PlanId;
}

export function UpgradeButton({ planId, currentPlan }: UpgradeButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isCurrentPlan = currentPlan === planId;
  const currentIdx = PLAN_HIERARCHY.indexOf(currentPlan);
  const targetIdx = PLAN_HIERARCHY.indexOf(planId);
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

  const handleClick = (action: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  };

  // Downgrades go through the portal
  if (isDowngrade) {
    return (
      <div>
        <Button
          variant="outline"
          className="w-full"
          disabled={isPending}
          aria-busy={isPending}
          onClick={() => handleClick(() => createPortalSession())}
        >
          {isPending ? "Redirecting..." : "Downgrade"}
        </Button>
        {error && (
          <p className="text-xs text-[var(--fgColor-danger)] mt-1">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <Button
        className="w-full"
        disabled={isPending}
        aria-busy={isPending}
        onClick={() => handleClick(() => createCheckoutSession(planId))}
      >
        {isPending ? "Redirecting..." : `Upgrade to ${planId.charAt(0).toUpperCase() + planId.slice(1)}`}
      </Button>
      {error && (
        <p className="text-xs text-[var(--fgColor-danger)] mt-1">{error}</p>
      )}
    </div>
  );
}
