import { useThemeStore } from "../../store/theme";
import { IconMoon, IconSun } from "../icons/Icon";

export function ThemeToggle() {
  const theme = useThemeStore((t) => t.theme);
  const toggle = useThemeStore((t) => t.toggle);
  return (
    <button
      onClick={toggle}
      aria-label="Переключить тему"
      className="btn-fx tap-sm rounded border border-line px-1.5 py-1 text-txt-2 hover:border-accent hover:text-accent"
    >
      {theme === "dark" ? <IconMoon /> : <IconSun />}
    </button>
  );
}
