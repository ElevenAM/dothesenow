"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cancelInvite } from "@/lib/team/actions";

export function CancelInviteButton({ membershipId }: { membershipId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelInvite(membershipId);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCancel}
        disabled={isPending}
      >
        <X className="h-4 w-4" />
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
