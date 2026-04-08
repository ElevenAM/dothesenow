"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  applyRefinementSuggestions,
  type SuggestionDecision,
  type ApplyResult,
} from "@/lib/strategy/refine";
import type { RefinementSuggestion } from "@dothesenow/prompts";

// ─── Category badge styling ────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { label: string; fgVar: string; bgVar: string }
> = {
  channel_swap: {
    label: "Channel Swap",
    fgVar: "var(--label-red-fg)",
    bgVar: "var(--label-red-bg)",
  },
  budget_realloc: {
    label: "Budget Realloc",
    fgVar: "var(--label-orange-fg)",
    bgVar: "var(--label-orange-bg)",
  },
  experiment_add: {
    label: "New Experiment",
    fgVar: "var(--label-green-fg)",
    bgVar: "var(--label-green-bg)",
  },
  experiment_kill: {
    label: "Kill Experiment",
    fgVar: "var(--label-red-fg)",
    bgVar: "var(--label-red-bg)",
  },
  goal_adjust: {
    label: "Goal Adjust",
    fgVar: "var(--label-purple-fg)",
    bgVar: "var(--label-purple-bg)",
  },
  audience_refine: {
    label: "Audience Refine",
    fgVar: "var(--label-blue-fg)",
    bgVar: "var(--label-blue-bg)",
  },
};

const CONFIDENCE_DOTS: Record<string, string> = {
  high: "bg-[var(--label-green-fg)]",
  medium: "bg-[var(--label-yellow-fg)]",
  low: "bg-[var(--label-default-fg)]",
};

// ─── Types ─────────────────────────────────────────────────────

type DecisionType = "accepted" | "rejected" | "modified";

interface SuggestionState {
  decision: DecisionType;
  modified_text?: string;
}

interface RefinementSuggestionsPanelProps {
  suggestions: RefinementSuggestion[];
  runId: string;
  periodStart: string;
  periodEnd: string;
  totalTasks: number;
  completionRate: number;
  onClose?: () => void;
}

// ─── Component ─────────────────────────────────────────────────

