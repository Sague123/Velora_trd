import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { classNames } from "../../lib/format";
import { PRIMARY_NAV, moreNavItems } from "../../lib/nav";
import { Popover } from "../common/Popover";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { IconDots } from "../icons/Icon";

/**
 * The one navigation in the product, in two layouts.
 *
 * `row` is the desktop header's horizontal strip; `tabs` is the phone's
 * bottom bar. Both read the same `PRIMARY_NAV` + `moreNavItems`, so the
 * destinations and their labels are identical on every screen and platform —
 * which is the whole point: this used to be three hand-maintained lists that
 * had drifted into different items under different names.
 */
export function MainNav({ variant }: { variant: "row" | "tabs" }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const more = moreNavItems(user);
  const moreActive = more.some((i) => i.to === location.pathname);

  const rowCls = (active: boolean, warn?: boolean) =>
    classNames(
      "nav-link btn-fx flex h-full items-center gap-1.5 border-b-2 px-2.5 text-xs font-medium transition-colors",
      active
        ? warn ? "border-warn text-warn" : "border-accent text-txt-0"
        : warn ? "border-transparent text-warn/70 hover:text-warn" : "border-transparent text-txt-2 hover:text-txt-0"
    );

  const tabCls = (active: boolean) =>
    classNames(
      "tap flex flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-2xs font-medium transition-colors",
      active ? "text-accent" : "text-txt-3 hover:text-txt-1"
    );

  // The "more" menu's own rows, shared by both layouts so its contents can't
  // drift either.
  const itemCls = (active: boolean, warn?: boolean) =>
    classNames(
      "tap-sm flex items-center gap-2 rounded px-2.5 text-xs font-medium",
      active
        ? warn ? "bg-warn/10 text-warn" : "bg-accent-soft text-accent"
        : warn ? "text-warn/80 hover:bg-bg-3" : "text-txt-1 hover:bg-bg-3"
    );

  const moreMenu = (close: () => void) => (
    <div className="w-48 p-1">
      {more.map((item) => (
        <NavLink key={item.to} to={item.to} onClick={close} className={({ isActive }) => itemCls(isActive, item.warn)}>
          <item.Icon size={17} /> {t(item.key)}
        </NavLink>
      ))}
      {/* The language picker lives here rather than in the header: it was a
          globe on desktop and buried in the phone's "more" sheet, which is
          exactly the kind of per-platform split this component exists to end.
          One home, reachable identically from both layouts. */}
      <div className="my-1 border-t border-line-soft" />
      <div className="px-1 py-0.5">
        <LanguageSwitcher />
      </div>
    </div>
  );

  if (variant === "tabs") {
    return (
      <nav className="flex items-stretch gap-1 px-1.5 pb-1.5 pt-1">
        {PRIMARY_NAV.map((item) => (
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
          {moreMenu}
        </Popover>
      </nav>
    );
  }

  return (
    <nav className="flex h-full items-stretch gap-0.5">
      {PRIMARY_NAV.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => rowCls(isActive)}>
          {t(item.key)}
        </NavLink>
      ))}
      <Popover
        align="left"
        trigger={(open, toggle) => (
          <button onClick={toggle} className={rowCls(open || moreActive)}>
            {t("nav.more")}
            <IconDots size={13} />
          </button>
        )}
      >
        {moreMenu}
      </Popover>
    </nav>
  );
}
