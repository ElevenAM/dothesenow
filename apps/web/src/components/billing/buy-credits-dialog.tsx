"use client";

import { useState, useTransition } from "react";
import { createCreditCheckoutSession } from "@/lib/stripe/actions";
import { CREDIT_PACKS } from "@dothesenow/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Zap } from "lucide-react";

export function BuyCreditsButton({
  variant = "outline",
  size = "sm",
  label = "Buy credits",
}: {
  variant?: "outline" | "default";
  size?: "sm" | "default";
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingPack, setPendingPack] = useState<string | null>(null);

  function handleBuy(packId: string) {
    setError(null);
    setPendingPack(packId);
    startTransition(async () => {
      try {
        await createCreditCheckoutSession(packId);
      } catch {
        setError("Something went wrong. Please try again.");
        setPendingPack(null);
      }
    });
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant={variant} size={size} />}>
        {label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buy AI Credits</DialogTitle>
          <DialogDescription>
            Credits are added to your organization instantly after purchase.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {CREDIT_PACKS.map((pack) => {
            const isLoading = isPending && pendingPack === pack.id;
            return (
              <div
                key={pack.id}
                className="flex items-center justify-between rounded-md border border-[var(--borderColor-default)] p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--bgColor-muted)]">
                    <Zap className="h-4 w-4 text-[var(--fgColor-accent)]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {pack.credits} credits
                      </span>
                      {pack.popular && <Badge variant="blue">Best value</Badge>}
                    </div>
                    <span className="text-xs text-[var(--fgColor-muted)]">
                      ${pack.priceUsd.toFixed(2)}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={pack.popular ? "default" : "outline"}
                  disabled={isPending}
                  aria-busy={isLoading}
                  onClick={() => handleBuy(pack.id)}
                >
                  {isLoading ? "Redirecting..." : "Buy"}
                </Button>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="text-xs text-[var(--fgColor-danger)]">{error}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
