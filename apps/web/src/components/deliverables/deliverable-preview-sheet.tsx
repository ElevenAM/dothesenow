"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Pencil, Copy, CheckSquare, LinkIcon } from "lucide-react";
import type { BlogPost } from "@/lib/blog/actions";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-[var(--label-gray-bg)] text-[var(--label-gray-fg)]",
  review: "bg-[var(--label-yellow-bg)] text-[var(--label-yellow-fg)]",
  approved: "bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)]",
  published: "bg-[var(--label-green-bg)] text-[var(--label-green-fg)]",
  archived: "bg-[var(--label-gray-bg)] text-[var(--label-gray-fg)]",
};

interface DeliverablePreviewSheetProps {
  deliverable: BlogPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (post: BlogPost) => void;
}

export function DeliverablePreviewSheet({
  deliverable,
  open,
  onOpenChange,
  onEdit,
}: DeliverablePreviewSheetProps) {
  function handleCopy() {
    if (!deliverable) return;
    navigator.clipboard.writeText(deliverable.content);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-[var(--fgColor-muted)]" />
            Deliverable Preview
          </SheetTitle>
        </SheetHeader>

        {deliverable && (
          <div className="mt-6 space-y-5">
            {/* Title & status */}
            <div>
              <h2 className="text-lg font-semibold">{deliverable.title}</h2>
              <div className="mt-2 flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={STATUS_COLORS[deliverable.status] ?? ""}
                >
                  {deliverable.status}
                </Badge>
                {deliverable.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs text-[var(--fgColor-muted)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Source task */}
            {deliverable.task && (
              <div className="flex items-center gap-2 rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-3 py-2 text-sm">
                <LinkIcon className="h-3.5 w-3.5 text-[var(--fgColor-muted)]" />
                <span className="text-[var(--fgColor-muted)]">Source task:</span>
                <span className="font-medium">{deliverable.task.title}</span>
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-3 text-sm text-[var(--fgColor-muted)]">
              {deliverable.author && <span>By {deliverable.author}</span>}
              <span>Updated {new Date(deliverable.updated_at).toLocaleDateString()}</span>
            </div>

            <Separator />

            {/* Content preview */}
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {deliverable.content}
              </div>
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(deliverable);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5" />
                Copy Content
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
