import { iconButtonCls } from "../../lib/ui";
import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage } from "../../i18n";
import { IconGlobe } from "../icons/Icon";
import { classNames } from "../../lib/format";

/**
 * `className` replaces the header icon-button skin; `align` picks which edge
 * the menu hangs from, so a switcher at the left of a row doesn't open off
 * the screen.
 */
export function LanguageSwitcher({
  className = iconButtonCls, align = "right", showFlag = true,
}: {
  className?: string;
  align?: "left" | "right";
  showFlag?: boolean;
}) {
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
        aria-expanded={open}
        className={className}
      >
        <IconGlobe />
        {showFlag && <span className="hidden text-2xs sm:inline">{current.flag}</span>}
      </button>
      {open && (
        <div className={classNames("absolute top-full z-50 mt-1", align === "right" ? "right-0" : "left-0", "max-h-80 w-44 overflow-y-auto rounded border border-line bg-bg-2 py-1 shadow-float")}>
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
