import { useTranslation } from "react-i18next";
import { SectionHeader } from "./ui";

export function ChartsSection() {
  const { t } = useTranslation();
  return <SectionHeader title={t("settings.sections.charts")} description={t("settings.sectionHints.charts")} />;
}
