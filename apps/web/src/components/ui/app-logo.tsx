import { cn } from "@/lib/utils";

export function AppLogo({
  size = "default",
  className,
}: {
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const iconSize = { sm: "size-5", default: "size-6", lg: "size-8" }[size];
  const textSize = { sm: "text-base", default: "text-lg", lg: "text-2xl" }[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        className={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      <span className={cn("font-semibold", textSize)}>DoTheseNow</span>
    </div>
  );
}
