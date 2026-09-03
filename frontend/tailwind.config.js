/** @type {import('tailwindcss').Config} */
function rgbVar(name) {
  return `rgb(var(${name}) / <alpha-value>)`;
}

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: {
          0: rgbVar("--c-bg-0"),
          1: rgbVar("--c-bg-1"),
          2: rgbVar("--c-bg-2"),
          3: rgbVar("--c-bg-3"),
          4: rgbVar("--c-bg-4"),
        },
        line: {
          DEFAULT: rgbVar("--c-line"),
          soft: rgbVar("--c-line-soft"),
        },
        txt: {
          0: rgbVar("--c-txt-0"),
          1: rgbVar("--c-txt-1"),
          2: rgbVar("--c-txt-2"),
          3: rgbVar("--c-txt-3"),
        },
        accent: {
          DEFAULT: rgbVar("--c-accent"),
          dim: rgbVar("--c-accent-dim"),
          soft: rgbVar("--c-accent-soft"),
          // Use as the background under white text (bg-accent-fill); the
          // plain accent is a text/border colour and is too light to carry
          // white legibly. See globals.css for the arithmetic.
          fill: rgbVar("--c-accent-fill"),
        },
        buy: {
          DEFAULT: rgbVar("--c-buy"),
          dim: rgbVar("--c-buy-dim"),
          soft: rgbVar("--c-buy-soft"),
          // Same reasoning as accent.fill above: the plain buy/sell colors
          // are tuned as text, not as a solid fill under white/black text.
          // See globals.css for the arithmetic.
          fill: rgbVar("--c-buy-fill"),
        },
        sell: {
          DEFAULT: rgbVar("--c-sell"),
          dim: rgbVar("--c-sell-dim"),
          soft: rgbVar("--c-sell-soft"),
          fill: rgbVar("--c-sell-fill"),
        },
        warn: rgbVar("--c-warn"),
        // CRM-only categorical palette — see globals.css for why these six
        // exist and the scope note restricting them to lead-status chips.
        cat: {
          gold: { DEFAULT: rgbVar("--c-cat-gold"), soft: rgbVar("--c-cat-gold-soft") },
          teal: { DEFAULT: rgbVar("--c-cat-teal"), soft: rgbVar("--c-cat-teal-soft") },
          indigo: { DEFAULT: rgbVar("--c-cat-indigo"), soft: rgbVar("--c-cat-indigo-soft") },
          violet: { DEFAULT: rgbVar("--c-cat-violet"), soft: rgbVar("--c-cat-violet-soft") },
          magenta: { DEFAULT: rgbVar("--c-cat-magenta"), soft: rgbVar("--c-cat-magenta-soft") },
          rose: { DEFAULT: rgbVar("--c-cat-rose"), soft: rgbVar("--c-cat-rose-soft") },
        },
        // Terminal-only chart indicator colors — never CRM. See globals.css;
        // kept in sync with lib/chartTheme.ts, which uses the same two hues
        // as hex for the canvas-drawn overlay line itself.
        indicator: {
          ema9: rgbVar("--c-indicator-ema9"),
          ema21: rgbVar("--c-indicator-ema21"),
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "'JetBrains Mono'",
          "'SFMono-Regular'",
          "Consolas",
          "'Liberation Mono'",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": ["10.5px", { lineHeight: "14px" }],
      },
      boxShadow: {
        // reads the theme-aware token from globals.css instead of a fixed
        // dark-only value, so it actually looks right in light mode too
        panel: "var(--shadow-panel)",
        // The token .btn-fx already applies on hover — exposed here so a
        // control can also carry it at rest. (`shadow-btn` was already being
        // written in components before this existed, and quietly did nothing.)
        btn: "var(--shadow-btn)",
        // A larger lift, for a page's single primary action.
        lift: "var(--shadow-lift)",
        // A smaller lift than `lift`, for CRM/Admin/Overview cards that float
        // above their section on hover — never used in the dense terminal.
        float: "var(--shadow-float)",
      },
    },
  },
  plugins: [],
};
