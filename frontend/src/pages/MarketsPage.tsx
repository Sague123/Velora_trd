import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInstruments } from "../hooks/useMarket";
import { useLiveInstruments } from "../hooks/useLivePrices";
import { useTerminalStore } from "../store/terminal";
import { classNames, fmtCompact, fmtPct, fmtPrice } from "../lib/format";
import { LoadingRow, ErrorRow, EmptyRow } from "../components/common/States";
import { IconCoin } from "../components/icons/Icon";
import type { Category } from "../lib/types";
import { SiteFooter } from "../components/layout/SiteFooter";

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
    <div className="h-full overflow-auto p-3">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <h1 className="mr-2 text-sm font-semibold text-txt-0">{t("nav.markets")}</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("markets.searchPlaceholder")}
          className="w-56 rounded border border-line bg-bg-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
        />
        <div className="flex gap-0.5 rounded border border-line p-0.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={classNames(
                "flex items-center gap-1 rounded px-2.5 py-1 text-2xs font-medium",
                category === c.id ? "bg-accent-soft text-accent" : "text-txt-2 hover:text-txt-0"
              )}
            >
              {c.Icon && <c.Icon size={11} />}
              {c.label}
            </button>
          ))}
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
        {isLoading && <LoadingRow label="Загрузка инструментов…" />}
        {isError && <ErrorRow label="Не удалось загрузить инструменты" onRetry={() => refetch()} />}
        {!isLoading && !isError && rows.length === 0 && <EmptyRow label="Ничего не найдено" />}
        {!isLoading && !isError && rows.length > 0 && (
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
              {rows.map((i) => (
                <tr key={i.symbol} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
                  <td className="px-3 py-2">
                    <div className="font-medium text-txt-0">{i.symbol}</div>
                    <div className="text-2xs text-txt-3">{i.name}</div>
                  </td>
                  <td className="px-3 py-2 text-txt-2">{i.category}</td>
                  <td className={classNames("px-3 py-2 text-right", i.dir === "up" ? "text-buy" : i.dir === "down" ? "text-sell" : "text-txt-0")}>
                    {fmtPrice(i.livePrice, i.priceDecimals)}
                  </td>
                  <td className={classNames("px-3 py-2 text-right", i.liveChange24h >= 0 ? "text-buy" : "text-sell")}>{fmtPct(i.liveChange24h)}</td>
                  <td className="px-3 py-2 text-right text-txt-1">{fmtPrice(i.liveHigh24h, i.priceDecimals)}</td>
                  <td className="px-3 py-2 text-right text-txt-1">{fmtPrice(i.liveLow24h, i.priceDecimals)}</td>
                  <td className="px-3 py-2 text-right text-txt-1">{fmtCompact(i.volume24h)}</td>
                  <td className="px-3 py-2 text-right text-txt-1">{i.maxLeverage}x</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => openInTerminal(i.symbol)} className="rounded border border-line px-2.5 py-1 text-2xs text-txt-1 hover:border-accent hover:text-accent">
                      Trade
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SiteFooter compact />
    </div>
  );
}
