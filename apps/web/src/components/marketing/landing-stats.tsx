import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const STATS = [
  {
    number: "80%",
    text: "of marketers feel pressure to use AI.",
    source: "Supermetrics, 2026",
  },
  {
    number: "6%",
    text: "have actually embedded it in their workflow.",
    source: "Supermetrics, 2026",
  },
  {
    number: "74%",
    text: "are stuck in between — wanting to use AI but not knowing what to do with it.",
    source: null,
  },
] as const;

export function StatsSection() {
  return (
    <section className="bg-background py-20 md:py-28 px-4 md:px-6">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          The Gap
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {STATS.map((stat) => (
            <Card key={stat.number}>
              <CardContent className="pt-6">
                <p className="text-5xl font-bold text-primary">{stat.number}</p>
                <p className="mt-2 text-base text-muted-foreground">
                  {stat.text}
                </p>
                {stat.source && (
                  <p className="mt-1 text-xs text-muted-foreground/70 italic">
                    — {stat.source}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <p className="text-base text-foreground">
            DoTheseNow closes that gap. Strategy in. Daily tasks out. Results
            back.
          </p>
          <a
            href="#the-loop"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent-blue)] hover:underline whitespace-nowrap"
          >
            See how it works
            <ArrowRight className="size-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
