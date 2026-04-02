"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ApprovalStatsCards } from "./approval-stats";
import { ApprovalCard } from "./approval-card";
import { ApprovalDetailSheet } from "./approval-detail-sheet";
import type { ApprovalItem, ApprovalStats } from "@/lib/approvals/actions";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "revision_requested", label: "Revision" },
] as const;

const ITEM_TYPES = [
  { value: "all", label: "All Types" },
  { value: "social_post", label: "Social Post" },
  { value: "blog_post", label: "Blog Post" },
  { value: "email_draft", label: "Email Draft" },
  { value: "task_submission", label: "Task Output" },
  { value: "strategy_change", label: "Strategy" },
] as const;

const SUBMITTER_TYPES = [
  { value: "all", label: "All Sources" },
  { value: "claude_api", label: "Claude" },
  { value: "n8n", label: "n8n" },
  { value: "member", label: "Team Member" },
  { value: "freelancer", label: "Freelancer" },
] as const;

interface ApprovalsPageClientProps {
  items: ApprovalItem[];
  stats: ApprovalStats;
  total: number;
  page: number;
  totalPages: number;
  dept: string;
  canReview: boolean;
}

export function ApprovalsPageClient({
  items,
  stats,
  total,
  page,
  totalPages,
  dept,
  canReview,
}: ApprovalsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const currentStatus = searchParams.get("status") || "all";
  const currentType = searchParams.get("item_type") || "all";
  const currentSubmitter = searchParams.get("submitted_by_type") || "all";

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // Reset to page 1 on filter change
    params.delete("page");
    router.push(`/${dept}/approvals?${params.toString()}`);
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(p));
    }
    router.push(`/${dept}/approvals?${params.toString()}`);
  }

  function handleSelectItem(item: ApprovalItem) {
    setSelectedItem(item);
    setSheetOpen(true);
  }

  return (
    <div className="space-y-4">
      <ApprovalStatsCards stats={stats} />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs
          value={currentStatus}
          onValueChange={(v) => updateFilter("status", v)}
        >
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select
          value={currentType}
          onValueChange={(v) => updateFilter("item_type", v || "all")}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ITEM_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={currentSubmitter}
          onValueChange={(v) =>
            updateFilter("submitted_by_type", v || "all")
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUBMITTER_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="text-lg font-medium">No approval items</p>
          <p className="text-sm mt-1">
            Items submitted by automated executors (Claude, n8n) or team members
            will appear here for review.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              onSelect={handleSelectItem}
              canReview={canReview}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of{" "}
            {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail sheet */}
      <ApprovalDetailSheet
        item={selectedItem}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        canReview={canReview}
      />
    </div>
  );
}
