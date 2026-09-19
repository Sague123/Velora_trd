import { HomeNavbar } from "../components/home/HomeNavbar";
import { HeroSection } from "../components/home/HeroSection";
import { AutomatedTradingSection } from "../components/home/landing/AutomatedTradingSection";
import { SecuritySection } from "../components/home/landing/SecuritySection";
import { HowItWorksSection } from "../components/home/landing/HowItWorksSection";
import { FinalCtaSection } from "../components/home/landing/FinalCtaSection";
import { SiteFooter } from "../components/layout/SiteFooter";

/**
 * The public exchange Home — "terminal-as-landing": the real product is the
 * pitch, not a stock-photo hero or an illustrated mockup of one. Deliberately
 * outside AppLayout/TopBar: this is the same page whether or not you're
 * signed in (like a real exchange's homepage), not the authenticated
 * dashboard (that's still Overview, reached after login).
 *
 * `HeroSection` is full-bleed on purpose (it renders its own market ticker
 * fused to its bottom edge) — everything below it lives inside the page's
 * normal measure, but each section composes itself differently. The one
 * rule that isn't optional: no two sections share the same container shape.
 * Reaching for "just wrap it in another rounded-xl border card" is exactly
 * the pattern that made this page read as a dashboard before this pass.
 */
export function HomePage() {
  return (
    <div className="min-h-screen bg-bg-0 text-txt-0">
      <HomeNavbar />
      <HeroSection />

      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-4 py-10 sm:gap-14 sm:py-14">
        <AutomatedTradingSection />
        <SecuritySection />
        <HowItWorksSection />
      </main>

      <FinalCtaSection />
      <SiteFooter />
    </div>
  );
}
