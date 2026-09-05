import { useState } from "react";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { classNames, fmtPct, fmtPrice } from "../../lib/format";
import { IconChevron } from "../icons/Icon";
import { CoinPicker } from "./CoinPicker";

/**
 * The instrument choice as one collapsed row that opens into the existing
 * CoinPicker — same search and same list as before, just folded away until
 * it's needed so it doesn't take a screen's worth of height above a form the
 * trader is actually here to fill in.
 */
export function AssetSelect({ value, onChange }: { value: string; onChange: (symbol: string) => void }) {
  const [open, setOpen] = useState(false);
  const inst = useLiveInstrument(value);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tap flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-bg-1 px-3 py-2.5 text-left transition-colors hover:border-accent/50"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-txt-0">{value}</span>
          <span className="block truncate text-2xs text-txt-3">{inst?.name ?? "—"}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-right">
            <span className="block tabular text-xs font-semibold text-txt-0">
              {fmtPrice(inst?.livePrice, inst?.priceDecimals ?? 2)}
            </span>
            <span
              className={classNames(
                "block tabular text-2xs",
                (inst?.liveChange24h ?? 0) >= 0 ? "text-buy" : "text-sell"
              )}
            >
              {inst ? fmtPct(inst.liveChange24h) : "—"}
            </span>
          </span>
          <IconChevron size={14} direction={open ? "up" : "down"} className="text-txt-3" />
        </span>
      </button>

      {open && (
        <div className="mt-1.5 h-64 overflow-hidden rounded-lg border border-line">
          <CoinPicker
            value={value}
            onChange={(s) => {
              onChange(s);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
