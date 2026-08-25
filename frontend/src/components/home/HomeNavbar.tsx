import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { classNames } from "../../lib/format";
import { Logo } from "../layout/Logo";
import { ThemeToggle } from "../layout/ThemeToggle";
import { LanguageSwitcher } from "../layout/LanguageSwitcher";
import { IconBell, IconSearch } from "../icons/Icon";

export function HomeNavbar({ query, onQueryChange }: { query: string; onQueryChange: (v: string) => void }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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
    <header className="sticky top-0 z-30 flex shrink-0 flex-col border-b border-line bg-bg-1/95 text-[13px] backdrop-blur">
      <div className="flex h-12 items-center gap-1 px-3">
        <Link to="/" className="flex items-center gap-1.5 pr-4">
          <Logo />
          <span className="font-semibold tracking-tight text-txt-0">Velora</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <button
              key={item.label}
              onClick={() => navigate(item.to)}
              className="btn-fx rounded px-2.5 py-1.5 text-[12.5px] font-medium text-txt-2 transition-colors hover:bg-bg-2 hover:text-txt-0"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <div className={classNames("flex items-center overflow-hidden rounded border border-line transition-[width]", searchOpen ? "w-44" : "w-8")}>
            <button
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
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={t("home.searchPlaceholder")}
                className="h-8 w-full bg-transparent pr-2 text-2xs outline-none"
              />
            )}
          </div>

          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="btn-fx flex h-8 w-8 items-center justify-center rounded border border-line text-txt-2 hover:border-accent hover:text-accent"
              aria-label={t("home.notifications")}
            >
              <IconBell size={14} />
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded border border-line bg-bg-2 p-3 shadow-xl">
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
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent">
                  {user.name?.[0]?.toUpperCase() ?? "?"}
                </span>
              )}
              <span className="hidden max-w-[100px] truncate text-txt-1 sm:inline">{user.name}</span>
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn-fx tap-sm ml-1 rounded px-2.5 py-1.5 text-[12.5px] font-medium text-txt-2 hover:text-txt-0">
                {t("home.logIn")}
              </Link>
              <Link
                to="/register"
                className="btn-fx tap-sm rounded bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-panel transition-colors hover:bg-accent-dim"
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
