import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { useConnStatus } from "../../hooks/useLivePrices";
import { useServerHealth } from "../../hooks/useHealth";
import { useAccount } from "../../hooks/useTrading";
import { useIsMobile } from "../../hooks/useIsMobile";
import { classNames, fmtUsd } from "../../lib/format";
import type { AuthUser } from "../../lib/types";
import { IconBot, IconGear, IconHome, IconMarkets, IconTrade } from "../icons/Icon";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

const NAV = [
  { to: "/overview", key: "nav.overview", Icon: IconHome },
  { to: "/terminal", key: "nav.trade", Icon: IconTrade },
  { to: "/markets", key: "nav.markets", Icon: IconMarkets },
  { to: "/strategies", key: "nav.strategies", Icon: IconBot },
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

export function TopBar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
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
          <div className="ml-auto flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            <NavLink to="/profile" title={t("nav.profile")} className="btn-fx tap-sm ml-1 flex items-center rounded border-l border-line pl-2">
              <Avatar user={user} />
            </NavLink>
          </div>
        </div>
        <nav className="flex items-stretch gap-1 overflow-x-auto border-t border-line-soft px-2 py-1.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                classNames(
                  // flex-1 + basis-0 gives every tab the same width instead of
                  // each one sizing to its own label length.
                  "tap-sm flex flex-1 basis-0 shrink-0 items-center justify-center gap-1 rounded px-2 text-2xs font-medium transition-colors",
                  isActive ? "bg-accent-soft text-accent" : "text-txt-2 hover:bg-bg-3 hover:text-txt-0"
                )
              }
            >
              <item.Icon size={14} />
              {t(item.key)}
            </NavLink>
          ))}
          {user?.role === "ADMIN" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                classNames(
                  "tap-sm flex flex-1 basis-0 shrink-0 items-center justify-center gap-1 rounded px-2 text-2xs font-medium transition-colors",
                  isActive ? "bg-warn/10 text-warn" : "text-warn/80 hover:bg-bg-3"
                )
              }
            >
              <IconGear size={14} /> {t("nav.admin")}
            </NavLink>
          )}
        </nav>
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
        <div className="flex items-center gap-1.5 text-2xs text-txt-2" title={health?.feed.lastFetch ?? undefined}>
          <span className={classNames("h-1.5 w-1.5 rounded-full", live ? "bg-buy" : wsStatus === "connecting" ? "bg-warn animate-pulse" : "bg-sell")} />
          <span>{live ? t("topbar.live") : wsStatus === "connecting" ? t("topbar.connecting") : t("topbar.offline")}</span>
          {health && !health.feed.healthy && (
            <span className="rounded border border-warn/40 bg-warn/10 px-1 py-px text-warn">{t("topbar.feedStale")}</span>
          )}
        </div>

        {account && (
          <div className="flex items-center gap-3 border-l border-line pl-3 tabular">
            <div className="text-right leading-tight">
              <div className="text-2xs text-txt-2">{t("overview.equity")}</div>
              <div className="font-semibold text-txt-0">{fmtUsd(account.equity)}</div>
            </div>
            <div
              className={classNames(
                "text-right leading-tight",
                Number(account.unrealisedPnl) > 0 ? "text-buy" : Number(account.unrealisedPnl) < 0 ? "text-sell" : "text-txt-1"
              )}
            >
              <div className="text-2xs text-txt-2">uPnL</div>
              <div className="font-semibold">{fmtUsd(account.unrealisedPnl)}</div>
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
