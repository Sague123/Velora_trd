import { useState } from "react";
import { HomeNavbar } from "../components/home/HomeNavbar";
import { HeroSection } from "../components/home/HeroSection";
import { MarketOverviewStrip } from "../components/home/MarketOverviewStrip";
import { MarketsTableSection } from "../components/home/MarketsTableSection";
import { TrendingStrip } from "../components/home/TrendingStrip";
import { MarketNewsSection } from "../components/home/MarketNewsSection";
import { ProductHighlightCard } from "../components/home/ProductHighlightCard";

/**
 * The public exchange Home — market state and Velora's positioning at a
 * glance, then straight to trading. Deliberately outside AppLayout/TopBar:
 * this is the same page whether or not you're signed in (like a real
 * exchange's homepage), not the authenticated dashboard (that's still
 * Overview, reached after login). Shares Overview's visual language
 * (hero-glow, gradient-text, cta-pill) rather than inventing a new one.
 */
export function HomePage() {
  const [query, setQuery] = useState("");

  return (
    <div className="min-h-screen bg-bg-0 text-txt-0">
      <HomeNavbar query={query} onQueryChange={setQuery} />

      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-3 py-4">
        <HeroSection />
        <MarketOverviewStrip />
        <TrendingStrip />

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_300px]">
          <MarketsTableSection query={query} />
          <div className="flex flex-col gap-3">
            <ProductHighlightCard />
            <MarketNewsSection />
          </div>
        </div>
      </main>
    </div>
  );
}
