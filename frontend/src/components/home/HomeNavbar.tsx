import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { classNames } from "../../lib/format";
import { Logo } from "../layout/Logo";
import { ThemeToggle } from "../layout/ThemeToggle";
import { LanguageSwitcher } from "../layout/LanguageSwitcher";
import { IconBell, IconSearch } from "../icons/Icon";
import { buttonCls } from "../../lib/ui";

/**
 * The one public header, shared by every marketing page. Search is
 * self-contained (no props) — it used to filter a markets table that lived
 * on this same page; now that the landing doesn't render that table, it
 * just jumps to the full Markets page, which is where the browsing it was
 * always shorthand for actually lives.
 */
export function HomeNavbar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const NAV = [
    { to: "/markets", label: t("nav.markets") },
    { to: "/terminal", label: t("nav.trade") },
    { to: "/terminal", label: t("home.navTools") },
    { to: "/profile", label: t("home.navPortfolio") },
  ];

  return (
    <header className="sticky top-0 z-30 flex shrink-0 flex-col border-b border-line bg-bg-1/95 text-xs backdrop-blur">
      <div className="flex h-12 items-center gap-1 px-3">
        <Link to="/" className="flex shrink-0 items-center gap-1.5 pr-2 sm:pr-4">
          <Logo />
          <span className="font-semibold tracking-tight text-txt-0">Velora</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <button
              key={item.label}
              onClick={() => navigate(item.to)}
              className="btn-fx rounded px-2.5 py-1.5 text-xs font-medium text-txt-2 transition-colors hover:bg-bg-2 hover:text-txt-0"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          {/* Search and notifications hidden below `sm`: six controls plus
              the sign-up button never fit 360px, and on a signed-out landing
              those two are the least essential — the body's overflow-x is
              clipped (see globals.css), so anything that doesn't fit here
              doesn't scroll into view, it just silently disappears behind
              the viewport edge. Войти/Создать аккаунт (the actual point of
              this header) must never be the thing that gets clipped. */}
          <form
            onSubmit={(e) => { e.preventDefault(); navigate("/markets"); }}
            className={classNames("hidden items-center overflow-hidden rounded border border-line transition-[width] sm:flex", searchOpen ? "w-44" : "w-8")}
          >
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="btn-fx flex h-8 w-8 shrink-0 items-center justify-center text-txt-2 hover:text-accent"
              aria-label="Search"
            >
              <IconSearch size={14} />
            </button>
            {searchOpen && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("home.searchPlaceholder")}
                className="h-8 w-full bg-transparent pr-2 text-2xs outline-none"
              />
            )}
          </form>

          <div ref={notifRef} className="relative hidden sm:block">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="btn-fx flex h-8 w-8 items-center justify-center rounded border border-line text-txt-2 hover:border-accent hover:text-accent"
              aria-label={t("home.notifications")}
            >
              <IconBell size={14} />
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded border border-line bg-bg-2 p-3 shadow-float">
                <div className="mb-1 text-2xs font-semibold text-txt-1">{t("home.notifications")}</div>
                <div className="text-2xs text-txt-3">{t("home.noNotifications")}</div>
              </div>
            )}
          </div>

          <LanguageSwitcher />
          <ThemeToggle />

          {user ? (
            <Link to="/profile" className="btn-fx ml-1 flex items-center gap-1.5 rounded border border-line py-1 pl-1 pr-2.5 hover:border-accent">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent">
                  {user.name?.[0]?.toUpperCase() ?? "?"}
                </span>
              )}
              <span className="hidden max-w-[100px] truncate text-txt-1 sm:inline">{user.name}</span>
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn-fx tap-sm ml-1 rounded px-2.5 py-1.5 text-xs font-medium text-txt-2 hover:text-txt-0">
                {t("home.logIn")}
              </Link>
              <Link
                to="/register"
                className={buttonCls("primary", "md")}
              >
                {t("home.signUp")}
              </Link>
            </>
          )}
        </div>
      </div>

      <nav className="flex items-stretch gap-1 overflow-x-auto border-t border-line-soft px-2 py-1.5 md:hidden">
        {NAV.map((item) => (
          <button
            key={item.label}
            onClick={() => navigate(item.to)}
            className="btn-fx tap-sm flex flex-1 basis-0 shrink-0 items-center justify-center rounded px-2 text-2xs font-medium text-txt-2 transition-colors hover:bg-bg-2 hover:text-txt-0"
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
