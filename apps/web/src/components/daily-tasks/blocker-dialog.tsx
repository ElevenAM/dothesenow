"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reportBlocker } from "@/lib/blockers/actions";

interface BlockerDialogProps {
  taskId: string;
  taskTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BlockerDialog({
  taskId,
  taskTitle,
  open,
  onOpenChange,
}: BlockerDialogProps) {
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!description.trim() || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        await reportBlocker(taskId, description.trim());
        setDescription("");
        onOpenChange(false);
      } catch {
        setError("Failed to report blocker. Please try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Report Blocker</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <p className="text-xs font-medium text-[var(--fgColor-muted)] mb-1">
              Task
            </p>
            <p className="text-sm">{taskTitle}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="blocker-description">
              What&apos;s blocking this task?
            </Label>
            <Textarea
              id="blocker-description"
              placeholder="Describe what's preventing you from completing this task..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          {error && (
            <p className="text-xs text-[var(--fgColor-danger)]">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!description.trim() || isPending}
              className="bg-[var(--fgColor-severe)] hover:bg-[var(--fgColor-severe)]/90 text-white"
            >
              {isPending ? "Reporting..." : "Report Blocker"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
