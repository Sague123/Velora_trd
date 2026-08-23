import type { ChartTheme } from "./chartEngine";
import type { Theme } from "../store/theme";

const DARK: ChartTheme = {
  bg: "#0a0d12",
  grid: "#12161d",
  text: "#6b7480",
  buy: "#17c885",
  sell: "#f5495e",
  accent: "#3d7cff",
  crosshair: "#4a515c",
};

const LIGHT: ChartTheme = {
  bg: "#ffffff",
  grid: "#eef0f3",
  text: "#6b7280",
  buy: "#0d965c",
  sell: "#dc3545",
  accent: "#2563eb",
  crosshair: "#9aa1ab",
};

export function chartThemeFor(theme: Theme): ChartTheme {
  return theme === "light" ? LIGHT : DARK;
}
