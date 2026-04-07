"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { switchOrg } from "@/lib/org/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrgSwitcherProps {
  currentOrgId: string;
  currentOrgName: string;
  allOrgs: Array<{ id: string; name: string; slug: string }>;
  dept: string;
}

export function OrgSwitcher({
  currentOrgId,
  currentOrgName,
  allOrgs,
  dept,
}: OrgSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSwitch(orgId: string) {
    if (orgId === currentOrgId) return;
    startTransition(async () => {
      await switchOrg(orgId);
      router.refresh();
    });
  }

  // Single org — no switcher needed
  if (allOrgs.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-blue)] text-sm font-bold text-white">
          {currentOrgName.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{currentOrgName}</span>
          <span className="text-xs text-muted-foreground capitalize">{dept}</span>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2 px-4 py-4 hover:bg-sidebar-accent transition-colors"
        disabled={isPending}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-blue)] text-sm font-bold text-white">
          {currentOrgName.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-1 flex-col text-left">
          <span className="text-sm font-semibold">{currentOrgName}</span>
          <span className="text-xs text-muted-foreground capitalize">{dept}</span>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {allOrgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSwitch(org.id)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-[var(--accent-blue)] text-xs font-bold text-white">
                {org.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm">{org.name}</span>
            </div>
            {org.id === currentOrgId && (
              <Check className="h-4 w-4 text-[var(--accent-blue)]" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
