import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveInstruments, type LiveInstrument } from "../../hooks/useLivePrices";
import { useSparkline } from "../../hooks/useSparkline";
import { useFavoritesStore } from "../../store/favorites";
import { useTerminalStore } from "../../store/terminal";
import { classNames, fmtCompact, fmtPct, fmtPrice } from "../../lib/format";
import { LoadingRow, EmptyRow } from "../common/States";
import { Sparkline } from "../common/Sparkline";
import { CoinBadge } from "../common/CoinBadge";
import { IconCandles, IconStar } from "../icons/Icon";

type Tab = "ALL" | "FAVORITES" | "USDT" | "USDC" | "BTC" | "ETH" | "NEW" | "GAINERS" | "LOSERS";

/** Which asset an instrument is quoted in, from its own symbol — not stored
 * anywhere else. Perpetuals (BTC-PERP etc.) are USD-margined, not quoted in
 * USDT/USDC/BTC/ETH, so they only ever show up under All/Favorites/New/
 * Gainers/Losers, never under a specific quote-asset tab — that's accurate,
 * not a bug, given what's actually in the catalog. */
function quoteAssetOf(symbol: string): string | null {
  if (symbol.endsWith("-PERP")) return null;
  if (symbol.endsWith("USDT")) return "USDT";
  if (symbol.endsWith("USDC")) return "USDC";
  if (symbol.endsWith("BTC")) return "BTC";
  if (symbol.endsWith("ETH")) return "ETH";
  return null;
}

function Row({ inst, onTrade }: { inst: LiveInstrument; onTrade: (symbol: string) => void }) {
  const { t } = useTranslation();
  const favorite = useFavoritesStore((s) => s.isFavorite(inst.symbol));
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const { data: spark } = useSparkline(inst.symbol, inst.category);
  const up = inst.liveChange24h >= 0;

  return (
    <tr className="group border-b border-line-soft/60 tabular hover:bg-bg-2/60">
      <td className="w-8 py-2 pl-3">
        <button
          onClick={() => toggleFavorite(inst.symbol)}
          className={classNames("btn-fx transition-colors", favorite ? "text-warn" : "text-txt-3 opacity-0 hover:text-warn group-hover:opacity-100")}
          aria-label="favorite"
        >
          <IconStar size={13} />
        </button>
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <CoinBadge symbol={inst.symbol} size={22} />
          <div>
            <div className="font-medium text-txt-0">{inst.symbol}</div>
            <div className="text-2xs text-txt-3">{inst.name}</div>
          </div>
        </div>
      </td>
      <td className={classNames("px-2 py-2 text-right", inst.dir === "up" ? "text-buy" : inst.dir === "down" ? "text-sell" : "text-txt-0")}>
        {fmtPrice(inst.livePrice, inst.priceDecimals)}
      </td>
      <td className={classNames("px-2 py-2 text-right", up ? "text-buy" : "text-sell")}>{fmtPct(inst.liveChange24h)}</td>
      <td className="hidden px-2 py-2 text-right text-txt-1 lg:table-cell">{fmtPrice(inst.liveHigh24h, inst.priceDecimals)}</td>
      <td className="hidden px-2 py-2 text-right text-txt-1 lg:table-cell">{fmtPrice(inst.liveLow24h, inst.priceDecimals)}</td>
      <td className="hidden px-2 py-2 text-right text-txt-1 md:table-cell">{fmtCompact(inst.volume24h)}</td>
      <td className="hidden px-2 py-1 md:table-cell">
        <Sparkline values={spark ?? undefined} positive={up} width={80} height={24} />
      </td>
      <td className="py-2 pl-2 pr-3 text-right">
        <button
          onClick={() => onTrade(inst.symbol)}
          className="btn-fx rounded border border-line px-2.5 py-1 text-2xs font-medium text-txt-1 hover:border-accent hover:bg-accent-soft hover:text-accent"
        >
          {t("home.trade")}
        </button>
      </td>
    </tr>
  );
}

