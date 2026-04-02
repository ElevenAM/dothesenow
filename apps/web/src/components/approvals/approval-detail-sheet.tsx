"use client";

import { useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { reviewApprovalItem } from "@/lib/approvals/actions";
import type { ApprovalItem } from "@/lib/approvals/actions";
import { STATUS_COLORS, ITEM_TYPE_LABELS } from "./constants";

interface ApprovalDetailSheetProps {
  item: ApprovalItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canReview: boolean;
}

export function ApprovalDetailSheet({
  item,
  open,
  onOpenChange,
  canReview,
}: ApprovalDetailSheetProps) {
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isReviewable = item
    ? item.status === "pending" || item.status === "revision_requested"
    : false;

  function handleReview(
    status: "approved" | "rejected" | "revision_requested"
  ) {
    setReviewError(null);
    startTransition(async () => {
      try {
        await reviewApprovalItem(item!.id, status, reviewNotes || undefined);
        setReviewNotes("");
        onOpenChange(false);
      } catch (err) {
        setReviewError(
          err instanceof Error ? err.message : "Failed to submit review"
        );
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {item && (
        <>
        <SheetHeader>
          <SheetTitle className="pr-8">{item.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Status & metadata */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={STATUS_COLORS[item.status] || ""}
            >
              {item.status.replace("_", " ")}
            </Badge>
            <Badge variant="secondary">
              {ITEM_TYPE_LABELS[item.item_type] || item.item_type}
            </Badge>
            <Badge variant="secondary">{item.submitted_by_type}</Badge>
          </div>

          {/* Linked task info */}
          {item.daily_task && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium mb-1">Linked Task</p>
              <p>
                {item.daily_task.title} ({item.daily_task.task_type})
              </p>
              {item.daily_task.description && (
                <p className="text-muted-foreground mt-1">
                  {item.daily_task.description}
                </p>
              )}
            </div>
          )}

          {/* Execution metadata (Claude API) */}
          {item.metadata &&
            ("model" in item.metadata || "duration_ms" in item.metadata) && (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium mb-1">Execution Details</p>
                <div className="flex gap-4 text-muted-foreground">
                  {"model" in item.metadata && (
                    <span>Model: {String(item.metadata.model)}</span>
                  )}
                  {"duration_ms" in item.metadata && (
                    <span>
                      Duration: {(Number(item.metadata.duration_ms) / 1000).toFixed(1)}s
                    </span>
                  )}
                  {"input_tokens" in item.metadata && (
                    <span>
                      Tokens: {String(item.metadata.input_tokens)} in /{" "}
                      {String(item.metadata.output_tokens)} out
                    </span>
                  )}
                </div>
              </div>
            )}

          <Separator />

          {/* Content */}
          <div>
            <Label className="text-sm font-medium">Content</Label>
            <div className="mt-2 rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto">
              {item.content}
            </div>
          </div>

          {/* Previous review info */}
          {item.reviewed_at && (
            <>
              <Separator />
              <div>
                <Label className="text-sm font-medium">Previous Review</Label>
                <div className="mt-2 text-sm text-muted-foreground">
                  <p>
                    Reviewed{" "}
                    {new Date(item.reviewed_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {item.reviewer_profile &&
                      ` by ${item.reviewer_profile.display_name || item.reviewer_profile.email}`}
                  </p>
                  {item.reviewer_notes && (
                    <p className="mt-1 italic">
                      &ldquo;{item.reviewer_notes}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Review form */}
          {canReview && isReviewable && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label htmlFor="review-notes" className="text-sm font-medium">
                  Review Notes (optional)
                </Label>
                <Textarea
                  id="review-notes"
                  placeholder="Add feedback or revision instructions..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                />
                {reviewError && (
                  <p className="text-sm text-red-600">{reviewError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleReview("approved")}
                    disabled={isPending}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="text-orange-600 border-orange-300 hover:bg-orange-50"
                    onClick={() => handleReview("revision_requested")}
                    disabled={isPending}
                  >
                    Request Revision
                  </Button>
                  <Button
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => handleReview("rejected")}
                    disabled={isPending}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Timestamps */}
          <Separator />
          <div className="text-xs text-muted-foreground">
            <p>
              Created:{" "}
              {new Date(item.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
        </>
        )}
      </SheetContent>
    </Sheet>
  );
}
