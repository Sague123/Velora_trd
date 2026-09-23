import { useTranslation } from "react-i18next";
import { SectionHeader } from "./ui";

export function NotificationsSection() {
  const { t } = useTranslation();
  return <SectionHeader title={t("settings.sections.notifications")} description={t("settings.sectionHints.notifications")} />;
}
