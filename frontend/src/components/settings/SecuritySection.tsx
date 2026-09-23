import { useTranslation } from "react-i18next";
import { SectionHeader } from "./ui";

export function SecuritySection() {
  const { t } = useTranslation();
  return <SectionHeader title={t("settings.sections.security")} description={t("settings.sectionHints.security")} />;
}
