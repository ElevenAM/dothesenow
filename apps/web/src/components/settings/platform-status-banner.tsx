import { CheckCircle2, AlertCircle } from "lucide-react";

interface PlatformStatusBannerProps {
  hasClaudeApiKey: boolean;
}

export function PlatformStatusBanner({
  hasClaudeApiKey,
}: PlatformStatusBannerProps) {
  if (hasClaudeApiKey) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-4 py-3 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--fgColor-success)]" />
        <span>
          <span className="font-medium">AI features active</span>
          <span className="text-[var(--fgColor-muted)]">
            {" "}— Claude API key is configured. Strategy generation, task
            decomposition, and AI-powered features are ready to use.
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--fgColor-attention)] bg-[var(--label-yellow-bg)] px-4 py-3 text-sm">
      <AlertCircle className="h-4 w-4 shrink-0 text-[var(--fgColor-attention)]" />
      <span>
        <span className="font-medium">AI features unavailable</span>
        <span className="text-[var(--fgColor-muted)]">
          {" "}— The platform Claude API key is not configured. Contact your
          administrator to enable AI-powered features like strategy generation
          and task decomposition.
        </span>
      </span>
    </div>
  );
}
