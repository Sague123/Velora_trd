import { iconButtonCls } from "../../lib/ui";
import { useThemeStore } from "../../store/theme";
import { useAuthStore } from "../../store/auth";
import { rememberAppearance } from "../../store/userSettings";
import { IconMoon, IconSun } from "../icons/Icon";

/** `className` replaces the header icon-button skin, for surfaces (the
 * landing header) that size their controls differently. */
export function ThemeToggle({ className = iconButtonCls }: { className?: string }) {
  const theme = useThemeStore((t) => t.theme);
  const toggle = useThemeStore((t) => t.toggle);
  const signedIn = useAuthStore((s) => !!s.user);
  return (
    <button
      onClick={() => { toggle(); rememberAppearance({ theme: useThemeStore.getState().mode }, signedIn); }}
      aria-label="Переключить тему"
      className={className}
    >
      {theme === "dark" ? <IconMoon /> : <IconSun />}
    </button>
  );
}
