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

export function CoinBadge({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const base = symbol.replace(/(USDT|USDC|-PERP)$/, "");
  const color = hashColor(symbol);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        background: `linear-gradient(135deg, ${color}, ${color}99)`,
      }}
      aria-hidden
    >
      {base.slice(0, 3)}
    </span>
  );
}
