"use client";

import { useTransition } from "react";
import { createPortalSession } from "@/lib/stripe/actions";
import { Button } from "@/components/ui/button";

export function ManageBillingButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          createPortalSession();
        });
      }}
    >
      {isPending ? "Redirecting..." : "Manage billing"}
    </Button>
  );
}