export function RefinementSuggestionsPanel({
  suggestions,
  runId,
  periodStart,
  periodEnd,
  totalTasks,
  completionRate,
  onClose,
}: RefinementSuggestionsPanelProps) {
  const [decisions, setDecisions] = useState<Map<number, SuggestionState>>(
    () => new Map(),
  );
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ApplyResult | null>(null);

  const setDecision = (index: number, state: SuggestionState) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(index, state);
      return next;
    });
  };

  const acceptedCount = Array.from(decisions.values()).filter(
    (d) => d.decision === "accepted" || d.decision === "modified",
  ).length;

  const handleApply = () => {
    const decisionsList: SuggestionDecision[] = suggestions.map((_, i) => {
      const state = decisions.get(i);
      if (!state || state.decision === "rejected") {
        return { index: i, decision: "rejected" as const };
      }
      return {
        index: i,
        decision: state.decision,
        modified_text: state.modified_text,
      };
    });

    startTransition(async () => {
      const res = await applyRefinementSuggestions(runId, decisionsList);
      setResult(res);
      if (res.success && onClose) {
        // Delay close to show result
        setTimeout(onClose, 1500);
      }
    });
  };

  if (result?.success) {
    const r = result.applyResults!;
    return (
      <div className="rounded-md border p-4 bg-[var(--label-green-bg)] text-[var(--label-green-fg)]">
        <p className="font-semibold text-sm">Refinement applied</p>
        <p className="text-xs mt-1">
          {r.applied} applied directly
          {r.fallback > 0 && `, ${r.fallback} added as annotations`}
          {r.failed > 0 && `, ${r.failed} failed`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {periodStart} — {periodEnd} | {totalTasks} tasks |{" "}
            {completionRate.toFixed(1)}% completion
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <Separator />

      {/* Suggestion cards */}
      <div className="space-y-3">
        {suggestions.map((suggestion, index) => (
          <SuggestionCard
            key={index}
            index={index}
            suggestion={suggestion}
            state={decisions.get(index)}
            onDecision={(state) => setDecision(index, state)}
            disabled={isPending}
          />
        ))}
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {acceptedCount} of {suggestions.length} accepted
        </p>
        <Button
          onClick={handleApply}
          disabled={isPending || acceptedCount === 0}
          size="sm"
        >
          {isPending ? "Applying..." : "Apply Selected"}
        </Button>
      </div>

      {result && !result.success && (
        <p className="text-sm text-[var(--label-red-fg)]">{result.error}</p>
      )}
    </div>
  );
}

// ─── Suggestion card ───────────────────────────────────────────

function SuggestionCard({
  index,
  suggestion,
  state,
  onDecision,
  disabled,
}: {
  index: number;
  suggestion: RefinementSuggestion;
  state?: SuggestionState;
  onDecision: (state: SuggestionState) => void;
  disabled: boolean;
}) {
  const [showModify, setShowModify] = useState(false);
  const [modifiedText, setModifiedText] = useState(suggestion.suggested_change);
  const categoryConfig = CATEGORY_CONFIG[suggestion.category] ?? {
    label: suggestion.category,
    fgVar: "var(--label-default-fg)",
    bgVar: "var(--label-default-bg)",
  };

  const decision = state?.decision;

  const borderClass =
    decision === "accepted" || decision === "modified"
      ? "border-[var(--label-green-fg)]"
      : decision === "rejected"
        ? "border-[var(--label-red-fg)] opacity-60"
        : "border-[var(--borderColor-default)]";

  return (
    <div className={`rounded-md border p-3 space-y-2 ${borderClass}`}>
      {/* Header row: category badge + confidence + section */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            color: categoryConfig.fgVar,
            backgroundColor: categoryConfig.bgVar,
          }}
        >
          {categoryConfig.label}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span
            className={`inline-block h-2 w-2 rounded-full ${CONFIDENCE_DOTS[suggestion.confidence] ?? ""}`}
          />
          {suggestion.confidence} confidence
        </span>
        <span className="text-xs text-muted-foreground">
          {suggestion.target_section}
        </span>
        {suggestion.compliance_review_required && (
          <Badge
            variant="outline"
            className="text-xs border-[var(--label-orange-fg)] text-[var(--label-orange-fg)]"
          >
            Compliance Review
          </Badge>
        )}
      </div>

      {/* Current state */}
      <div className="rounded bg-[var(--bgColor-muted)] p-2 text-xs">
        <span className="font-medium text-muted-foreground">Current: </span>
        {suggestion.current_state}
      </div>

      {/* Suggested change */}
      <div className="rounded bg-[var(--label-blue-bg)] p-2 text-xs">
        <span className="font-medium" style={{ color: "var(--label-blue-fg)" }}>
          Suggested:{" "}
        </span>
        {suggestion.suggested_change}
      </div>

      {/* Evidence (collapsible) */}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Evidence & impact
        </summary>
        <div className="mt-1 space-y-1 pl-2 text-muted-foreground">
          <p>{suggestion.evidence}</p>
          <p className="font-medium">
            Expected impact: {suggestion.expected_impact}
          </p>
        </div>
      </details>

      {/* Modify textarea */}
      {showModify && (
        <Textarea
          value={modifiedText}
          onChange={(e) => setModifiedText(e.target.value)}
          className="text-xs min-h-[60px]"
          placeholder="Edit the suggestion before applying..."
        />
      )}

      {/* Decision buttons */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={decision === "accepted" ? "default" : "outline"}
          onClick={() => {
            setShowModify(false);
            onDecision({ decision: "accepted" });
          }}
          disabled={disabled}
          className="text-xs h-7"
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant={decision === "modified" ? "default" : "outline"}
          onClick={() => {
            if (showModify && modifiedText !== suggestion.suggested_change) {
              onDecision({ decision: "modified", modified_text: modifiedText });
            } else {
              setShowModify(!showModify);
            }
          }}
          disabled={disabled}
          className="text-xs h-7"
        >
          {showModify ? "Save Edit" : "Modify"}
        </Button>
        <Button
          size="sm"
          variant={decision === "rejected" ? "destructive" : "outline"}
          onClick={() => {
            setShowModify(false);
            onDecision({ decision: "rejected" });
          }}
          disabled={disabled}
          className="text-xs h-7"
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
