import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./locales/ru.json";
import en from "./locales/en.json";
import de from "./locales/de.json";
import zh from "./locales/zh.json";
import cs from "./locales/cs.json";
import sk from "./locales/sk.json";
import pl from "./locales/pl.json";
import it from "./locales/it.json";
import uk from "./locales/uk.json";

export interface LanguageOption {
  code: string;
  label: string;
  flag: string;
}

// Ordered by global reach (native + second-language speakers worldwide),
// not alphabetically or by app-source language — English and Chinese are
// each spoken by over a billion people, Russian by a quarter billion, and
// so on down to Slovak. This is what "popularity/demand" means for a
// picker meant to be useful to the most people fastest.
export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "uk", label: "Українська", flag: "🇺🇦" },
  { code: "cs", label: "Čeština", flag: "🇨🇿" },
  { code: "sk", label: "Slovenčina", flag: "🇸🇰" },
];

const STORAGE_KEY = "velora-language";

function initialLanguage(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch { /* localStorage unavailable */ }
  return "ru";
}

i18next.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
    de: { translation: de },
    zh: { translation: zh },
    cs: { translation: cs },
    sk: { translation: sk },
    pl: { translation: pl },
    it: { translation: it },
    uk: { translation: uk },
  },
  lng: initialLanguage(),
  fallbackLng: "ru",
  interpolation: { escapeValue: false },
});

export function setLanguage(code: string) {
  i18next.changeLanguage(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch { /* localStorage unavailable */ }
}

export default i18next;
