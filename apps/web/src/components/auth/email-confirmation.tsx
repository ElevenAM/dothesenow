"use client";

import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmailConfirmation({
  email,
  actionLabel,
  onReset,
}: {
  email: string;
  actionLabel: string;
  onReset: () => void;
}) {
  return (
    <>
      <div className="flex justify-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-[var(--label-green-bg)]">
          <Mail className="size-5 text-[var(--label-green-fg)]" />
        </div>
      </div>
      <h2 className="mt-4 text-center text-2xl font-semibold text-foreground">
        Check your email
      </h2>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        We sent a magic link to{" "}
        <strong className="text-foreground">{email}</strong>. Click it to{" "}
        {actionLabel}.
      </p>
      <Button variant="outline" className="mt-6 w-full" onClick={onReset}>
        Use a different email
      </Button>
    </>
  );
}
