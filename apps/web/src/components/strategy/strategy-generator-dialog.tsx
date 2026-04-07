"use client";

import { useState, useTransition, useRef, useEffect } from "react";
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
import { generateStrategy, STRATEGY_GENERATION_COST } from "@/lib/strategy/generate";
import { createStrategyDoc } from "@/lib/strategy/actions";
import { selectTemplate } from "@/lib/onboarding/templates";
import type { Industry } from "@dothesenow/types";
import { Sparkles, Loader2, Zap, AlertTriangle } from "lucide-react";

interface StrategyGeneratorDialogProps {
  orgIndustry: string | null;
  orgBudgetTier: string | null;
  existingTypes: string[];
  creditBalance: number;
}

type GenerationStep =
  | "idle"
  | "generating"
  | "completed"
  | "failed";

const PROGRESS_MESSAGES = [
  "Analyzing your organization profile...",
  "Selecting marketing frameworks...",
  "Generating strategy with Claude...",
  "Validating output structure...",
];

export function StrategyGeneratorDialog({
  orgIndustry,
  orgBudgetTier,
  existingTypes,
  creditBalance,
}: StrategyGeneratorDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [generationStep, setGenerationStep] = useState<GenerationStep>("idle");
  const [progressIndex, setProgressIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const hasMasterStrategy = existingTypes.includes("master_strategy");
  const template = orgIndustry
    ? selectTemplate(orgIndustry as Industry)
    : null;

  const hasCredits = creditBalance === -1 || creditBalance >= STRATEGY_GENERATION_COST;
  const canGenerate = !!orgIndustry && !!orgBudgetTier && hasCredits;

  const clearTimers = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleGenerate = () => {
    setError(null);
    setGenerationStep("generating");
    setProgressIndex(0);

    // Cycle through progress messages
    intervalRef.current = setInterval(() => {
      setProgressIndex((prev) =>
        prev < PROGRESS_MESSAGES.length - 1 ? prev + 1 : prev,
      );
    }, 5000);

    startTransition(async () => {
      try {
        const result = await generateStrategy();
        clearTimers();

        if (!result.success) {
          setError(result.error ?? "Generation failed");
          setGenerationStep("failed");
          return;
        }

        // Generation is async — the Realtime listener on the parent page
        // will trigger a refresh when the strategy doc is created/updated.
        // Show a success state and close the dialog.
        setGenerationStep("completed");
        timeoutRef.current = setTimeout(() => setOpen(false), 1500);
      } catch (err) {
        clearTimers();
        setError(
          err instanceof Error ? err.message : "Failed to start generation",
        );
        setGenerationStep("failed");
      }
    });
  };

  const handleFallbackTemplate = () => {
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
          err instanceof Error ? err.message : "Failed to create from template",
        );
      }
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      clearTimers();
      setGenerationStep("idle");
      setProgressIndex(0);
      setError(null);
    }
    setOpen(nextOpen);
  };

  if (hasMasterStrategy) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button size="sm" variant="outline" disabled={!orgIndustry} />}
      >
        <Sparkles className="h-4 w-4" />
        Generate Strategy
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {generationStep === "generating"
              ? "Generating Strategy..."
              : "Generate Marketing Strategy"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {generationStep === "generating" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {PROGRESS_MESSAGES[progressIndex]}
              </div>
              <p className="text-xs text-muted-foreground">
                This may take 15–30 seconds. The page will update automatically
                when your strategy is ready.
              </p>
            </div>
          ) : generationStep === "completed" ? (
            <p className="text-sm text-[var(--fgColor-success)]">
              Strategy generated successfully! Refreshing...
            </p>
          ) : (
            <>
              {canGenerate ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    We&apos;ll use AI to create a personalized marketing strategy
                    based on your organization&apos;s industry and budget tier, using
                    proven frameworks like Bullseye, GACCS, and ICE scoring.
                  </p>
                  <div className="flex items-center gap-2 rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-3 py-2 text-sm">
                    <Zap className="h-4 w-4 text-[var(--fgColor-attention)]" />
                    <span>
                      This will use <strong>{STRATEGY_GENERATION_COST} credits</strong>.
                      {creditBalance === -1
                        ? " You have unlimited credits."
                        : ` You have ${creditBalance} remaining.`}
                    </span>
                  </div>
                </>
              ) : !hasCredits ? (
                <div className="flex items-start gap-2 rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-3 py-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-[var(--fgColor-danger)]" />
                  <div>
                    <p className="font-medium">Insufficient credits</p>
                    <p className="text-muted-foreground">
                      Strategy generation costs {STRATEGY_GENERATION_COST} credits,
                      but you have {creditBalance}. Upgrade your plan or use a
                      pre-built template instead.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Complete onboarding (industry and budget tier) to generate a
                  personalized strategy.
                </p>
              )}

              {generationStep === "failed" && template && (
                <div className="rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-3">
                  <p className="text-sm font-medium">Generation failed?</p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    You can start with a pre-built template instead.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleFallbackTemplate}
                    disabled={isPending}
                  >
                    Use Template: {template.title}
                  </Button>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="text-sm text-[var(--fgColor-danger)]">{error}</div>
          )}
        </div>
        <DialogFooter>
          {generationStep !== "generating" && generationStep !== "completed" && (
            <>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate || isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate with AI
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
