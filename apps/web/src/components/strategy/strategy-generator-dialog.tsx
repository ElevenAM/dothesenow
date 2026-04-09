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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateStrategy, saveStrategyContext } from "@/lib/strategy/generate";
import { createStrategyDoc } from "@/lib/strategy/actions";
import { selectTemplate } from "@/lib/onboarding/templates";
import type { Industry } from "@dothesenow/types";
import {
  Sparkles,
  Loader2,
  Zap,
  AlertTriangle,
  Pencil,
  ArrowLeft,
} from "lucide-react";

interface StrategyGeneratorDialogProps {
  orgIndustry: string | null;
  orgBudgetTier: string | null;
  existingTypes: string[];
  creditBalance: number;
  creditCost: number;
  orgProductDescription: string | null;
  orgValueProposition: string | null;
  orgWebsiteUrl: string | null;
  orgTargetCustomer: string | null;
}

type GenerationStep =
  | "idle"
  | "context"
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
  creditCost,
  orgProductDescription,
  orgValueProposition,
  orgWebsiteUrl,
  orgTargetCustomer,
}: StrategyGeneratorDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [generationStep, setGenerationStep] = useState<GenerationStep>("idle");
  const [progressIndex, setProgressIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Context form state — pre-populated from org profile
  const [productDescription, setProductDescription] = useState(
    orgProductDescription ?? "",
  );
  const [valueProposition, setValueProposition] = useState(
    orgValueProposition ?? "",
  );
  const [websiteUrl, setWebsiteUrl] = useState(orgWebsiteUrl ?? "");
  const [targetCustomer, setTargetCustomer] = useState(
    orgTargetCustomer ?? "",
  );

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

  const hasCredits = creditBalance === -1 || creditBalance >= creditCost;
  const canGenerate = !!orgIndustry && !!orgBudgetTier && hasCredits;

  // All enrichment fields already populated — can skip context step
  const hasAllContext =
    !!orgProductDescription && !!orgValueProposition;

  const contextValid =
    productDescription.trim().length > 0 && valueProposition.trim().length > 0;

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

  const handleStartGeneration = () => {
    if (hasAllContext) {
      // Skip context step — fields already populated
      handleGenerate();
    } else {
      setGenerationStep("context");
    }
  };

  const handleContextSubmitAndGenerate = () => {
    setError(null);
    startTransition(async () => {
      try {
        const saveResult = await saveStrategyContext({
          productDescription: productDescription.trim(),
          valueProposition: valueProposition.trim(),
          websiteUrl: websiteUrl.trim() || null,
          targetCustomer: targetCustomer.trim() || null,
        });

        if (!saveResult.success) {
          setError(saveResult.error ?? "Failed to save context");
          return;
        }

        handleGenerate();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save context",
        );
      }
    });
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
        setGenerationStep("completed");
        timeoutRef.current = setTimeout(() => setOpen(false), 2500);
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
              : generationStep === "context"
                ? "Tell us about your product"
                : "Generate Marketing Strategy"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {generationStep === "context" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Help us create a strategy tailored to your specific product and
                market.
              </p>
              <div className="space-y-2">
                <Label htmlFor="ctx-product">
                  Product / Service Description{" "}
                  <span className="text-[var(--fgColor-danger)]">*</span>
                </Label>
                <Textarea
                  id="ctx-product"
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="e.g., A project management tool for remote engineering teams that automates sprint planning and standup summaries."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ctx-value">
                  Value Proposition / Differentiator{" "}
                  <span className="text-[var(--fgColor-danger)]">*</span>
                </Label>
                <Textarea
                  id="ctx-value"
                  value={valueProposition}
                  onChange={(e) => setValueProposition(e.target.value)}
                  placeholder="e.g., We save engineering managers 5+ hours per week by replacing manual status updates with AI-generated summaries."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ctx-website">Website URL (optional)</Label>
                <Input
                  id="ctx-website"
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ctx-customer">
                  Target Customer (optional)
                </Label>
                <Textarea
                  id="ctx-customer"
                  value={targetCustomer}
                  onChange={(e) => setTargetCustomer(e.target.value)}
                  placeholder="e.g., Series A–C SaaS companies with 20–200 engineers, specifically engineering managers and VPs of Engineering."
                  rows={2}
                />
              </div>
            </div>
          ) : generationStep === "generating" ? (
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
              Strategy generation started! This page will update automatically
              when your strategy is ready (15–30 seconds).
            </p>
          ) : (
            <>
              {canGenerate ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    We&apos;ll use AI to create a personalized marketing strategy
                    based on your organization&apos;s profile, using proven
                    frameworks like Bullseye, GACCS, and ICE scoring.
                  </p>
                  <div className="flex items-center gap-2 rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-3 py-2 text-sm">
                    <Zap className="h-4 w-4 text-[var(--fgColor-attention)]" />
                    <span>
                      This will use <strong>{creditCost} credits</strong>.
                      {creditBalance === -1
                        ? " You have unlimited credits."
                        : ` You have ${creditBalance} remaining.`}
                    </span>
                  </div>
                  {hasAllContext && (
                    <button
                      type="button"
                      onClick={() => setGenerationStep("context")}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit product context
                    </button>
                  )}
                </>
              ) : !hasCredits ? (
                <div className="flex items-start gap-2 rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-3 py-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-[var(--fgColor-danger)]" />
                  <div>
                    <p className="font-medium">Insufficient credits</p>
                    <p className="text-muted-foreground">
                      Strategy generation costs {creditCost} credits, but you
                      have {creditBalance}. Upgrade your plan or use a pre-built
                      template instead.
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
          {generationStep === "context" ? (
            <>
              <Button
                variant="outline"
                onClick={() => setGenerationStep("idle")}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleContextSubmitAndGenerate}
                disabled={!contextValid || isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate with AI
              </Button>
            </>
          ) : generationStep !== "generating" &&
            generationStep !== "completed" ? (
            <>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                onClick={handleStartGeneration}
                disabled={!canGenerate || isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate with AI
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
