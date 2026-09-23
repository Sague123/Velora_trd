import { useTranslation } from "react-i18next";
import { SectionHeader } from "./ui";

export function AppearanceSection() {
  const { t } = useTranslation();
  return <SectionHeader title={t("settings.sections.appearance")} description={t("settings.sectionHints.appearance")} />;
}
