import {
  IconBot, IconClipboard, IconGear, IconHome, IconMarkets, IconTrade, IconVault,
} from "../components/icons/Icon";
import type { AuthUser } from "./types";

export interface NavItem {
  to: string;
  /** i18n key — never a literal label, so the two renderers can't drift. */
  key: string;
  Icon: typeof IconHome;
  /** Admin-only entries are tinted with `warn` wherever they render. */
  warn?: boolean;
}

/**
 * The app's navigation, in one place.
 *
 * There used to be three of these lists — the desktop top row, the mobile
 * bottom bar, and the landing page's own tabs — with different items under
 * different names (the landing's "Инструменты" and "Торговля" were even the
 * same `/terminal` route twice). They are one list now: the desktop header
 * and the mobile bottom bar are two layouts of the *same* items, so an entry
 * added here shows up in both or in neither.
 *
 * PRIMARY is deliberately four entries plus "more": five slots is what a
 * phone's bottom bar holds at a comfortable tap size, and the desktop header
 * renders the identical five rather than quietly showing a sixth.
 */
export const PRIMARY_NAV: NavItem[] = [
  { to: "/overview", key: "nav.overview", Icon: IconHome },
  { to: "/terminal", key: "nav.trade", Icon: IconTrade },
  { to: "/markets", key: "nav.markets", Icon: IconMarkets },
  { to: "/strategies", key: "nav.strategies", Icon: IconBot },
];

/**
 * Everything behind "more", role-gated the same way in both layouts.
 *
 * Profile is deliberately absent: the avatar in the header opens it on both
 * platforms, and a second entry here would be two doors to one room.
 */
export function moreNavItems(user: AuthUser | null): NavItem[] {
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";
  return [
    { to: "/savings", key: "nav.savings", Icon: IconVault },
    ...(isManager ? [{ to: "/crm", key: "nav.crm", Icon: IconClipboard }] : []),
    ...(user?.role === "ADMIN" ? [{ to: "/admin", key: "nav.admin", Icon: IconGear, warn: true }] : []),
  ];
}

/**
 * Left-to-right order of every top-level destination — used by AppLayout to
 * pick a page-transition direction that matches how a nav click moved.
 * Derived from the lists above (with every role's entries present) so a new
 * destination can't be added to the nav and forgotten here.
 */
export const NAV_ORDER: string[] = [
  ...PRIMARY_NAV.map((i) => i.to),
  ...moreNavItems({ role: "ADMIN" } as AuthUser).map((i) => i.to),
  "/profile",
];
