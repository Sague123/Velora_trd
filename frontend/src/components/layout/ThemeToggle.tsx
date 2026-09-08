import { iconButtonCls } from "../../lib/ui";
import { useThemeStore } from "../../store/theme";
import { IconMoon, IconSun } from "../icons/Icon";

export function ThemeToggle() {
  const theme = useThemeStore((t) => t.theme);
  const toggle = useThemeStore((t) => t.toggle);
  return (
    <button
      onClick={toggle}
      aria-label="Переключить тему"
      className={iconButtonCls}
    >
      {theme === "dark" ? <IconMoon /> : <IconSun />}
    </button>
  );
}
