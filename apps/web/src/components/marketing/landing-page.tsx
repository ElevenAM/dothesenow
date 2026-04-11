import { LandingNav } from "./landing-nav";
import { HeroSection, FinalCtaSection, Footer } from "./landing-hero";
import { StatsSection } from "./landing-stats";
import {
  LoopSection,
  ComparisonSection,
  FeaturesSection,
  IntegrationsSection,
} from "./landing-features";
import {
  TestimonialsSection,
  PricingSection,
} from "./landing-social-pricing";

export function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <LandingNav />
      <main>
        <HeroSection />
        <StatsSection />
        <LoopSection />
        <ComparisonSection />
        <FeaturesSection />
        <IntegrationsSection />
        <TestimonialsSection />
        <PricingSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
}
