import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppLogo } from "@/components/ui/app-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LOOP_STEPS = ["Analyze", "Plan", "Execute", "Measure", "Refine"] as const;

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center bg-[var(--landing-dark-bg)] text-[var(--landing-dark-text)] px-4 md:px-6 pt-14">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-white">
          Know what to do next.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
          AI turns your marketing strategy into today&apos;s tasks — then
          executes them for you.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
          <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
            Start free
          </Button>
          <a
            href="#the-loop"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/70 hover:text-white transition-colors"
          >
            Watch the loop
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>

      {/* Loop diagram */}
      <div className="mt-16 md:mt-24 w-full max-w-2xl mx-auto" aria-hidden="true">
        <div className="flex items-center justify-between gap-2">
          {LOOP_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-xs md:text-sm font-semibold border-2",
                    i === 0
                      ? "bg-primary text-primary-foreground border-primary shadow-[var(--landing-primary-glow)]"
                      : "border-white/20 text-white/60"
                  )}
                >
                  {i + 1}
                </div>
                <span className="text-[10px] md:text-xs text-white/50 font-medium">
                  {step}
                </span>
              </div>
              {i < LOOP_STEPS.length - 1 && (
                <div className="hidden sm:block w-6 md:w-10 h-px bg-white/15 mb-5" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCtaSection() {
  return (
    <section className="bg-[var(--landing-dark-bg)] text-[var(--landing-dark-text)] py-20 md:py-28 px-4 md:px-6">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
          80% of marketers want AI to work.
          <br className="hidden sm:block" /> 6% have figured it out.
        </h2>
        <p className="mt-4 text-xl text-white/70">Join the 6%.</p>
        <div className="mt-8">
          <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
            Start free
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-[var(--landing-dark-bg)] border-t border-white/10 px-4 md:px-6 py-8">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <AppLogo className="text-white/70" size="sm" />
        <div className="flex items-center gap-6 text-xs text-white/40">
          <Link href="/login" className="hover:text-white/70 transition-colors">
            Log in
          </Link>
          <span>&copy; {new Date().getFullYear()} DoTheseNow</span>
        </div>
      </div>
    </footer>
  );
}
