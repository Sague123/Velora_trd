import { Link, NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { useTerminalStore } from "../../store/terminal";
import { useConnStatus } from "../../hooks/useLivePrices";
import { useServerHealth } from "../../hooks/useHealth";
import { useAccount, useAlerts } from "../../hooks/useTrading";
import { useIsMobile } from "../../hooks/useIsMobile";
import { classNames, fmtUsd, n } from "../../lib/format";
import { AnimatedNumber } from "../common/AnimatedNumber";
import type { AuthUser } from "../../lib/types";
import {
  IconBell, IconBot, IconHome, IconMarkets, IconTrade, IconVault,
} from "../icons/Icon";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { MobileStatusBar } from "./MobileStatusBar";
import { Logo } from "./Logo";

const NAV = [
  { to: "/overview", key: "nav.overview", Icon: IconHome },
  { to: "/terminal", key: "nav.trade", Icon: IconTrade },
  { to: "/markets", key: "nav.markets", Icon: IconMarkets },
  { to: "/strategies", key: "nav.strategies", Icon: IconBot },
  { to: "/savings", key: "nav.savings", Icon: IconVault },
];

function Avatar({ user }: { user: AuthUser | null }) {
  return user?.avatar ? (
    <img src={user.avatar} alt="" className="h-6 w-6 rounded-full object-cover ring-1 ring-line" />
  ) : (
    <span
      className={classNames(
        "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
        user?.role === "ADMIN" ? "bg-warn/20 text-warn" : "bg-accent-soft text-accent"
      )}
    >
      {user?.name?.[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/**
 * Price alerts that have fired since they were set, as a dot on a bell.
 *
 * Tapping it goes to the terminal's alerts list rather than opening a feed of
 * its own — the alerts already live there, and a second place to read them
 * would only be the same list twice. Renders the dot from real fired alerts,
 * never as decoration.
 */
function AlertsBell() {
  const user = useAuthStore((s) => s.user);
  const { data } = useAlerts(!!user);
  const setMobileMode = useTerminalStore((s) => s.setMobileMode);
  const setHistoryTab = useTerminalStore((s) => s.setHistoryTab);
  const fired = (data?.alerts ?? []).filter((a) => a.firedAt).length;

  return (
    <NavLink
      to="/terminal"
      onClick={() => { setMobileMode("history"); setHistoryTab("alerts"); }}
      aria-label={fired ? `Сработавших алертов: ${fired}` : "Алерты"}
      className="btn-fx tap-sm relative flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-bg-1 text-txt-2"
    >
      <IconBell size={16} />
      {fired > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-sell" />}
    </NavLink>
  );
}

export function TopBar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  // Admins get the CRM too: an admin who could not see it would just be handed
  // a second account, which is worse than the overlap.
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";
  const wsStatus = useConnStatus();
  const { data: health, isError: healthError } = useServerHealth();
  const { data: account } = useAccount(!!user);
  const isMobile = useIsMobile();
  const location = useLocation();
  // AccountStrip already shows Equity/uPnL on the terminal page itself, with
  // the rest of the account context right next to it — repeating just those
  // two numbers up here too was reading the same figure twice on the one
  // screen where it's most likely to actually matter.
  const onTerminal = location.pathname === "/terminal";

  const serverUp = !healthError && health?.status === "ok";
  const live = serverUp && wsStatus === "open";

  // Mobile: identity and status only. Navigation moved to the pinned bottom
  // block (MobileBottomStack) — thumbs reach the bottom of a phone, not the
  // top, and on the terminal it puts the nav in the same block as Buy/Sell
  // instead of a second strip competing for height up here.
  if (isMobile) {
    return (
      // sticky + z-20: the bar stays pinned to the top of the shell instead of
      // being able to drift out of reach behind the mobile browser chrome.
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line-soft bg-bg-0 px-3.5 text-[13px]">
        <Link to="/" className="tap-sm flex items-center gap-2" aria-label="Velora — Home">
          <Logo />
          <span className="text-sm font-extrabold tracking-[0.08em] text-txt-0">VELORA</span>
        </Link>
        <span
          title={live ? t("topbar.live") : wsStatus === "connecting" ? t("topbar.connecting") : t("topbar.offline")}
          className={classNames("h-1.5 w-1.5 shrink-0 rounded-full", live ? "bg-buy" : wsStatus === "connecting" ? "bg-warn animate-pulse" : "bg-sell")}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <MobileStatusBar />
          <AlertsBell />
          <ThemeToggle />
          <NavLink to="/profile" title={t("nav.profile")} className="btn-fx tap-sm flex items-center">
            <Avatar user={user} />
          </NavLink>
        </div>
      </header>
    );
  }

  return (
    <header className="relative flex h-11 shrink-0 items-center gap-1 border-b border-line bg-bg-1 px-2 text-[13px]">
      <Link to="/" className="btn-fx flex items-center gap-1.5 pr-3 hover:opacity-90">
        <Logo />
        <span className="font-semibold tracking-tight text-txt-0">Velora</span>
      </Link>

      <nav className="flex h-full items-stretch gap-0.5 overflow-x-auto">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              classNames(
                "nav-link btn-fx flex items-center border-b-2 px-2.5 text-[12.5px] font-medium transition-colors",
                isActive ? "border-accent text-txt-0" : "border-transparent text-txt-2 hover:text-txt-0"
              )
            }
          >
            {t(item.key)}
          </NavLink>
        ))}
        {isManager && (
          <NavLink
            to="/crm"
            className={({ isActive }) =>
              classNames(
                "nav-link btn-fx flex items-center border-b-2 px-2.5 text-[12.5px] font-medium transition-colors",
                isActive ? "border-accent text-txt-0" : "border-transparent text-txt-2 hover:text-txt-0"
              )
            }
          >
            {t("nav.crm")}
          </NavLink>
        )}
        {user?.role === "ADMIN" && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              classNames(
                "nav-link btn-fx flex items-center border-b-2 px-2.5 text-[12.5px] font-medium transition-colors",
                isActive ? "border-warn text-warn" : "border-transparent text-warn/70 hover:text-warn"
              )
            }
          >
            {t("nav.admin")}
          </NavLink>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <LanguageSwitcher />
        <ThemeToggle />
        {/* A manager's own account is never real trading activity — it's a
            crew login, always $0, forever. Showing a live feed dot and a
            permanent $0.00/$0.00 uPnL on the one screen they actually work in
            is noise, not information, so both are hidden for that role. */}
        {user?.role !== "MANAGER" && (
          <div className="flex items-center gap-1.5 text-2xs text-txt-2" title={health?.feed.lastFetch ?? undefined}>
            <span className={classNames("h-1.5 w-1.5 rounded-full", live ? "bg-buy" : wsStatus === "connecting" ? "bg-warn animate-pulse" : "bg-sell")} />
            <span>{live ? t("topbar.live") : wsStatus === "connecting" ? t("topbar.connecting") : t("topbar.offline")}</span>
            {health && !health.feed.healthy && (
              <span className="rounded border border-warn/40 bg-warn/10 px-1 py-px text-warn">{t("topbar.feedStale")}</span>
            )}
          </div>
        )}

        {account && user?.role !== "MANAGER" && !onTerminal && (
          <div className="flex items-center gap-3 border-l border-line pl-3 tabular">
            <div className="text-right leading-tight">
              <div className="text-2xs text-txt-2">{t("overview.equity")}</div>
              <AnimatedNumber value={n(account.equity)} format={fmtUsd} className="font-semibold text-txt-0" />
            </div>
            <div
              className={classNames(
                "text-right leading-tight",
                Number(account.unrealisedPnl) > 0 ? "text-buy" : Number(account.unrealisedPnl) < 0 ? "text-sell" : "text-txt-1"
              )}
            >
              <div className="text-2xs text-txt-2">uPnL</div>
              <AnimatedNumber value={n(account.unrealisedPnl)} format={fmtUsd} className="font-semibold" />
            </div>
          </div>
        )}

        <NavLink to="/profile" title={t("nav.profile")} className="btn-fx flex items-center gap-1.5 rounded border-l border-line py-1 pl-3 hover:text-accent">
          <Avatar user={user} />
          <span className="max-w-[110px] truncate text-txt-1">{user?.name}</span>
        </NavLink>
      </div>
    </header>
  );
}
