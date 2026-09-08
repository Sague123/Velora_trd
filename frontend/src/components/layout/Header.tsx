import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { useTerminalStore } from "../../store/terminal";
import { useConnStatus } from "../../hooks/useLivePrices";
import { useServerHealth } from "../../hooks/useHealth";
import { useAlerts } from "../../hooks/useTrading";
import { useIsMobile } from "../../hooks/useIsMobile";
import { classNames } from "../../lib/format";
import { iconButtonCls } from "../../lib/ui";
import type { AuthUser } from "../../lib/types";
import { IconBell } from "../icons/Icon";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { StatusIcons } from "./StatusIcons";
import { MainNav } from "./MainNav";
import { Logo } from "./Logo";

function Avatar({ user }: { user: AuthUser | null }) {
  return user?.avatar ? (
    <img src={user.avatar} alt="" className="h-6 w-6 rounded-full object-cover ring-1 ring-line" />
  ) : (
    <span
      className={classNames(
        "flex h-6 w-6 items-center justify-center rounded-full text-2xs font-semibold",
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
      className={iconButtonCls}
    >
      <IconBell size={16} />
      {fired > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-sell" />}
    </NavLink>
  );
}

/** Feed/socket state as one dot plus, when it matters, the stale badge. */
function FeedStatus() {
  const { t } = useTranslation();
  const wsStatus = useConnStatus();
  const { data: health, isError: healthError } = useServerHealth();
  const live = !healthError && health?.status === "ok" && wsStatus === "open";
  const label = live ? t("topbar.live") : wsStatus === "connecting" ? t("topbar.connecting") : t("topbar.offline");

  return (
    <span className="flex shrink-0 items-center gap-1.5" title={health?.feed.lastFetch ?? label}>
      <span
        aria-label={label}
        className={classNames(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          live ? "bg-buy" : wsStatus === "connecting" ? "bg-warn animate-pulse" : "bg-sell"
        )}
      />
      {/* Text drops below `sm`: at 360px it was eating enough of the row to push
          the avatar off the right edge. The dot beside it already carries the
          same state, and its title/aria-label still says which. */}
      {health && !health.feed.healthy && (
        <span className="hidden shrink-0 whitespace-nowrap rounded border border-warn/40 bg-warn/10 px-1 py-px text-3xs leading-none text-warn sm:inline">
          {t("topbar.feedStale")}
        </span>
      )}
    </span>
  );
}

/**
 * The application header — one component, one appearance, every authenticated
 * screen and both platforms.
 *
 * It used to be two branches of the same file that had drifted apart: the
 * phone showed `VELORA` in caps with a bell and no language picker, the
 * desktop showed `Velora` with a language globe and no bell, and the public
 * landing rendered a third header of its own with a search box on top of
 * that. The only thing that legitimately varies by width is *where the
 * navigation sits* — inline here on desktop, in the thumb-reachable bottom
 * bar on a phone — so that is the only branch left.
 *
 * Equity/uPnL used to ride along on the right on desktop only, and only on
 * pages that weren't the terminal. That made the header differ per page and
 * per platform for a number already shown by AccountStrip on the terminal,
 * the stat row on Overview and BalanceStats on Profile — so it lives on those
 * pages now and not up here.
 */
export function Header() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();

  return (
    // sticky + z-20: stays pinned to the top of the shell instead of drifting
    // out of reach behind mobile browser chrome.
    <header className="sticky top-0 z-20 flex h-11 shrink-0 items-center gap-2 border-b border-line bg-bg-1 px-3 text-xs">
      <Link to="/overview" className="btn-fx tap-sm flex shrink-0 items-center gap-1.5 pr-1 hover:opacity-90" aria-label="Velora">
        <Logo />
        <span className="text-sm font-extrabold tracking-[0.08em] text-txt-0">VELORA</span>
      </Link>

      <FeedStatus />

      {!isMobile && <MainNav variant="row" />}

      <div className="ml-auto flex items-center gap-1.5">
        <StatusIcons />
        <AlertsBell />
        <LanguageSwitcher />
        <ThemeToggle />
        <NavLink to="/profile" title={t("nav.profile")} className="btn-fx tap-sm flex items-center">
          <Avatar user={user} />
        </NavLink>
      </div>
    </header>
  );
}
