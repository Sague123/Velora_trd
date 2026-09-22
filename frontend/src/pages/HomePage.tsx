import { HomeNavbar } from "../components/home/HomeNavbar";
import { HeroSection } from "../components/home/landing/HeroSection";
import { ArsenalSection } from "../components/home/landing/ArsenalSection";
import { JourneySection } from "../components/home/landing/JourneySection";
import { MarketsSection } from "../components/home/landing/MarketsSection";
import { SupportSection } from "../components/home/landing/SupportSection";
import { FinalCtaSection } from "../components/home/landing/FinalCtaSection";
import { SiteFooter } from "../components/layout/SiteFooter";

/**
 * The public landing. Deliberately outside AppLayout/TopBar: the same page
 * whether or not you're signed in, not the authenticated dashboard.
 *
 * Every section is drawn from one vocabulary (`landing/primitives.tsx`) —
 * the signature line, grid levels, nodes, technical labels — and none of it
 * is a screenshot. Sections alternate bg-0 / bg-1 and are numbered 01–05, so
 * the page reads as one system rather than a stack of cards.
 */
export function HomePage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-bg-0 text-txt-0">
      <HomeNavbar />
      <main>
        <HeroSection />
        <ArsenalSection />
        <JourneySection />
        <MarketsSection />
        <SupportSection />
        <FinalCtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
