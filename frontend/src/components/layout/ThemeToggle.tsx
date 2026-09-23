import { iconButtonCls } from "../../lib/ui";
import { useThemeStore } from "../../store/theme";
import { IconMoon, IconSun } from "../icons/Icon";

/** `className` replaces the header icon-button skin, for surfaces (the
 * landing header) that size their controls differently. */
export function ThemeToggle({ className = iconButtonCls }: { className?: string }) {
  const theme = useThemeStore((t) => t.theme);
  const toggle = useThemeStore((t) => t.toggle);
  return (
    <button
      onClick={toggle}
      aria-label="Переключить тему"
      className={className}
    >
      {theme === "dark" ? <IconMoon /> : <IconSun />}
    </button>
  );
}
