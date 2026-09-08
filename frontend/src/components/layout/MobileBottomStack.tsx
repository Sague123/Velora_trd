import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/auth";
import { useTerminalStore } from "../../store/terminal";
import { useAccount } from "../../hooks/useTrading";
import { useOrderTicket } from "../../hooks/useOrderTicket";
import { useIsMobile } from "../../hooks/useIsMobile";
import { classNames, fmtCompact, fmtUsd, n } from "../../lib/format";
import { MainNav } from "./MainNav";
import { IconBearMarket, IconBullMarket } from "../icons/Icon";
import type { OrderSide } from "../../lib/types";
import { useTranslation } from "react-i18next";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-3xs text-txt-3">{label}</div>
      <div className="truncate tabular text-2xs font-bold text-txt-0">{value}</div>
    </div>
  );
}

/** Big numbers get compacted rather than truncated — an equity of $1.06M is
 * more useful at a glance than "$1,063,75…" clipped mid-figure. */
function money(v: string | number | null | undefined) {
  const num = n(v);
  return Math.abs(num) >= 100_000 ? `$${fmtCompact(num)}` : fmtUsd(num);
}

function EquityRow() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { data } = useAccount(!!user);
  if (!data) return null;
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-line-soft px-3.5 py-1.5">
      <Stat label={t("account.equity")} value={money(data.equity)} />
      <Stat label={t("account.freeMargin")} value={money(data.cash)} />
      <Stat label={t("account.used")} value={money(data.usedMargin)} />
    </div>
  );
}

/**
 * The only place in the interface that opens a position.
 *
 * First press picks the direction, scrolls the ticket into view and leaves
 * the button armed; the second sends the order. That first press is doing
 * real work other than trading — it also drags the form onto the screen —
 * so submitting on it would fire an order at the exact moment the amount,
 * leverage and liquidation price first became visible.
 */
function TradeButtons() {
  const { t } = useTranslation();
  const { inst, canSubmit, armed, isPending, side, handleSubmitClick } = useOrderTicket();
  const mobileMode = useTerminalStore((s) => s.mobileMode);
  const setMobileMode = useTerminalStore((s) => s.setMobileMode);
  const requestFocusTicket = useTerminalStore((s) => s.requestFocusTicket);

  function press(pressed: OrderSide) {
    // History mode doesn't render the ticket at all, so there'd be nothing to
    // scroll to or submit — step back to the chart first.
    if (mobileMode === "history") setMobileMode("chart");
    requestFocusTicket();
    handleSubmitClick(pressed, true);
  }

  const priceLabel = inst?.livePrice ? fmtUsd(n(inst.livePrice)) : "";

  return (
    <div className="grid grid-cols-2 gap-2 px-2.5 py-2">
      {(["BUY", "SELL"] as const).map((s) => (
        <button
          key={s}
          onClick={() => press(s)}
          // Only a request already in flight actually disables the button —
          // that's the one case a second tap must not do anything. An empty
          // amount is NOT reason to disable: this press is what scrolls the
          // ticket into view in the first place, so a hard `disabled` here
          // would block the only route to the field that's missing.
          // useOrderTicket's handleSubmitClick already refuses to arm/submit
          // without a valid amount (toast + return), so nothing unsendable
          // can get through — the dimming below is cosmetic, not a gate.
          disabled={isPending && side === s}
          className={classNames(
            "tap flex min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-xl px-2 py-2.5 text-2xs font-extrabold shadow-lift transition-transform duration-100 active:scale-[0.97] disabled:cursor-not-allowed",
            !canSubmit && armed !== s && "opacity-60",
            s === "BUY" ? "bg-buy-fill text-black" : "bg-sell-fill text-white"
          )}
        >
          {s === "BUY" ? <IconBullMarket size={15} /> : <IconBearMarket size={15} />}
          {isPending && side === s ? (
            "Отправка…"
          ) : armed === s ? (
            "Подтвердить"
          ) : (
            <>
              <span className="truncate">{s === "BUY" ? t("terminal.long") : t("terminal.short")}</span>
              {priceLabel && <span className="shrink-0 font-bold opacity-70">&nbsp;· {priceLabel}</span>}
            </>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * The phone's pinned bottom block: account summary, Buy/Sell, and the app
 * navigation that used to live in the top bar.
 *
 * Fixed rather than sticky — sticky inside the scrolling terminal drifted
 * with the content instead of holding its position. Its measured height is
 * published as `--mobile-stack-h` so the shell can reserve exactly that much
 * space underneath the page rather than guessing at a padding value that
 * changes with which tiers are showing.
 */
export function MobileBottomStack() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const onTerminal = location.pathname === "/terminal";
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el || !isMobile) {
      root.style.removeProperty("--mobile-stack-h");
      return;
    }
    const publish = () => root.style.setProperty("--mobile-stack-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, onTerminal]);

  useEffect(() => () => { document.documentElement.style.removeProperty("--mobile-stack-h"); }, []);

  if (!isMobile || !user) return null;

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg-0/95 backdrop-blur-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {onTerminal && (
        <>
          <EquityRow />
          <TradeButtons />
        </>
      )}
      <MainNav variant="tabs" />
    </div>
  );
}
