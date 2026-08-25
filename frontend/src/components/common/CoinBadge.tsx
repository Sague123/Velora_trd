/** A colored letter-badge per instrument — same idea as the app's existing
 * user Avatar (first letter, deterministic color), extended to instruments
 * so market lists read as a set of distinct assets instead of a monotone
 * spreadsheet, without pretending to have real exchange coin artwork. */
const PALETTE = ["#3d7cff", "#7c3aed", "#17c885", "#e0a53c", "#22d3ee", "#f472b6", "#f97316", "#a3e635", "#f43f5e", "#818cf8"];

function hashColor(symbol: string): string {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** #rrggbb scaled toward black by `amount` (0–1), staying fully opaque. */
function darken(hex: string, amount: number): string {
  const ch = [1, 3, 5].map((i) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount))
      .toString(16)
      .padStart(2, "0")
  );
  return `#${ch.join("")}`;
}

/** Relative luminance of a #rrggbb colour, per WCAG. */
function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

export function CoinBadge({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const base = symbol.replace(/(USDT|USDC|-PERP)$/, "");
  const color = hashColor(symbol);
  // `size * 0.32` alone rendered 7.7px letters on the 24px badges used in
  // tables — below the 9px legibility floor, so the ticker was a smudge.
  // Clamp to the floor, and once the badge is too small to seat even one
  // legible glyph, drop the letters entirely rather than shipping noise:
  // the colour alone still does the "these rows are different assets" job.
  const fontSize = Math.max(9, Math.round(size * 0.34));
  const showLabel = size >= 22;
  // Two characters fit comfortably; three only once there's room for them.
  const label = base.slice(0, size >= 30 ? 3 : 2);
  // The gradient's far stop used to be `${color}99` — 60% alpha — so the badge
  // blended into whatever sat behind it and its effective contrast changed
  // with the theme. An opaque darker stop keeps the chip identical in both.
  const shade = darken(color, 0.22);
  // Half the palette is a light pastel; white lettering on those measured as
  // low as 1.5:1. 0.18 is where WCAG's white-vs-black crossover actually
  // falls for a 4.5:1 target, so this picks whichever foreground clears it.
  const fg = luminance(color) > 0.18 ? "#0b0e14" : "#ffffff";
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold leading-none"
      style={{
        width: size,
        height: size,
        fontSize,
        color: fg,
        background: `linear-gradient(135deg, ${color}, ${shade})`,
      }}
      aria-hidden
    >
      {showLabel ? label : ""}
    </span>
  );
}
