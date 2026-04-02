"use client";

import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { removeMember, updateMemberRole } from "@/lib/team/actions";

export function MemberActions({
  membershipId,
  currentRole,
  callerRole,
  isSelf,
}: {
  membershipId: string;
  currentRole: string;
  callerRole: string;
  isSelf: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Only owners can change roles; owners/admins can remove non-owners
  const canChangeRole = callerRole === "owner" && !isSelf;
  const canRemove =
    (callerRole === "owner" || callerRole === "admin") &&
    !isSelf &&
    !(callerRole === "admin" && currentRole === "owner");

  if (!canChangeRole && !canRemove) return null;

  function handleRoleChange(newRole: "admin" | "member") {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRole(membershipId, newRole);
      if ("error" in result) setError(result.error);
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeMember(membershipId);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 w-8 hover:bg-gray-100 cursor-pointer border-0 bg-transparent disabled:opacity-50" disabled={isPending}>
            <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canChangeRole && currentRole !== "admin" && (
            <DropdownMenuItem onClick={() => handleRoleChange("admin")}>
              Make admin
            </DropdownMenuItem>
          )}
          {canChangeRole && currentRole !== "member" && (
            <DropdownMenuItem onClick={() => handleRoleChange("member")}>
              Make member
            </DropdownMenuItem>
          )}
          {canChangeRole && canRemove && <DropdownMenuSeparator />}
          {canRemove && (
            <DropdownMenuItem
              onClick={handleRemove}
              className="text-red-600 focus:text-red-600"
            >
              Remove from org
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
