import { useTranslation } from "react-i18next";
import { SectionHeader } from "./ui";

export function TradingSection() {
  const { t } = useTranslation();
  return <SectionHeader title={t("settings.sections.trading")} description={t("settings.sectionHints.trading")} />;
}
