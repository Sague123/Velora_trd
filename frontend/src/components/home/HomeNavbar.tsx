import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { classNames } from "../../lib/format";
import { buttonCls } from "../../lib/ui";
import { Logo } from "../layout/Logo";
import { ThemeToggle } from "../layout/ThemeToggle";
import { LanguageSwitcher } from "../layout/LanguageSwitcher";
import { IconClose, IconMenu } from "../icons/Icon";

/**
 * Every control in this header is one size: a 40px circle on desktop, 44px
 * on touch-sized screens (below `lg`) — language, theme, the profile avatar
 * and the menu button alike, and the two text actions share that height. One
 * string, so they can't drift apart again.
 */
const CONTROL = "h-11 lg:h-10";
const ICON_CONTROL =
  `btn-fx flex ${CONTROL} w-11 lg:w-10 shrink-0 items-center justify-center rounded-full border border-line ` +
  "text-txt-2 transition-colors hover:border-accent hover:text-accent " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * The public header — one row, always. Logo left, actions right; the section
 * links sit inline from `lg` up and move into a menu panel below that, rather
 * than stacking a second row under the first.
 *
 * Action hierarchy: "Create account" is the one filled button; "Log in" is
 * the outlined secondary beside it. At phone widths the row keeps only what
 * must be one tap away — the primary action and the menu — and everything
 * else (links, Log in, language, theme) lives in the panel at full touch size.
 */
export function HomeNavbar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const NAV = [
    { to: "/markets", label: t("nav.markets") },
    { to: "/terminal", label: t("nav.trade") },
    { to: "/strategies", label: t("home.navTools") },
    { to: "/profile", label: t("home.navPortfolio") },
  ];

  // Close on navigation, Escape and any click outside the header.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const onDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [menuOpen]);

  const avatar = user && (
    <Link
      to="/profile"
      aria-label={user.name ?? t("home.navPortfolio")}
      className={classNames(ICON_CONTROL, "overflow-hidden p-0")}
    >
      {user.avatar ? (
        <img src={user.avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-semibold text-accent">{user.name?.[0]?.toUpperCase() ?? "?"}</span>
      )}
    </Link>
  );

  return (
    <header ref={headerRef} className="sticky top-0 z-30 border-b border-line bg-bg-0/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-2 px-4 sm:px-6">
        <Link to="/" className={`flex ${CONTROL} shrink-0 items-center gap-2 rounded-lg pr-2`}>
          <Logo size={24} />
          <span className="text-base font-semibold tracking-tight text-txt-0">Velora</span>
        </Link>

        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="btn-fx flex h-10 items-center rounded-full px-3.5 text-sm font-medium text-txt-2 transition-colors hover:bg-bg-2 hover:text-txt-0"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 lg:flex">
            <LanguageSwitcher className={ICON_CONTROL} showFlag={false} />
            <ThemeToggle className={ICON_CONTROL} />
          </div>

          {user ? (
            avatar
          ) : (
            <>
              {/* Visibility lives on a wrapper: `tap` (inside buttonCls) sets
                  display on coarse pointers and would override `hidden`. */}
              <div className="hidden sm:block">
                <Link to="/login" className={buttonCls("secondary", "lg", `!rounded-full px-5 ${CONTROL}`)}>
                  {t("home.logIn")}
                </Link>
              </div>
              <Link to="/register" className={buttonCls("primary", "lg", `!rounded-full px-5 ${CONTROL}`)}>
                {t("home.signUp")}
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="home-menu"
            aria-label={t("home.menu")}
            className={classNames(ICON_CONTROL, "lg:hidden")}
          >
            {menuOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="home-menu" className="border-t border-line bg-bg-0 lg:hidden">
          <nav aria-label="Primary" className="px-4 sm:px-6">
            {NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="flex h-12 items-center border-b border-line-soft text-sm font-medium text-txt-1 hover:text-txt-0"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 px-4 py-4 sm:px-6">
            <LanguageSwitcher className={ICON_CONTROL} align="left" showFlag={false} />
            <ThemeToggle className={ICON_CONTROL} />
            {!user && (
              <div className="ml-auto sm:hidden">
                <Link to="/login" className={buttonCls("secondary", "lg", `!rounded-full px-5 ${CONTROL}`)}>
                  {t("home.logIn")}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