export function MarketsTableSection({ query }: { query: string }) {
  const { t } = useTranslation();
  const instruments = useLiveInstruments();
  const favorites = useFavoritesStore((s) => s.symbols);
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("ALL");

  function onTrade(symbol: string) {
    setSymbol(symbol);
    navigate("/terminal");
  }

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "ALL", label: t("home.tabAll") },
    { id: "FAVORITES", label: t("home.tabFavorites") },
    { id: "USDT", label: "USDT" },
    { id: "USDC", label: "USDC" },
    { id: "BTC", label: "BTC" },
    { id: "ETH", label: "ETH" },
    { id: "NEW", label: t("home.tabNew") },
    { id: "GAINERS", label: t("home.tabGainers") },
    { id: "LOSERS", label: t("home.tabLosers") },
  ];

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = instruments.filter((i) => {
      if (q && !i.symbol.includes(q) && !i.name.toUpperCase().includes(q)) return false;
      if (tab === "FAVORITES") return favorites.includes(i.symbol);
      if (tab === "USDT" || tab === "USDC" || tab === "BTC" || tab === "ETH") return quoteAssetOf(i.symbol) === tab;
      if (tab === "GAINERS") return i.liveChange24h > 0;
      if (tab === "LOSERS") return i.liveChange24h < 0;
      return true;
    });
    if (tab === "GAINERS") list = [...list].sort((a, b) => b.liveChange24h - a.liveChange24h);
    else if (tab === "LOSERS") list = [...list].sort((a, b) => a.liveChange24h - b.liveChange24h);
    else if (tab === "NEW") list = [...list].reverse();
    return list;
  }, [instruments, query, tab, favorites]);

  const isQuoteTab = tab === "USDT" || tab === "USDC" || tab === "BTC" || tab === "ETH";

  return (
    <div className="anim-rise-1 flex flex-col overflow-hidden rounded-lg border border-line bg-bg-1">
      <div className="flex items-center gap-1.5 border-b border-line-soft px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-txt-2">
        <IconCandles size={13} className="text-accent" /> {t("nav.markets")}
      </div>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={classNames(
              // py-1.5/px-3: these filters are the primary control on a public
              // page, where the terminal's 22px density reads as cramped.
              "shrink-0 rounded-full px-3 py-1.5 text-2xs font-medium transition-colors",
              tab === tb.id ? "bg-accent-fill text-white" : "text-txt-2 hover:bg-bg-2 hover:text-txt-0"
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Only cap the height (and scroll internally) once there's a real
          desktop viewport to do it in. On a phone a nested scroll box inside
          the page is a trap: the table swallows the swipe and the page itself
          won't move, so it just lets the whole list extend and the document
          scroll normally. */}
      <div className="overflow-x-auto lg:max-h-[68vh] lg:overflow-y-auto">
        {instruments.length === 0 && <LoadingRow />}
        {instruments.length > 0 && rows.length === 0 && tab === "FAVORITES" && <EmptyRow label={t("home.noFavorites")} />}
        {instruments.length > 0 && rows.length === 0 && isQuoteTab && <EmptyRow label={t("home.noQuoteInstruments", { quote: tab })} />}
        {instruments.length > 0 && rows.length === 0 && !isQuoteTab && tab !== "FAVORITES" && <EmptyRow label="—" />}
        {rows.length > 0 && (
          <table className="w-full min-w-[720px] text-xs">
            <thead className="sticky top-0 z-10 bg-bg-1">
              <tr className="border-b border-line text-left">
                <th className="w-8"></th>
                <th className="px-2 py-2 font-medium text-txt-3">{t("home.colPair")}</th>
                <th className="px-2 py-2 text-right font-medium text-txt-3">{t("home.colPrice")}</th>
                <th className="px-2 py-2 text-right font-medium text-txt-3">{t("home.colChange")}</th>
                <th className="hidden px-2 py-2 text-right font-medium text-txt-3 lg:table-cell">{t("home.colHigh")}</th>
                <th className="hidden px-2 py-2 text-right font-medium text-txt-3 lg:table-cell">{t("home.colLow")}</th>
                <th className="hidden px-2 py-2 text-right font-medium text-txt-3 md:table-cell">{t("home.colVolume")}</th>
                <th className="hidden px-2 py-2 md:table-cell"></th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <Row key={i.symbol} inst={i} onTrade={onTrade} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
