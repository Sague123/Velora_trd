import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage } from "../../i18n";
import { IconGlobe } from "../icons/Icon";
import { classNames } from "../../lib/format";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Language"
        title="Language"
        className="btn-fx tap-sm flex items-center gap-1 rounded border border-line px-1.5 py-1 text-txt-2 hover:border-accent hover:text-accent"
      >
        <IconGlobe size={14} />
        <span className="hidden text-2xs sm:inline">{current.flag}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-44 overflow-y-auto rounded border border-line bg-bg-2 py-1 shadow-xl">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLanguage(l.code); setOpen(false); }}
              className={classNames(
                "flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-bg-3",
                l.code === current.code ? "text-accent" : "text-txt-1"
              )}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
