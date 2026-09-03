import { Link, NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { useConnStatus } from "../../hooks/useLivePrices";
import { useServerHealth } from "../../hooks/useHealth";
import { useAccount } from "../../hooks/useTrading";
import { useIsMobile } from "../../hooks/useIsMobile";
import { classNames, fmtUsd, n } from "../../lib/format";
import { AnimatedNumber } from "../common/AnimatedNumber";
import { Popover } from "../common/Popover";
import type { AuthUser } from "../../lib/types";
import {
  IconBot, IconClipboard, IconDots, IconGear, IconHome, IconMarkets, IconTrade, IconVault,
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

// Mobile shows only the four the trader reaches constantly; everything else
// (including Savings/CRM/Admin) folds into the "More" sheet below — trading
// gets the width instead of a sixth or seventh equally-sized tab.
const MOBILE_PRIMARY = ["/terminal", "/overview", "/markets", "/strategies"];

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
 * Mobile's primary nav: four icon-over-label tabs for the pages a trader
 * reaches constantly, plus a "More" sheet for everything else (Savings, CRM,
 * Admin, Profile) — not a sixth/seventh tab squeezed into the same row. Icon
 * above label (not beside it) reads as a real mobile nav bar rather than a
 * shrunk desktop tab strip, and the strip's own background + border is what
 * makes it a distinct control surface instead of text floating on the page.
 */
function MobileNav({ isManager, user }: { isManager: boolean; user: AuthUser | null }) {
  const { t } = useTranslation();
  const location = useLocation();

  const primary = NAV.filter((item) => MOBILE_PRIMARY.includes(item.to));
  const moreRoutes = ["/savings", ...(isManager ? ["/crm"] : []), ...(user?.role === "ADMIN" ? ["/admin"] : []), "/profile"];
  const moreActive = moreRoutes.includes(location.pathname);

  const tabCls = (active: boolean, warn?: boolean) =>
    classNames(
      "tap flex flex-1 basis-0 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[10.5px] font-medium transition-colors",
      active
        ? warn ? "bg-warn/10 text-warn shadow-btn" : "bg-accent-soft text-accent shadow-btn"
        : warn ? "text-warn/80" : "text-txt-2 hover:bg-bg-3 hover:text-txt-0"
    );

  return (
    <nav className="flex items-stretch gap-1 border-t border-line bg-bg-2/60 px-1.5 py-1.5">
      {primary.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => tabCls(isActive)}>
          <item.Icon size={20} />
          {t(item.key)}
        </NavLink>
      ))}

      <Popover
        align="right"
        trigger={(open, toggle) => (
          <button onClick={toggle} className={tabCls(open || moreActive)}>
            <IconDots size={20} />
            {t("nav.more")}
          </button>
        )}
      >
        {(close) => (
          <div className="w-44 p-1">
            <NavLink
              to="/savings"
              onClick={close}
              className={({ isActive }) =>
                classNames(
                  "tap-sm flex items-center gap-2 rounded px-2.5 text-xs font-medium",
                  isActive ? "bg-accent-soft text-accent" : "text-txt-1 hover:bg-bg-3"
                )
              }
            >
              <IconVault size={17} /> {t("nav.savings")}
            </NavLink>
            {isManager && (
              <NavLink
                to="/crm"
                onClick={close}
                className={({ isActive }) =>
                  classNames(
                    "tap-sm flex items-center gap-2 rounded px-2.5 text-xs font-medium",
                    isActive ? "bg-accent-soft text-accent" : "text-txt-1 hover:bg-bg-3"
                  )
                }
              >
                <IconClipboard size={17} /> {t("nav.crm")}
              </NavLink>
            )}
            {user?.role === "ADMIN" && (
              <NavLink
                to="/admin"
                onClick={close}
                className={({ isActive }) =>
                  classNames(
                    "tap-sm flex items-center gap-2 rounded px-2.5 text-xs font-medium",
                    isActive ? "bg-warn/10 text-warn" : "text-warn/80 hover:bg-bg-3"
                  )
                }
              >
                <IconGear size={17} /> {t("nav.admin")}
              </NavLink>
            )}
            <div className="my-1 border-t border-line-soft" />
            <NavLink
              to="/profile"
              onClick={close}
              className={({ isActive }) =>
                classNames(
                  "tap-sm flex items-center gap-2 rounded px-2.5 text-xs font-medium",
                  isActive ? "bg-accent-soft text-accent" : "text-txt-1 hover:bg-bg-3"
                )
              }
            >
              <Avatar user={user} /> {t("nav.profile")}
            </NavLink>
          </div>
        )}
      </Popover>
    </nav>
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

  const serverUp = !healthError && health?.status === "ok";
  const live = serverUp && wsStatus === "open";

  // Mobile: everything visible up front, no hamburger — a compact top row
  // (logo, live dot, theme, profile) plus an always-shown, horizontally
  // scrollable nav strip right under it.
  if (isMobile) {
    return (
      // sticky + z-20: the bar stays pinned to the top of the shell instead of
      // being able to drift out of reach behind the mobile browser chrome.
      <header className="sticky top-0 z-20 flex shrink-0 flex-col border-b border-line bg-bg-1 text-[13px]">
        <div className="flex h-12 items-center gap-2 px-2">
          <Link to="/" className="tap-sm flex items-center" aria-label="Velora — Home">
            <Logo />
          </Link>
          <span className={classNames("h-1.5 w-1.5 shrink-0 rounded-full", live ? "bg-buy" : wsStatus === "connecting" ? "bg-warn animate-pulse" : "bg-sell")} />
          <div className="ml-auto flex items-center gap-1.5">
            <MobileStatusBar />
            <LanguageSwitcher />
            <ThemeToggle />
            <NavLink to="/profile" title={t("nav.profile")} className="btn-fx tap-sm ml-1 flex items-center rounded border-l border-line pl-2">
              <Avatar user={user} />
            </NavLink>
          </div>
        </div>
        <MobileNav isManager={isManager} user={user} />
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

        {account && user?.role !== "MANAGER" && (
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
