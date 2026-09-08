import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInstruments } from "../hooks/useMarket";
import { useLiveInstruments } from "../hooks/useLivePrices";
import { useTerminalStore } from "../store/terminal";
import { classNames, fmtCompact, fmtPct, fmtPrice } from "../lib/format";
import { ErrorRow, EmptyRow, SkeletonBar, SkeletonTableRows } from "../components/common/States";
import { IconCoin } from "../components/icons/Icon";
import type { Category } from "../lib/types";
import { Page } from "../components/layout/Page";
import { Tooltip } from "../components/common/Tooltip";
import { fieldCls } from "../lib/ui";
import { Tabs } from "../components/common/Tabs";

// Same disclosure ChartPanel already shows on an instrument's own chart —
// repeated here because this table is the other place a trader sees a PERP
// row priced identically to its SPOT counterpart with nothing to explain
// why. Without it, "BTC-PERP" next to "BTCUSDT" showing the exact same
// H/L/Vol just reads as duplicated/broken data.
const SPOT_BASED_LABEL = "Цена базового актива (спот): фьючерсный фид недоступен из региона сервера, поэтому маркировка перпетуала следует за спотом. Данные биржевые, но это не котировка фьючерса.";

function SourceBadge({ source }: { source: string }) {
  if (source === "DERIVED") {
    return (
      <Tooltip label={SPOT_BASED_LABEL}>
        <span className="shrink-0 rounded border border-accent/40 bg-accent-soft px-1 py-px text-3xs text-accent">spot-based</span>
      </Tooltip>
    );
  }
  return null;
}

const CATEGORIES: Array<{ id: Category | "ALL"; label: string; Icon?: typeof IconCoin }> = [
  { id: "ALL", label: "All" },
  { id: "SPOT", label: "Spot" },
  { id: "PERP", label: "Perpetual" },
  { id: "COMMODITY", label: "Precious Metals", Icon: IconCoin },
];

type SortKey = "symbol" | "price" | "change" | "volume";

