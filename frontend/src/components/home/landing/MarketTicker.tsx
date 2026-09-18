import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useLiveInstrument } from "../../../hooks/useLivePrices";
import { useTerminalStore } from "../../../store/terminal";
import { classNames, fmtPct, fmtPrice } from "../../../lib/format";
import { CoinBadge } from "../../common/CoinBadge";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT"];

function TickerItem({ symbol }: { symbol: string }) {
  const inst = useLiveInstrument(symbol);
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const navigate = useNavigate();

  if (!inst) {
    return <div className="skeleton h-7 w-32 shrink-0 rounded" />;
  }
  const up = inst.liveChange24h >= 0;

  return (
    <button
      onClick={() => { setSymbol(symbol); navigate("/terminal"); }}
      className="btn-fx flex shrink-0 items-center gap-1.5 rounded-full border border-line-soft px-2.5 py-1 hover:border-accent/50"
    >
      <CoinBadge symbol={symbol} size={16} />
      <span className="text-2xs font-medium text-txt-1">{symbol.replace("USDT", "")}</span>
      <span className="tabular text-2xs font-semibold text-txt-0">{fmtPrice(inst.livePrice, inst.priceDecimals)}</span>
      <span className={classNames("tabular text-2xs font-semibold", up ? "text-buy" : "text-sell")}>
        {fmtPct(inst.liveChange24h)}
      </span>
    </button>
  );
}

/** A thin strip of real, live prices right under the hero — the same feed
 * the terminal itself runs on (`useLiveInstrument`), just six pairs instead
 * of the full catalog. Horizontal scroll rather than wrapping on mobile: a
 * ticker that wraps into a grid stops reading as a ticker. */
export function MarketTicker() {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t("home.landing.tickerAriaLabel")}
      className="anim-rise-1 no-scrollbar flex gap-2 overflow-x-auto rounded-xl border border-line bg-bg-1 px-3 py-2.5"
    >
      {SYMBOLS.map((s) => <TickerItem key={s} symbol={s} />)}
    </div>
  );
}
