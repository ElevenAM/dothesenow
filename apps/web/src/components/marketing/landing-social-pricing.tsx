import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLANS, PLAN_ORDER } from "@/lib/stripe/config";

/* ----------------------------------------------------------------
   Section 7 — Social Proof
   ---------------------------------------------------------------- */
const TESTIMONIALS = [
  {
    quote:
      "We went from a 40-page strategy doc to a daily task queue the whole team follows. The GACCS framework saved us two weeks of planning.",
    name: "Rachel Torres",
    role: "Head of Marketing",
    company: "SeedPath (22 people)",
    initials: "RT",
  },
  {
    quote:
      "I route research to Claude, design briefs to our freelancer, and email sequences to n8n — all from one board. I'm not the bottleneck anymore.",
    name: "Marcus Chen",
    role: "Marketing Ops",
    company: "Stackline Labs (38 people)",
    initials: "MC",
  },
  {
    quote:
      "The Slack briefing replaced our morning standup. Everyone knows what's on their plate before coffee. Our weekly sync went from 45 minutes to 15.",
    name: "Priya Kamath",
    role: "VP Marketing",
    company: "Nomad Health (12 people)",
    initials: "PK",
  },
] as const;

export function TestimonialsSection() {
  return (
    <section className="bg-muted py-20 md:py-28 px-4 md:px-6">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          From Teams Like Yours
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <Card key={t.name}>
              <CardContent className="pt-6">
                <svg
                  className="size-6 text-primary/30 mb-3"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </svg>
                <p className="text-sm text-foreground italic leading-relaxed">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.role}, {t.company}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------
   Section 8 — Pricing
   ---------------------------------------------------------------- */
const DISPLAY_TIERS = PLAN_ORDER.filter((t) => t !== "enterprise") as Exclude<
  (typeof PLAN_ORDER)[number],
  "enterprise"
>[];

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="bg-background py-20 md:py-28 px-4 md:px-6 scroll-mt-14"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Pricing
          </p>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Start free. Scale when you&apos;re ready.
          </h2>
        </div>

        {/* Plan cards */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {DISPLAY_TIERS.map((tier) => {
            const plan = PLANS[tier];
            const isPopular = tier === "growth";
            return (
              <Card
                key={tier}
                className={cn(
                  "flex flex-col",
                  isPopular && "border-2 border-primary shadow-[var(--shadow-floating-small)]"
                )}
              >
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {isPopular && (
                      <Badge variant="green" className="text-[10px]">
                        Most Popular
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-6">
                    {plan.monthlyPrice === 0 ? (
                      <span className="text-3xl font-bold text-foreground">
                        Free
                      </span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-foreground">
                          ${plan.monthlyPrice}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          /month
                        </span>
                      </>
                    )}
                  </div>
                  <ul className="space-y-2.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <Check className="size-4 text-primary mt-0.5 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    variant={isPopular ? "default" : "outline"}
                    className="w-full"
                    nativeButton={false}
                    render={<Link href="/signup" />}
                  >
                    {tier === "free" ? "Start free" : "Start 14-day trial"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Enterprise */}
        <Card className="mt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 gap-4">
            <div>
              <p className="font-semibold text-foreground">
                {PLANS.enterprise.name}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {PLANS.enterprise.description}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Unlimited AI credits. SSO. Dedicated support. Custom
                integrations.
              </p>
            </div>
            <Button
              variant="outline"
              className="whitespace-nowrap"
              nativeButton={false}
              render={<a href="mailto:sales@dothesenow.com" />}
            >
              Talk to sales
              <ArrowRight className="size-3.5 ml-1.5" />
            </Button>
          </div>
        </Card>
      </div>
    </section>
  );
}
