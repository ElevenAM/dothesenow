"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteTeamMember } from "@/lib/team/actions";

export function InviteForm({
  memberCount,
  memberLimit,
}: {
  memberCount: number;
  memberLimit: number;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const atLimit = memberLimit > 0 && memberCount >= memberLimit;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await inviteTeamMember(email, role);
      if ("error" in result) {
        setError(result.error);
      } else {
        setSuccess(true);
        setEmail("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="colleague@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={atLimit}
          />
        </div>
        <div className="w-32 space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as "admin" | "member")}
            disabled={atLimit}
          >
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={isPending || atLimit}>
          {isPending ? "Sending..." : "Send invite"}
        </Button>
      </div>

      {atLimit && (
        <p className="text-sm text-amber-600">
          You&apos;ve reached the {memberLimit}-member limit on the free plan.{" "}
          <a href="/settings/billing" className="underline font-medium">
            Upgrade to Premium
          </a>{" "}
          for unlimited members.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && (
        <p className="text-sm text-green-600">
          Invite sent! They&apos;ll see it when they log in.
        </p>
      )}
    </form>
  );
}
