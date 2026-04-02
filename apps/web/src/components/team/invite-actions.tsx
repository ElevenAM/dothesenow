"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { acceptInvite, declineInvite } from "@/lib/team/actions";

export function InviteActions({ membershipId }: { membershipId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvite(membershipId);
      if ("error" in result) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleDecline() {
    setError(null);
    startTransition(async () => {
      const result = await declineInvite(membershipId);
      if ("error" in result) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <Button onClick={handleAccept} disabled={isPending}>
          {isPending ? "Accepting..." : "Accept"}
        </Button>
        <Button variant="outline" onClick={handleDecline} disabled={isPending}>
          Decline
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
