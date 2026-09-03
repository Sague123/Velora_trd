import { useEffect, useLayoutEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { useTerminalStore } from "../../store/terminal";
import { useAccount } from "../../hooks/useTrading";
import { useOrderTicket } from "../../hooks/useOrderTicket";
import { useIsMobile } from "../../hooks/useIsMobile";
import { classNames, fmtCompact, fmtUsd, n } from "../../lib/format";
import { Popover } from "../common/Popover";
import { LanguageSwitcher } from "./LanguageSwitcher";
import {
  IconBearMarket, IconBot, IconBullMarket, IconClipboard, IconDots, IconGear,
  IconHome, IconMarkets, IconTrade, IconVault,
} from "../icons/Icon";
import type { AuthUser, OrderSide } from "../../lib/types";

const NAV = [
  { to: "/overview", key: "nav.overview", Icon: IconHome },
  { to: "/terminal", key: "nav.trade", Icon: IconTrade },
  { to: "/markets", key: "nav.markets", Icon: IconMarkets },
  { to: "/strategies", key: "nav.strategies", Icon: IconBot },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[9px] text-txt-3">{label}</div>
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
  const user = useAuthStore((s) => s.user);
  const { data } = useAccount(!!user);
  if (!data) return null;
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-line-soft px-3.5 py-1.5">
      <Stat label="Equity" value={money(data.equity)} />
      <Stat label="Free Margin" value={money(data.cash)} />
      <Stat label="Used" value={money(data.usedMargin)} />
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
            "tap flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-extrabold shadow-lift transition-transform duration-100 active:scale-[0.97] disabled:cursor-not-allowed",
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
              {s === "BUY" ? "Buy / Long" : "Sell / Short"}
              {priceLabel && <span className="font-bold opacity-60">· {priceLabel}</span>}
            </>
          )}
        </button>
      ))}
    </div>
  );
}

function NavRow({ user, isManager }: { user: AuthUser | null; isManager: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const moreRoutes = ["/savings", ...(isManager ? ["/crm"] : []), ...(user?.role === "ADMIN" ? ["/admin"] : []), "/profile"];
  const moreActive = moreRoutes.includes(location.pathname);

  const tabCls = (active: boolean) =>
    classNames(
      "tap flex flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[10px] font-medium transition-colors",
      active ? "text-accent" : "text-txt-3 hover:text-txt-1"
    );
  const itemCls = (active: boolean, warn?: boolean) =>
    classNames(
      "tap-sm flex items-center gap-2 rounded px-2.5 text-xs font-medium",
      active ? (warn ? "bg-warn/10 text-warn" : "bg-accent-soft text-accent") : warn ? "text-warn/80 hover:bg-bg-3" : "text-txt-1 hover:bg-bg-3"
    );

  return (
    <nav className="flex items-stretch gap-1 px-1.5 pb-1.5 pt-1">
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => tabCls(isActive)}>
          <item.Icon size={19} />
          {t(item.key)}
        </NavLink>
      ))}
      <Popover
        align="right"
        side="top"
        trigger={(open, toggle) => (
          <button onClick={toggle} className={tabCls(open || moreActive)}>
            <IconDots size={19} />
            {t("nav.more")}
          </button>
        )}
      >
        {(close) => (
          <div className="w-48 p-1">
            <NavLink to="/savings" onClick={close} className={({ isActive }) => itemCls(isActive)}>
              <IconVault size={17} /> {t("nav.savings")}
            </NavLink>
            {isManager && (
              <NavLink to="/crm" onClick={close} className={({ isActive }) => itemCls(isActive)}>
                <IconClipboard size={17} /> {t("nav.crm")}
              </NavLink>
            )}
            {user?.role === "ADMIN" && (
              <NavLink to="/admin" onClick={close} className={({ isActive }) => itemCls(isActive, true)}>
                <IconGear size={17} /> {t("nav.admin")}
              </NavLink>
            )}
            <div className="my-1 border-t border-line-soft" />
            <div className="px-1 py-0.5">
              <LanguageSwitcher />
            </div>
          </div>
        )}
      </Popover>
    </nav>
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
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";
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
      <NavRow user={user} isManager={isManager} />
    </div>
  );
}
