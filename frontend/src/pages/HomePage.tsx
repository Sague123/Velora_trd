import { HomeNavbar } from "../components/home/HomeNavbar";
import { HeroSection } from "../components/home/HeroSection";
import { MarketTicker } from "../components/home/landing/MarketTicker";
import { AutomatedTradingSection } from "../components/home/landing/AutomatedTradingSection";
import { SecuritySection } from "../components/home/landing/SecuritySection";
import { HowItWorksSection } from "../components/home/landing/HowItWorksSection";
import { SiteFooter } from "../components/layout/SiteFooter";

/**
 * The public exchange Home — "terminal-as-landing": the real product (a
 * marketing rendition of it, see `TerminalShowcase`) is the pitch, not a
 * stock-photo hero. Deliberately outside AppLayout/TopBar: this is the same
 * page whether or not you're signed in (like a real exchange's homepage),
 * not the authenticated dashboard (that's still Overview, reached after
 * login).
 *
 * Section order is deliberate — Hero (terminal preview) → Ticker (proof the
 * prices are real) → Automated trading → Security → How it works — each one
 * answering the question the previous section raises.
 */
export function HomePage() {
  return (
    <div className="min-h-screen bg-bg-0 text-txt-0">
      <HomeNavbar />

      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-3 py-4">
        <HeroSection />
        <MarketTicker />
        <AutomatedTradingSection />
        <SecuritySection />
        <HowItWorksSection />
      </main>

      <SiteFooter />
    </div>
  );
}
