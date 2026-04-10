"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { changeTaskExecutor } from "@/lib/daily-tasks/actions";
import type { DailyTask } from "@/lib/daily-tasks/actions";

interface FreelancerPostDialogProps {
  task: DailyTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FreelancerPostDialog({
  task,
  open,
  onOpenChange,
}: FreelancerPostDialogProps) {
  const [deliverables, setDeliverables] = useState("");
  const [skills, setSkills] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!deliverables.trim()) {
      setError("Please describe what you need delivered.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await changeTaskExecutor(task.id, "freelancer", {
          deliverables: deliverables.trim(),
          required_skills: skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          budget: budget ? Number(budget) : undefined,
        });
        onOpenChange(false);
        setDeliverables("");
        setSkills("");
        setBudget("");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to post to marketplace",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Post to Freelancer Marketplace</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md bg-[var(--bgColor-muted)] px-3 py-2">
            <p className="text-xs font-medium text-[var(--fgColor-muted)]">
              Task
            </p>
            <p className="text-sm font-medium">{task.title}</p>
            {task.description && (
              <p className="text-xs text-[var(--fgColor-muted)] mt-1 line-clamp-2">
                {task.description}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deliverables">
              Deliverables <span className="text-[var(--fgColor-danger)]">*</span>
            </Label>
            <Textarea
              id="deliverables"
              placeholder="Describe what you need delivered (e.g., 1 blog post, 800-1200 words, SEO-optimized)"
              value={deliverables}
              onChange={(e) => setDeliverables(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="skills">Required Skills</Label>
            <Input
              id="skills"
              placeholder="e.g., copywriting, SEO, social media (comma-separated)"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="budget">Budget (USD)</Label>
            <Input
              id="budget"
              type="number"
              placeholder="e.g., 50"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              min={0}
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--fgColor-danger)]">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Posting..." : "Post to Marketplace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
