import { useTranslation } from "react-i18next";
import { SectionHeader } from "./ui";

export function ProfileSection() {
  const { t } = useTranslation();
  return <SectionHeader title={t("settings.sections.profile")} description={t("settings.sectionHints.profile")} />;
}
