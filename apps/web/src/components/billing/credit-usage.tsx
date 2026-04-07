import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CreditUsageProps {
  remaining: number;
  total: number;
  resetAt: string | null;
}

export function CreditUsage({ remaining, total, resetAt }: CreditUsageProps) {
  // Unlimited plan
  if (total === -1) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Credits</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--fgColor-muted)]">
            Unlimited credits on your Enterprise plan
          </p>
        </CardContent>
      </Card>
    );
  }

  // Free plan with no credits
  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Credits</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--fgColor-muted)]">
            Upgrade to a paid plan to unlock AI credits for automated task execution.
          </p>
        </CardContent>
      </Card>
    );
  }

  const used = total - remaining;
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const isLow = remaining <= Math.ceil(total * 0.1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">AI Credits</CardTitle>
          <span
            className="text-sm font-medium tabular-nums"
            aria-label={`${remaining} credits remaining of ${total} total`}
          >
            {remaining} / {total}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-[var(--bgColor-muted)]">
          <div
            className="h-2 rounded-full transition-all duration-200"
            style={{
              width: `${pct}%`,
              backgroundColor: isLow
                ? "var(--fgColor-danger)"
                : "var(--fgColor-accent)",
            }}
          />
        </div>

        <div className="flex items-center justify-between text-sm text-[var(--fgColor-muted)]">
          <span>{used} used this period</span>
          {resetAt && (
            <span>
              Resets{" "}
              {new Date(resetAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>

        {isLow && remaining > 0 && (
          <p className="text-xs text-[var(--fgColor-danger)]">
            Running low on credits. Consider upgrading your plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
