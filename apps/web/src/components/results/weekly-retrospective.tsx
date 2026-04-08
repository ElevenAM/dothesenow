"use client";

import { useCallback, useState, useTransition } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  triggerWeeklyRetrospective,
  getWeeklyRetrospectivesList,
} from "@/lib/results/actions";
import type { WeeklyReview } from "@dothesenow/types";

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

function isCurrentWeek(weekStart: string): boolean {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const ws = new Date(weekStart + "T00:00:00");
  return (
    ws.getFullYear() === monday.getFullYear() &&
    ws.getMonth() === monday.getMonth() &&
    ws.getDate() === monday.getDate()
  );
}

interface WeeklyRetrospectiveProps {
  retrospectives: WeeklyReview[];
}

export function WeeklyRetrospective({
  retrospectives: initialRetros,
}: WeeklyRetrospectiveProps) {
  const [retrospectives, setRetrospectives] = useState(initialRetros);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const latest = retrospectives.length > 0 ? retrospectives[0] : null;
  const previous = retrospectives.slice(1);

  const hasCurrentWeekRetro =
    latest != null && isCurrentWeek(latest.week_start);

  const handleGenerate = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        await triggerWeeklyRetrospective();
      } catch (e) {
        console.error("[weekly-retrospective] generate failed:", e);
        setError("Failed to trigger retrospective generation.");
      }
    });
  }, []);

  const handleRefresh = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const fresh = await getWeeklyRetrospectivesList(8);
        setRetrospectives(fresh);
      } catch (e) {
        console.error("[weekly-retrospective] refresh failed:", e);
        setError("Failed to refresh retrospectives.");
      }
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          AI-generated weekly summaries of channel and experiment performance
        </p>
        <div className="flex items-center gap-2">
          {!hasCurrentWeekRetro && (
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={isPending}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              {isPending ? "Generating..." : "Generate Retrospective"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isPending}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${isPending ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Latest retrospective */}
      {latest ? (
        <RetroCard retro={latest} isLatest />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No retrospectives yet</p>
            <p className="text-xs mt-1">
              Retrospectives are generated automatically on Fridays at 4pm, or
              you can generate one manually.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Previous retrospectives */}
      {previous.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Previous Weeks
          </h3>
          {previous.map((retro) => {
            const isExpanded = expandedId === retro.id;
            return (
              <Card key={retro.id}>
                <CardHeader
                  className="cursor-pointer py-3"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : retro.id)
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <CardTitle className="text-sm">
                        Week of {formatWeekRange(retro.week_start, retro.week_end)}
                      </CardTitle>
                    </div>
                    {retro.generated_by && (
                      <Badge variant="default">{retro.generated_by}</Badge>
                    )}
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0">
                    <RetroContent retro={retro} />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RetroCard({
  retro,
  isLatest,
}: {
  retro: WeeklyReview;
  isLatest?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Week of {formatWeekRange(retro.week_start, retro.week_end)}
          </CardTitle>
          <div className="flex items-center gap-2">
            {isLatest && <Badge variant="blue">Latest</Badge>}
            {retro.generated_by && (
              <Badge variant="default">{retro.generated_by}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <RetroContent retro={retro} />
      </CardContent>
    </Card>
  );
}

function RetroContent({ retro }: { retro: WeeklyReview }) {
  return (
    <div className="space-y-4">
      {/* Wins */}
      {retro.wins && retro.wins.length > 0 && (
        <div>
          <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--fgColor-success)]" />
            Wins
          </h4>
          <ul className="space-y-1">
            {retro.wins.map((win, i) => (
              <li key={i} className="text-sm text-muted-foreground pl-6">
                {win}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Challenges */}
      {retro.challenges && retro.challenges.length > 0 && (
        <div>
          <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
            <AlertCircle className="h-4 w-4 text-[var(--fgColor-attention)]" />
            Challenges
          </h4>
          <ul className="space-y-1">
            {retro.challenges.map((c, i) => (
              <li key={i} className="text-sm text-muted-foreground pl-6">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Learnings */}
      {retro.learnings && retro.learnings.length > 0 && (
        <div>
          <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
            <Info className="h-4 w-4 text-[var(--fgColor-accent)]" />
            Learnings
          </h4>
          <ul className="space-y-1">
            {retro.learnings.map((l, i) => (
              <li key={i} className="text-sm text-muted-foreground pl-6">
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strategy changes */}
      {retro.strategy_changes && (
        <div>
          <h4 className="text-sm font-medium mb-2">Strategy Adjustments</h4>
          <p className="text-sm text-muted-foreground">{retro.strategy_changes}</p>
        </div>
      )}

      {/* Next week priorities */}
      {retro.next_week_priorities && retro.next_week_priorities.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Next Week Priorities</h4>
          <ol className="list-decimal list-inside space-y-1">
            {retro.next_week_priorities.map((p, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                {p}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* AI summary */}
      {retro.ai_summary && (
        <blockquote className="border-l-4 border-border pl-4 py-2 bg-muted/50 rounded-r-md">
          <p className="text-sm italic text-muted-foreground">
            {retro.ai_summary}
          </p>
        </blockquote>
      )}
    </div>
  );
}
