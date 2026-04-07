"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createStrategyDoc } from "@/lib/strategy/actions";
import { selectTemplate } from "@/lib/onboarding/templates";
import type { Industry } from "@dothesenow/types";
import { Sparkles, Loader2 } from "lucide-react";

interface StrategyGeneratorDialogProps {
  orgIndustry: string | null;
  orgBudgetTier: string | null;
  existingTypes: string[];
}

export function StrategyGeneratorDialog({
  orgIndustry,
  orgBudgetTier,
  existingTypes,
}: StrategyGeneratorDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasMasterStrategy = existingTypes.includes("master_strategy");
  const template = orgIndustry
    ? selectTemplate(orgIndustry as Industry)
    : null;

  const isDisabled = hasMasterStrategy || !template;

  const handleGenerate = () => {
    if (!template) return;
    setError(null);
    startTransition(async () => {
      try {
        await createStrategyDoc(
          "master_strategy",
          template.title,
          template.content,
        );
        setOpen(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to generate strategy",
        );
      }
    });
  };

  if (hasMasterStrategy) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant="outline" disabled={!template} />}
      >
        <Sparkles className="h-4 w-4" />
        Generate Strategy
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Strategy from Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {template ? (
            <>
              <p className="text-sm text-muted-foreground">
                Based on your organization profile, we'll create a{" "}
                <span className="font-medium text-foreground">
                  {template.title}
                </span>{" "}
                document with goals, channels, and an experiment backlog.
              </p>
              <p className="text-xs text-muted-foreground">
                You can edit everything after generation. This is a starting
                point, not a locked plan.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No template available for your industry yet. You can create a
              strategy document manually instead.
            </p>
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={handleGenerate} disabled={isDisabled || isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
