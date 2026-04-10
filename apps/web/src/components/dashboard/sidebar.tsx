"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  Users,
  CheckSquare,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  PenLine,
  Settings,
  LogOut,
  Building2,
  Puzzle,
  ChevronsUpDown,
  Check,
  Zap,
  MessageSquare,
} from "lucide-react";
import { PLAN_LIMITS, type PlanTier } from "@dothesenow/types";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchOrg } from "@/lib/team/actions";

const navItems = [
  { href: "/assistant", label: "Assistant", icon: MessageSquare },
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/strategy", label: "Strategy", icon: FileText },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/pipeline", label: "Pipeline", icon: BarChart3 },
  { href: "/results", label: "Results", icon: TrendingUp },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/blog", label: "Blog", icon: PenLine },
];

const settingsItems = [
  { href: "/settings", label: "General", icon: Settings },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/integrations", label: "Integrations", icon: Puzzle },
  { href: "/settings/billing", label: "Billing", icon: Building2 },
];

type OrgInfo = { id: string; name: string; slug: string };

export function Sidebar({
  dept,
  orgName,
  allOrgs,
  currentOrgId,
  creditsRemaining,
  plan,
  role,
}: {
  dept: string;
  orgName: string;
  allOrgs: OrgInfo[];
  currentOrgId: string;
  creditsRemaining: number;
  plan: string;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleSwitchOrg(orgId: string) {
    if (orgId === currentOrgId) return;
    setSwitchError(null);
    try {
      await switchOrg(orgId);
      router.refresh();
    } catch {
      setSwitchError("Failed to switch organization. Please try again.");
    }
  }

  const showOrgSwitcher = allOrgs.length > 1;

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-sidebar">
      <div className="px-4 py-4">
        {showOrgSwitcher ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-1 py-1 hover:bg-sidebar-accent transition-colors cursor-pointer border-0 bg-transparent">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent-blue)] text-sm font-bold text-white">
                  {orgName.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-1 flex-col text-left min-w-0">
                  <span className="text-sm font-semibold truncate">{orgName}</span>
                  <span className="text-xs text-muted-foreground capitalize">{dept}</span>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {allOrgs.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleSwitchOrg(org.id)}
                  className="flex items-center gap-2"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--accent-blue)] text-xs font-bold text-white">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 truncate">{org.name}</span>
                  {org.id === currentOrgId && (
                    <Check className="h-4 w-4 text-[var(--accent-blue)]" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-blue)] text-sm font-bold text-white">
              {orgName.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{orgName}</span>
              <span className="text-xs text-muted-foreground capitalize">{dept}</span>
            </div>
          </div>
        )}
      </div>

      {switchError && (
        <div className="mx-4 mt-1 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {switchError}
        </div>
      )}

      <Separator />

      <nav className="flex-1 space-y-1 px-2 py-3">
        {navItems.map((item) => {
          const fullHref = `/${dept}${item.href}`;
          const isActive =
            item.href === ""
              ? pathname === `/${dept}`
              : pathname.startsWith(fullHref);

          return (
            <Link
              key={item.href}
              href={fullHref}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)] font-medium"
                  : "text-foreground hover:bg-sidebar-accent"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        <Separator className="my-3" />

        {settingsItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)] font-medium"
                  : "text-foreground hover:bg-sidebar-accent"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t px-3 py-3 space-y-2">
        <SidebarCredits
          creditsRemaining={creditsRemaining}
          plan={plan}
          role={role}
        />
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}

function SidebarCredits({
  creditsRemaining,
  plan,
  role,
}: {
  creditsRemaining: number;
  plan: string;
  role: string;
}) {
  const planCredits = PLAN_LIMITS[plan as PlanTier]?.credits ?? 0;
  const isAdmin = role === "owner" || role === "admin";

  // Unlimited plan
  if (creditsRemaining === -1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 text-xs text-[var(--fgColor-muted)]">
        <Zap className="h-3 w-3" />
        <span>Unlimited credits</span>
      </div>
    );
  }

  // Zero credits
  if (creditsRemaining === 0) {
    return (
      <div className="flex items-center justify-between px-3 py-1">
        <div className="flex items-center gap-2 text-xs text-[var(--fgColor-danger)]">
          <Zap className="h-3 w-3" />
          <span>0 credits</span>
        </div>
        {isAdmin && (
          <Link
            href="/settings/billing"
            className="text-xs font-medium text-[var(--fgColor-accent)] hover:underline"
          >
            Buy more
          </Link>
        )}
      </div>
    );
  }

  // Bonus credits (free plan with remaining > 0 from initial grant or purchase)
  if (planCredits === 0) {
    return (
      <Link
        href="/settings/billing"
        className="flex items-center gap-2 px-3 py-1 text-xs text-[var(--fgColor-muted)] hover:text-foreground transition-colors"
      >
        <Zap className="h-3 w-3" />
        <span>{creditsRemaining} credits</span>
      </Link>
    );
  }

  // Normal: plan has credits, show progress bar
  const usedPct = Math.min(100, Math.round(((planCredits - creditsRemaining) / planCredits) * 100));
  const fillPct = Math.max(0, 100 - usedPct);
  const isLow = creditsRemaining <= Math.ceil(planCredits * 0.1);

  return (
    <div className="space-y-1 px-3 py-1">
      <div className="flex items-center justify-between">
        <Link
          href="/settings/billing"
          className="flex items-center gap-2 text-xs text-[var(--fgColor-muted)] hover:text-foreground transition-colors"
        >
          <Zap className="h-3 w-3" />
          <span>{creditsRemaining} credits</span>
        </Link>
        {isLow && isAdmin && (
          <Link
            href="/settings/billing"
            className="text-xs font-medium text-[var(--fgColor-accent)] hover:underline"
          >
            Buy more
          </Link>
        )}
      </div>
      <div className="h-0.5 w-full rounded-full bg-[var(--bgColor-muted)]">
        <div
          className="h-0.5 rounded-full transition-all duration-200"
          style={{
            width: `${fillPct}%`,
            backgroundColor: isLow
              ? "var(--fgColor-danger)"
              : "var(--fgColor-accent)",
          }}
        />
      </div>
    </div>
  );
}
