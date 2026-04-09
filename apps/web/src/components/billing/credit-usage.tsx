import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BuyCreditsButton } from "@/components/billing/buy-credits-dialog";

interface CreditUsageProps {
  remaining: number;
  total: number;
  resetAt: string | null;
  canBuyCredits?: boolean;
}

export function CreditUsage({
  remaining,
  total,
  resetAt,
  canBuyCredits = false,
}: CreditUsageProps) {
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

  // Free plan with no plan credits
  if (total === 0 && remaining === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Credits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[var(--fgColor-muted)]">
            Upgrade to a paid plan to unlock AI credits for automated task
            execution.
          </p>
          {canBuyCredits && <BuyCreditsButton label="Buy credits" />}
        </CardContent>
      </Card>
    );
  }

  // Bonus credits: plan has 0 monthly credits but user has purchased/initial credits
  if (total === 0 && remaining > 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">AI Credits</CardTitle>
            <span
              className="text-sm font-medium tabular-nums"
              aria-label={`${remaining} credits remaining`}
            >
              {remaining} remaining
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[var(--fgColor-muted)]">
            You have {remaining} bonus credit{remaining !== 1 ? "s" : ""}.
            These do not renew automatically.
          </p>
          {canBuyCredits && <BuyCreditsButton label="Buy more credits" />}
        </CardContent>
      </Card>
    );
  }

  // Standard: plan has credits
  const used = Math.max(0, total - remaining);
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const isLow = remaining <= Math.ceil(total * 0.1);
  const hasBonus = remaining > total;

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
          {hasBonus ? (
            <span>{remaining - total} bonus credits</span>
          ) : (
            <span>{used} used this period</span>
          )}
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--fgColor-danger)]">
              Running low on credits.
            </p>
            {canBuyCredits && <BuyCreditsButton label="Buy more" />}
          </div>
        )}

        {!isLow && canBuyCredits && <BuyCreditsButton label="Buy credits" />}
      </CardContent>
    </Card>
  );
}
