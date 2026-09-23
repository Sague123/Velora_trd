import type { ComponentType } from "react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { classNames } from "../lib/format";
import { useIsMobile } from "../hooks/useIsMobile";
import { Page } from "../components/layout/Page";
import {
  IconBell, IconCandles, IconChevron, IconShield, IconSliders, IconSun, IconTrade, IconUsers,
} from "../components/icons/Icon";
import { ProfileSection } from "../components/settings/ProfileSection";
import { AppearanceSection } from "../components/settings/AppearanceSection";
import { TradingSection } from "../components/settings/TradingSection";
import { ChartsSection } from "../components/settings/ChartsSection";
import { NotificationsSection } from "../components/settings/NotificationsSection";
import { SecuritySection } from "../components/settings/SecuritySection";

type SectionId = "profile" | "appearance" | "trading" | "charts" | "notifications" | "security";

const SECTIONS: { id: SectionId; Icon: ComponentType<{ size?: number }>; Component: ComponentType }[] = [
  { id: "profile", Icon: IconUsers, Component: ProfileSection },
  { id: "appearance", Icon: IconSun, Component: AppearanceSection },
  { id: "trading", Icon: IconTrade, Component: TradingSection },
  { id: "charts", Icon: IconCandles, Component: ChartsSection },
  { id: "notifications", Icon: IconBell, Component: NotificationsSection },
  { id: "security", Icon: IconShield, Component: SecuritySection },
];

/**
 * User Settings — one page for everything about the current account.
 *
 * Desktop: a quiet section list on the left, the section's rows on the
 * right. Phone: the list is its own screen and each section opens as the
 * next one (with a way back), the way settings work on a phone — rather
 * than squeezing a sidebar into 390px.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { section } = useParams<{ section?: string }>();
  const isMobile = useIsMobile();
  const current = SECTIONS.find((s) => s.id === section);

  if (section && !current) return <Navigate to="/settings" replace />;
  if (!section && !isMobile) return <Navigate to="/settings/profile" replace />;

  if (isMobile) {
    return (
      <Page width="narrow" className="px-4 pt-4">
        {current ? (
          <div className="pb-8">
            <Link to="/settings" className="tap -ml-2 mb-4 inline-flex items-center gap-1 rounded-lg px-2 text-sm text-txt-2 hover:text-txt-0">
              <IconChevron size={14} direction="left" /> {t("settings.title")}
            </Link>
            <current.Component />
          </div>
        ) : (
          <div className="pb-8">
            <h1 className="mb-6 text-xl font-semibold tracking-tight text-txt-0">{t("settings.title")}</h1>
            <nav aria-label={t("settings.title")} className="divide-y divide-line-soft border-y border-line-soft">
              {SECTIONS.map(({ id, Icon }) => (
                <Link key={id} to={`/settings/${id}`} className="flex min-h-[56px] items-center gap-3 py-3 text-sm text-txt-0">
                  <span className="text-txt-2"><Icon size={18} /></span>
                  <span className="flex-1">
                    <span className="block">{t(`settings.sections.${id}`)}</span>
                    <span className="block text-xs text-txt-3">{t(`settings.sectionHints.${id}`)}</span>
                  </span>
                  <span className="text-txt-3"><IconChevron size={14} direction="right" /></span>
                </Link>
              ))}
            </nav>
          </div>
        )}
      </Page>
    );
  }

  return (
    <Page width="narrow" className="max-w-5xl sm:px-6 sm:pt-8">
      <div className="flex gap-12 pb-12 pt-2">
        <aside className="w-52 shrink-0">
          <p className="mb-3 flex items-center gap-2 px-3 text-2xs font-semibold uppercase tracking-wider text-txt-3">
            <IconSliders size={13} /> {t("settings.title")}
          </p>
          <nav aria-label={t("settings.title")} className="sticky top-4 flex flex-col gap-0.5">
            {SECTIONS.map(({ id, Icon }) => (
              <NavLink
                key={id}
                to={`/settings/${id}`}
                className={({ isActive }) =>
                  classNames(
                    "flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors",
                    isActive ? "bg-bg-2 font-medium text-txt-0" : "text-txt-2 hover:bg-bg-1 hover:text-txt-0",
                  )
                }
              >
                <Icon size={16} /> {t(`settings.sections.${id}`)}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 max-w-2xl flex-1">{current && <current.Component />}</div>
      </div>
    </Page>
  );
}
