import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInstruments } from "../hooks/useMarket";
import { useLiveInstruments } from "../hooks/useLivePrices";
import { useTerminalStore } from "../store/terminal";
import { useFavoritesStore } from "../store/favorites";
import { classNames, fmtCompact, fmtPct, fmtPrice } from "../lib/format";
import { ErrorRow, EmptyRow, SkeletonBar, SkeletonTableRows } from "../components/common/States";
import { IconCoin, IconStar } from "../components/icons/Icon";
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

type SortKey = "symbol" | "price" | "change" | "volume" | "high" | "low" | "leverage";

/** The subset worth offering on a phone, where there are no column headers to
 * click. Each carries the direction that answers the question people actually
 * ask of it — biggest volume, biggest movers, most expensive, A→Z — and the
 * arrow button beside the select flips any of them. */
const MOBILE_SORTS: { key: SortKey; dir: 1 | -1; label: string }[] = [
  { key: "volume", dir: -1, label: "По объёму" },
  { key: "change", dir: -1, label: "По изменению" },
  { key: "price", dir: -1, label: "По цене" },
  { key: "symbol", dir: 1, label: "По алфавиту" },
];

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
  // Subscribe to the array, not to isFavorite() — the selector has to be the
  // thing that changes, or starring a row wouldn't re-render the list.
  const favoriteSymbols = useFavoritesStore((s) => s.symbols);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const favorites = useMemo(() => new Set(favoriteSymbols), [favoriteSymbols]);

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
      // High/Low are null until a real feed fills them; Number(null) is 0,
      // which would sort every unpriced row together at one end rather than
      // pretending they are worth nothing.
      if (sortKey === "high") { av = Number(a.liveHigh24h ?? 0); bv = Number(b.liveHigh24h ?? 0); }
      if (sortKey === "low") { av = Number(a.liveLow24h ?? 0); bv = Number(b.liveLow24h ?? 0); }
      if (sortKey === "leverage") { av = a.maxLeverage; bv = b.maxLeverage; }
      return sortDir * (av - bv);
    });
    return list;
  }, [instruments, query, category, sortKey, sortDir]);

  // Starred pairs ride above the list, in the same sort order as everything
  // else — pinning them is about finding them, not about reordering them.
  const favRows = useMemo(() => rows.filter((i) => favorites.has(i.symbol)), [rows, favorites]);
  const restRows = useMemo(() => rows.filter((i) => !favorites.has(i.symbol)), [rows, favorites]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  }

  function openInTerminal(symbol: string) {
    setSymbol(symbol);
    navigate("/terminal");
  }

  const StarButton = ({ symbol, className }: { symbol: string; className?: string }) => {
    const on = favorites.has(symbol);
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleFavorite(symbol); }}
        aria-pressed={on}
        title={on ? "Убрать из избранного" : "В избранное"}
        className={classNames(
          "btn-fx tap-sm rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          on ? "text-warn" : "text-txt-3 hover:text-txt-1",
          className,
        )}
      >
        {/* Filled when starred, outline when not — the fill is what reads as
            "on" at this size; colour alone would not. */}
        <IconStar size={14} className={on ? "fill-warn" : undefined} />
      </button>
    );
  };

  /** Labels the two blocks, but only once there is a second block to tell the
   * first one apart from. */
  const GroupRow = ({ label, count }: { label: string; count: number }) => (
    <tr className="bg-bg-2/40">
      <td colSpan={10} className="px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-txt-3">
        {label} <span className="font-normal text-txt-3">· {count}</span>
      </td>
    </tr>
  );

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

        {/* Phone-only: the card layout below `sm` has no column headers to
            click, so without this the list could be filtered and searched but
            never reordered. The arrow flips direction, which is what turns
            "по изменению" from top gainers into top losers. */}
        <div className="flex items-center gap-1 sm:hidden">
          <select
            value={sortKey}
            onChange={(e) => {
              const next = MOBILE_SORTS.find((s) => s.key === e.target.value);
              if (!next) return;
              setSortKey(next.key);
              setSortDir(next.dir);
            }}
            className={fieldCls("sm", "tap-sm w-auto")}
            aria-label="Сортировка"
          >
            {MOBILE_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            {/* Whatever a desktop header set, so the select never shows a
                value that isn't the one actually in force. */}
            {!MOBILE_SORTS.some((s) => s.key === sortKey) && <option value={sortKey}>—</option>}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === 1 ? -1 : 1))}
            title={sortDir === 1 ? "По возрастанию" : "По убыванию"}
            className="btn-fx tap-sm rounded border border-line px-2 text-2xs text-txt-2 hover:text-txt-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {sortDir === 1 ? "▲" : "▼"}
          </button>
        </div>

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
              {!isLoading && (() => {
                // The star has to be its own button, so the card can no longer
                // *be* one — a button inside a button is invalid markup and
                // the inner one stops being reachable. The row is a flex pair
                // instead: tap area on the left, star on the right.
                const card = (i: (typeof rows)[number]) => (
                  <div key={i.symbol} className="flex items-stretch border-b border-line-soft/60">
                    <button
                      onClick={() => openInTerminal(i.symbol)}
                      className="tap-sm flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5 text-left hover:bg-bg-2/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
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
                      <div className="flex items-center justify-between gap-2 text-2xs text-txt-2">
                        <span className="truncate">{i.name}</span>
                        <span className={classNames("shrink-0 tabular font-medium", i.liveChange24h >= 0 ? "text-buy" : "text-sell")}>{fmtPct(i.liveChange24h)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-txt-3 tabular">
                        <span>H <span className="text-txt-2">{fmtPrice(i.liveHigh24h, i.priceDecimals)}</span></span>
                        <span>L <span className="text-txt-2">{fmtPrice(i.liveLow24h, i.priceDecimals)}</span></span>
                        <span>Vol <span className="text-txt-2">{fmtCompact(i.volume24h)}</span></span>
                        <span>Max <span className="text-txt-2">{i.maxLeverage}x</span></span>
                      </div>
                    </button>
                    <StarButton symbol={i.symbol} className="shrink-0 px-3" />
                  </div>
                );
                const heading = (label: string, count: number) => (
                  <div className="bg-bg-2/40 px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-txt-3">
                    {label} <span className="font-normal">· {count}</span>
                  </div>
                );
                return (
                  <>
                    {favRows.length > 0 && (
                      <>
                        {heading("Избранное", favRows.length)}
                        {favRows.map(card)}
                        {restRows.length > 0 && heading("Все инструменты", restRows.length)}
                      </>
                    )}
                    {restRows.map(card)}
                  </>
                );
              })()}
            </div>

            {/* `sm` and up: unchanged desktop table. */}
            <div className="hidden sm:block">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="sticky top-0 bg-bg-1">
                  <tr className="border-b border-line text-left">
                    <th className="w-8 px-2 py-2"></th>
                    <SortHeader id="symbol" label="Instrument" />
                    <th className="px-3 py-2 font-medium text-txt-3">Category</th>
                    <SortHeader id="price" label="Last Price" align="right" />
                    <SortHeader id="change" label="24h Change" align="right" />
                    <SortHeader id="high" label="24h High" align="right" />
                    <SortHeader id="low" label="24h Low" align="right" />
                    <SortHeader id="volume" label="24h Volume" align="right" />
                    <SortHeader id="leverage" label="Max Lev." align="right" />
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <SkeletonTableRows columns={10} />}
                  {!isLoading && favRows.length > 0 && (
                    <>
                      <GroupRow label="Избранное" count={favRows.length} />
                      {favRows.map(renderRow)}
                      {restRows.length > 0 && <GroupRow label="Все инструменты" count={restRows.length} />}
                    </>
                  )}
                  {!isLoading && restRows.map(renderRow)}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

    </Page>
  );

  /** Declared after the return (hoisted) so the table markup above stays
   *  readable top-to-bottom; both the favourites block and the main list
   *  render through it, so the two can never drift apart. */
  function renderRow(i: (typeof rows)[number]) {
    return (
      <tr key={i.symbol} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
        <td className="px-2 py-2 text-center">
          <StarButton symbol={i.symbol} />
        </td>
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
    );
  }
}