export function MarketsPage() {
  const { t } = useTranslation();
  const { isLoading, isError, refetch, data } = useInstruments();
  const instruments = useLiveInstruments();
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = instruments.filter((i) => {
      if (category !== "ALL" && i.category !== category) return false;
      if (q && !i.symbol.includes(q) && !i.name.toUpperCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === "symbol") return sortDir * a.symbol.localeCompare(b.symbol);
      if (sortKey === "price") { av = Number(a.livePrice); bv = Number(b.livePrice); }
      if (sortKey === "change") { av = a.liveChange24h; bv = b.liveChange24h; }
      if (sortKey === "volume") { av = Number(a.volume24h ?? 0); bv = Number(b.volume24h ?? 0); }
      return sortDir * (av - bv);
    });
    return list;
  }, [instruments, query, category, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  }

  function openInTerminal(symbol: string) {
    setSymbol(symbol);
    navigate("/terminal");
  }

  const SortHeader = ({ id, label, align = "left" }: { id: SortKey; label: string; align?: "left" | "right" }) => (
    <th
      onClick={() => toggleSort(id)}
      className={classNames("cursor-pointer select-none px-3 py-2 font-medium text-txt-3 hover:text-txt-0", align === "right" && "text-right")}
    >
      {label} {sortKey === id && (sortDir === 1 ? "▲" : "▼")}
    </th>
  );

  return (
    // Scrolls as a page rather than pinning a fixed-height table with its own
    // inner scrollbar — that way the list has a real end, and the footer below
    // marks it. This element is also what the table's sticky header anchors
    // to, so nothing between it and the <thead> may create its own scroll box.
    <Page>
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <h1 className="mr-2 text-sm font-semibold text-txt-0">{t("nav.markets")}</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("markets.searchPlaceholder")}
          className={fieldCls("md", "tap-sm w-56 max-w-full")}
        />
        <Tabs
          items={CATEGORIES.map((c) => ({ id: c.id, label: c.label, Icon: c.Icon }))}
          value={category}
          onChange={setCategory}
        />
        {data && (
          <span className="ml-auto text-2xs text-txt-3">
            Фид: {data.feed.healthy ? <span className="text-buy">live</span> : <span className="text-warn">stale</span>}
            {data.feed.lastFetch && <span> · обновлён {new Date(data.feed.lastFetch).toLocaleTimeString()}</span>}
          </span>
        )}
      </div>

      {category === "COMMODITY" && (
        <div className="mb-3 shrink-0 rounded border border-line-soft bg-bg-2/40 px-3 py-1.5 text-2xs text-txt-3">
          Реальные золото-обеспеченные токены на Binance (PAX Gold, Tether Gold) — своя реальная рыночная цена и график. Биржевых акций и индексов
          у Binance нет как публичного бесплатного фида, поэтому они не представлены здесь — платформа не подделывает такие данные.
        </div>
      )}

      {/* Deliberately no overflow-* here: any scroll container between the
          sticky <thead> and the page scroller would become the header's
          anchor, and this box never scrolls vertically, so the header would
          just slide away. Horizontal overflow is handled by the page
          container instead, which keeps the header pinned to the viewport. */}
      <div className="rounded-lg border border-line bg-bg-1">
        {isError && <ErrorRow label="Не удалось загрузить инструменты" onRetry={() => refetch()} />}
        {!isError && !isLoading && rows.length === 0 && <EmptyRow label="Ничего не найдено" />}

        {!isError && (isLoading || rows.length > 0) && (
          <>
            {/* Below `sm`: stacked cards instead of the 9-column table — the
                table's own min-w-[760px] used to force the whole page to
                scroll sideways on a phone (confirmed: scrollWidth 773 vs a
                390px viewport), dragging the search bar and filters out of
                view along with it. Every column the desktop table shows is
                still here, just reflowed instead of dropped. The whole card
                is the tap target (matching what the desktop row already
                does functionally via its Trade button, just easier to hit). */}
            <div className="sm:hidden">
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border-b border-line-soft/60 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <SkeletonBar width="35%" height={12} />
                      <SkeletonBar width="20%" height={12} />
                    </div>
                    <div className="mt-1.5"><SkeletonBar width="50%" height={9} /></div>
                  </div>
                ))}
              {!isLoading &&
                rows.map((i) => (
                  <button
                    key={i.symbol}
                    onClick={() => openInTerminal(i.symbol)}
                    className="tap-sm flex w-full flex-col gap-1 border-b border-line-soft/60 px-3 py-2.5 text-left hover:bg-bg-2/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-txt-0">{i.symbol}</span>
                        <span className="shrink-0 rounded bg-bg-3 px-1 py-px text-3xs font-medium uppercase tracking-wide text-txt-3">{i.category.slice(0, 4)}</span>
                        <SourceBadge source={i.source} />
                      </div>
                      <span className={classNames("shrink-0 tabular text-xs font-semibold", i.dir === "up" ? "text-buy" : i.dir === "down" ? "text-sell" : "text-txt-0")}>
                        {fmtPrice(i.livePrice, i.priceDecimals)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-2xs text-txt-2">
                      <span className="truncate">{i.name}</span>
                      <span className={classNames("tabular font-medium", i.liveChange24h >= 0 ? "text-buy" : "text-sell")}>{fmtPct(i.liveChange24h)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-txt-3 tabular">
                      <span>H <span className="text-txt-2">{fmtPrice(i.liveHigh24h, i.priceDecimals)}</span></span>
                      <span>L <span className="text-txt-2">{fmtPrice(i.liveLow24h, i.priceDecimals)}</span></span>
                      <span>Vol <span className="text-txt-2">{fmtCompact(i.volume24h)}</span></span>
                      <span>Max <span className="text-txt-2">{i.maxLeverage}x</span></span>
                    </div>
                  </button>
                ))}
            </div>

            {/* `sm` and up: unchanged desktop table. */}
            <div className="hidden sm:block">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="sticky top-0 bg-bg-1">
                  <tr className="border-b border-line text-left">
                    <SortHeader id="symbol" label="Instrument" />
                    <th className="px-3 py-2 font-medium text-txt-3">Category</th>
                    <SortHeader id="price" label="Last Price" align="right" />
                    <SortHeader id="change" label="24h Change" align="right" />
                    <th className="px-3 py-2 text-right font-medium text-txt-3">24h High</th>
                    <th className="px-3 py-2 text-right font-medium text-txt-3">24h Low</th>
                    <SortHeader id="volume" label="24h Volume" align="right" />
                    <th className="px-3 py-2 text-right font-medium text-txt-3">Max Lev.</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <SkeletonTableRows columns={9} />}
                  {!isLoading && rows.map((i) => (
                    <tr key={i.symbol} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
                      <td className="px-3 py-2">
                        <div className="font-medium text-txt-0">{i.symbol}</div>
                        <div className="text-2xs text-txt-3">{i.name}</div>
                      </td>
                      <td className="px-3 py-2 text-txt-2">
                        <div className="flex items-center gap-1.5">
                          {i.category}
                          <SourceBadge source={i.source} />
                        </div>
                      </td>
                      <td className={classNames("px-3 py-2 text-right", i.dir === "up" ? "text-buy" : i.dir === "down" ? "text-sell" : "text-txt-0")}>
                        {fmtPrice(i.livePrice, i.priceDecimals)}
                      </td>
                      <td className={classNames("px-3 py-2 text-right", i.liveChange24h >= 0 ? "text-buy" : "text-sell")}>{fmtPct(i.liveChange24h)}</td>
                      <td className="px-3 py-2 text-right text-txt-1">{fmtPrice(i.liveHigh24h, i.priceDecimals)}</td>
                      <td className="px-3 py-2 text-right text-txt-1">{fmtPrice(i.liveLow24h, i.priceDecimals)}</td>
                      <td className="px-3 py-2 text-right text-txt-1">{fmtCompact(i.volume24h)}</td>
                      <td className="px-3 py-2 text-right text-txt-1">{i.maxLeverage}x</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => openInTerminal(i.symbol)} className="btn-fx rounded border border-line px-2.5 py-1 text-2xs text-txt-1 hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                          Trade
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

    </Page>
  );
}
