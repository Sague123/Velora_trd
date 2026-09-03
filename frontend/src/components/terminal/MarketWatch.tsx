import { useMemo, useState } from "react";
import { useInstruments } from "../../hooks/useMarket";
import { useLiveInstruments } from "../../hooks/useLivePrices";
import { useTerminalStore } from "../../store/terminal";
import { classNames, fmtCompact, fmtPct, fmtPrice } from "../../lib/format";
import { LoadingRow, ErrorRow, EmptyRow } from "../common/States";
import { IconCoin, IconSearchDollar } from "../icons/Icon";
import type { Category } from "../../lib/types";

const CATEGORIES: Array<{ id: Category | "ALL"; label: string; Icon?: typeof IconCoin }> = [
  { id: "ALL", label: "All" },
  { id: "SPOT", label: "Spot" },
  { id: "PERP", label: "Perp" },
  { id: "COMMODITY", label: "Metals", Icon: IconCoin },
];

export function MarketWatch({ onSelect }: { onSelect?: () => void } = {}) {
  const { isLoading, isError, refetch } = useInstruments();
  const instruments = useLiveInstruments();
  const symbol = useTerminalStore((s) => s.symbol);
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "ALL">("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return instruments.filter((i) => {
      if (category !== "ALL" && i.category !== category) return false;
      if (q && !i.symbol.includes(q) && !i.name.toUpperCase().includes(q)) return false;
      return true;
    });
  }, [instruments, query, category]);

  return (
    <div className="flex h-full flex-col border-r border-line bg-bg-1">
      <div className="border-b border-line p-2">
        <div className="relative">
          <IconSearchDollar size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-txt-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск инструмента…"
            className="tap-sm w-full rounded border border-line bg-bg-2 py-1.5 pl-6 pr-2 text-2xs text-txt-0 outline-none focus:border-accent"
          />
        </div>
        <div className="mt-2 flex gap-0.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={classNames(
                "tap-sm flex flex-1 items-center justify-center gap-1 rounded px-1 py-1 text-2xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                category === c.id ? "bg-accent-soft text-accent" : "text-txt-2 hover:bg-bg-3 hover:text-txt-0"
              )}
            >
              {c.Icon && <c.Icon size={11} />}
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 border-b border-line-soft px-2 py-1.5 text-2xs text-txt-3">
        <span>Symbol</span>
        <span className="text-right">Last</span>
        <span className="text-right">24h%</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <LoadingRow label="Загрузка инструментов…" />}
        {isError && <ErrorRow label="Не удалось загрузить инструменты" onRetry={() => refetch()} />}
        {!isLoading && !isError && filtered.length === 0 && <EmptyRow label="Ничего не найдено" />}
        {!isLoading &&
          filtered.map((i) => {
            const active = i.symbol === symbol;
            const chg = i.liveChange24h;
            return (
              <button
                key={i.symbol}
                onClick={() => { setSymbol(i.symbol); onSelect?.(); }}
                className={classNames(
                  "tap-sm grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-2 border-l-2 px-2 py-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                  active ? "border-accent bg-bg-3" : "border-transparent hover:bg-bg-2"
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-txt-0">{i.symbol}</span>
                    {/* Was dead width before: the panel is resizable up to
                        420px but showed the same 3 columns regardless, so a
                        wider panel just stretched whitespace. This puts the
                        category (already fetched, never rendered) to use
                        instead of adding a whole new column. Capped to 4
                        chars and never allowed to shrink the symbol below
                        it — COMMODITY next to a longer ticker (PAXGUSDT)
                        was squeezing the symbol itself, the one thing here
                        that must never lose the fight for space. */}
                    <span className="shrink-0 rounded bg-bg-3 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-txt-3">{i.category.slice(0, 4)}</span>
                  </span>
                  <span className="block truncate text-2xs text-txt-3">{i.name}</span>
                </span>
                <span
                  className={classNames(
                    "tabular text-right text-xs transition-colors",
                    i.dir === "up" ? "flash-up text-buy" : i.dir === "down" ? "flash-down text-sell" : "text-txt-0"
                  )}
                >
                  {fmtPrice(i.livePrice, i.priceDecimals)}
                </span>
                <span
                  className={classNames(
                    "tabular w-14 rounded px-1 py-0.5 text-right text-2xs font-medium",
                    chg > 0 ? "bg-buy-soft text-buy" : chg < 0 ? "bg-sell-soft text-sell" : "text-txt-2"
                  )}
                >
                  {fmtPct(chg, 2)}
                </span>
              </button>
            );
          })}
      </div>

      {!isLoading && !isError && (
        <div className="border-t border-line px-2 py-1 text-2xs text-txt-3">
          {filtered.length} инструмент{filtered.length === 1 ? "" : "ов"} · vol{" "}
          {fmtCompact(filtered.reduce((s, i) => s + Number(i.volume24h ?? 0), 0))}
        </div>
      )}
    </div>
  );
}
