"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Bot, Cpu, User, Briefcase } from "lucide-react";
import { reviewApprovalItem } from "@/lib/approvals/actions";
import type { ApprovalItem } from "@/lib/approvals/actions";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  revision_requested: "bg-orange-100 text-orange-800",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  social_post: "Social Post",
  blog_post: "Blog Post",
  email_draft: "Email Draft",
  task_submission: "Task Output",
  strategy_change: "Strategy",
};

const SUBMITTER_ICONS: Record<string, typeof Bot> = {
  claude_api: Bot,
  n8n: Cpu,
  member: User,
  freelancer: Briefcase,
};

interface ApprovalCardProps {
  item: ApprovalItem;
  onSelect: (item: ApprovalItem) => void;
  canReview: boolean;
}

export function ApprovalCard({ item, onSelect, canReview }: ApprovalCardProps) {
  const [isApproving, startApproveTransition] = useTransition();
  const [isRejecting, startRejectTransition] = useTransition();

  const SubmitterIcon = SUBMITTER_ICONS[item.submitted_by_type] || User;
  const timeAgo = formatRelativeTime(item.created_at);

  function handleQuickApprove(e: React.MouseEvent) {
    e.stopPropagation();
    startApproveTransition(async () => {
      await reviewApprovalItem(item.id, "approved");
    });
  }

  function handleQuickReject(e: React.MouseEvent) {
    e.stopPropagation();
    startRejectTransition(async () => {
      await reviewApprovalItem(item.id, "rejected");
    });
  }

  return (
    <Card
      className="cursor-pointer hover:border-foreground/20 transition-colors"
      onClick={() => onSelect(item)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-medium truncate">{item.title}</h3>
              <Badge
                variant="outline"
                className={STATUS_COLORS[item.status] || ""}
              >
                {item.status.replace("_", " ")}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Badge variant="secondary" className="text-xs">
                {ITEM_TYPE_LABELS[item.item_type] || item.item_type}
              </Badge>
              <span className="flex items-center gap-1">
                <SubmitterIcon className="h-3 w-3" />
                {item.submitted_by_type}
              </span>
              <span>{timeAgo}</span>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.content}
            </p>
          </div>

          {canReview && item.status === "pending" && (
            <div className="flex gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={handleQuickApprove}
                disabled={isApproving || isRejecting}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleQuickReject}
                disabled={isApproving || isRejecting}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
