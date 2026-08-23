import { useMemo, useState } from "react";
import { useLiveInstruments } from "../../hooks/useLivePrices";
import { classNames, fmtPct, fmtPrice } from "../../lib/format";

/** A compact, always-visible instrument list for choosing which pair a bot
 * trades — kept separate from the settings form so picking the coin doesn't
 * get lost among numeric fields. */
export function CoinPicker({ value, onChange }: { value: string; onChange: (symbol: string) => void }) {
  const instruments = useLiveInstruments();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return instruments;
    return instruments.filter((i) => i.symbol.includes(q) || i.name.toUpperCase().includes(q));
  }, [instruments, query]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-line-soft bg-bg-2/20">
      <div className="shrink-0 border-b border-line-soft p-2">
        <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">Инструмент</div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск…"
          className="w-full rounded border border-line bg-bg-2 px-2 py-1.5 text-2xs outline-none focus:border-accent"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.map((i) => {
          const active = i.symbol === value;
          return (
            <button
              key={i.symbol}
              onClick={() => onChange(i.symbol)}
              className={classNames(
                "grid w-full grid-cols-[1fr_auto] items-center gap-x-2 border-l-2 px-2.5 py-1.5 text-left transition-colors",
                active ? "border-accent bg-bg-3" : "border-transparent hover:bg-bg-2"
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-txt-0">{i.symbol}</span>
                <span className="block truncate text-2xs text-txt-3">{i.name}</span>
              </span>
              <span className="text-right">
                <span className="block tabular text-2xs text-txt-1">{fmtPrice(i.livePrice, i.priceDecimals)}</span>
                <span className={classNames("block tabular text-2xs", i.liveChange24h >= 0 ? "text-buy" : "text-sell")}>{fmtPct(i.liveChange24h)}</span>
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && <div className="px-3 py-6 text-center text-2xs text-txt-3">Ничего не найдено</div>}
      </div>
    </div>
  );
}
