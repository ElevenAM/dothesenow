import Link from "next/link";
import {
  Compass,
  Layers,
  GitBranch,
  Users,
  ShieldCheck,
  MessageSquare,
  ArrowRight,
  Check,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------
   Section 3 — The Loop (How It Works)
   ---------------------------------------------------------------- */
const LOOP_STEPS = [
  {
    name: "Analyze",
    description:
      "Connect your data. DoTheseNow learns what's working across your campaigns.",
  },
  {
    name: "Plan",
    description:
      "AI generates your strategy using the GACCS framework — goals, audiences, channels, content, schedule.",
  },
  {
    name: "Execute",
    description:
      "Tasks route to you, your AI agents, freelancers, or automations. The right work hits the right executor.",
  },
  {
    name: "Measure",
    description:
      "Results flow back automatically. What shipped. What converted. What didn't.",
  },
  {
    name: "Refine",
    description:
      "Next week's plan gets smarter. The loop tightens. Your strategy improves with every cycle.",
  },
] as const;

export function LoopSection() {
  return (
    <section
      id="the-loop"
      className="bg-muted py-20 md:py-28 px-4 md:px-6 scroll-mt-14"
    >
      <div className="max-w-5xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          The Loop
        </p>
        <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
          One system. Five steps. Every week.
        </h2>

        {/* Desktop: horizontal timeline */}
        <div className="hidden md:flex items-start justify-between mt-14 gap-4">
          {LOOP_STEPS.map((step, i) => (
            <div key={step.name} className="flex items-start flex-1">
              <div className="flex flex-col items-center text-center flex-1">
                <div
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center text-sm font-semibold",
                    "bg-primary text-primary-foreground"
                  )}
                >
                  {i + 1}
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">
                  {step.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-[160px]">
                  {step.description}
                </p>
              </div>
              {i < LOOP_STEPS.length - 1 && (
                <div className="w-full max-w-12 h-px bg-border mt-7 shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Mobile: vertical timeline */}
        <div className="md:hidden mt-10 relative border-l-2 border-primary/30 ml-5 space-y-8">
          {LOOP_STEPS.map((step, i) => (
            <div key={step.name} className="relative pl-8">
              <div className="absolute -left-[17px] top-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                {i + 1}
              </div>
              <p className="text-sm font-semibold text-foreground">
                {step.name}
              </p>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <p className="text-base text-foreground">
            No other platform closes this loop for small teams.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent-blue)] hover:underline whitespace-nowrap"
          >
            Start your first loop
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------
   Section 4 — What It Replaces (Before / After)
   ---------------------------------------------------------------- */
const WITHOUT = [
  "Strategy doc collecting dust",
  "Jasper generating content with no strategic context",
  "n8n automations running on guesswork",
  "HubSpot contacts disconnected from campaigns",
  "Slack threads instead of approvals",
  "No idea what worked last month",
] as const;

const WITH = [
  "Strategy generates this week's 15–25 tasks",
  "Jasper executes content briefs informed by your strategy",
  "n8n automations triggered by prioritized tasks",
  "HubSpot contacts feed your outreach plan",
  "Approvals route through workflows, not threads",
  "Results refine next week's plan automatically",
] as const;

export function ComparisonSection() {
  return (
    <section className="bg-background py-20 md:py-28 px-4 md:px-6">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Same Tools. New Brain.
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-destructive/20">
            <CardContent className="pt-6">
              <p className="text-sm font-semibold text-destructive mb-4">
                Without DoTheseNow
              </p>
              <ul className="space-y-3">
                {WITHOUT.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <X className="size-4 text-destructive/60 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-primary/30 border-2">
            <CardContent className="pt-6">
              <p className="text-sm font-semibold text-primary mb-4">
                With DoTheseNow
              </p>
              <ul className="space-y-3">
                {WITH.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="size-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <p className="text-base text-foreground">
            Same tools. Same budget. Now they talk to each other.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent-blue)] hover:underline whitespace-nowrap"
          >
            Start free
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------
   Section 5 — Features (2×3 grid)
   ---------------------------------------------------------------- */
const FEATURES = [
  {
    icon: Compass,
    title: "Strategy Engine",
    description:
      "AI builds your marketing plan using the GACCS framework. Industry-specific. Budget-aware. Ready in minutes.",
  },
  {
    icon: Layers,
    title: "Task Decomposition",
    description:
      "Strategy breaks into 15–25 prioritized weekly tasks. Every morning, you know exactly what to do.",
  },
  {
    icon: GitBranch,
    title: "Smart Routing",
    description:
      "Tasks dispatch to you, Claude AI, freelancers, or n8n automations. The right work hits the right hands.",
  },
  {
    icon: Users,
    title: "Contacts & Outreach",
    description:
      "Lightweight CRM for tracking contacts across email, LinkedIn, and calls. Syncs with HubSpot.",
  },
  {
    icon: ShieldCheck,
    title: "Approvals",
    description:
      "Route content through approval workflows before it goes live. Built for teams that ship fast but carefully.",
  },
  {
    icon: MessageSquare,
    title: "Slack-First",
    description:
      "Morning briefing with today's priorities. End-of-day summary of what shipped. Your team stays aligned without another meeting.",
  },
] as const;

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="bg-muted py-20 md:py-28 px-4 md:px-6 scroll-mt-14"
    >
      <div className="max-w-5xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          What&apos;s Inside
        </p>
        <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
          Everything you need to close the loop.
        </h2>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title}>
                <CardContent className="pt-6">
                  <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="size-5" />
                  </div>
                  <p className="mt-3 font-semibold text-foreground">
                    {feature.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------
   Section 6 — BYOS (Bring Your Own Stack)
   ---------------------------------------------------------------- */
const INTEGRATIONS = [
  "Jasper",
  "HubSpot",
  "Slack",
  "n8n",
  "Claude AI",
  "Google Analytics",
] as const;

export function IntegrationsSection() {
  return (
    <section className="bg-background py-20 md:py-28 px-4 md:px-6">
      <div className="max-w-5xl mx-auto text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Bring Your Own Stack
        </p>
        <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
          Your tools. Our brain.
        </h2>
        <p className="mt-3 text-base text-muted-foreground max-w-xl mx-auto">
          Connect the subscriptions you already pay for. DoTheseNow
          orchestrates them with strategic context.
        </p>

        {/* Hub-and-spoke: desktop */}
        <div className="hidden md:flex items-center justify-center mt-14 mb-6">
          <div className="relative" style={{ width: 400, height: 400 }}>
            {/* Center hub */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-[var(--shadow-resting-medium)]">
                <svg
                  className="size-8"
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
              </div>
            </div>
            {/* Spokes */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 400 400"
              aria-hidden="true"
            >
              {INTEGRATIONS.map((_, i) => {
                const angle = (i * 60 - 90) * (Math.PI / 180);
                const x = 200 + 150 * Math.cos(angle);
                const y = 200 + 150 * Math.sin(angle);
                return (
                  <line
                    key={i}
                    x1="200"
                    y1="200"
                    x2={x}
                    y2={y}
                    stroke="var(--border)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                );
              })}
            </svg>
            {/* Satellite nodes */}
            {INTEGRATIONS.map((name, i) => {
              const angle = (i * 60 - 90) * (Math.PI / 180);
              const x = ((200 + 150 * Math.cos(angle)) / 400) * 100;
              const y = ((200 + 150 * Math.sin(angle)) / 400) * 100;
              return (
                <div
                  key={name}
                  className="absolute w-16 h-16 -ml-8 -mt-8 rounded-full border-2 border-border bg-card flex items-center justify-center shadow-[var(--shadow-resting-small)]"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight px-1">
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile: grid fallback */}
        <div className="md:hidden mt-10 grid grid-cols-2 sm:grid-cols-3 gap-4">
          {INTEGRATIONS.map((name) => (
            <div
              key={name}
              className="rounded-md border border-border bg-card p-4 flex items-center justify-center shadow-[var(--shadow-resting-small)]"
            >
              <span className="text-sm font-medium text-muted-foreground">
                {name}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-10 text-base text-foreground">
          We don&apos;t compete with your tools. We&apos;re the layer that tells
          them what to do.
        </p>
        <div className="mt-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent-blue)] hover:underline"
          >
            See all integrations
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
