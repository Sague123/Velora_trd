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
  // English first for everything but English itself: a string not yet
  // translated into, say, German reads better in English than in Russian.
  fallbackLng: { en: ["ru"], default: ["en", "ru"] },
  interpolation: { escapeValue: false },
});

/**
 * Keeps <html lang> on the language actually being shown.
 *
 * index.html hardcodes lang="ru", which stopped being true the moment the
 * picker got nine entries. It is not decoration: it is what a screen reader
 * picks a voice from, what `:lang()` and hyphenation rules key off, and what
 * a browser offers to translate against. The native date inputs in the CRM
 * filter bar follow the *browser's* UI locale rather than this, so they are
 * not what this fixes — but everything that does read the document's language
 * was reading "Russian" for a German user.
 */
function syncDocumentLanguage(code: string): void {
  if (typeof document !== "undefined") document.documentElement.lang = code;
}

syncDocumentLanguage(i18next.language);

export function setLanguage(code: string) {
  i18next.changeLanguage(code);
  syncDocumentLanguage(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch { /* localStorage unavailable */ }
}

export default i18next;
