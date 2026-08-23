/** Tiny inline SVG trend line — no charting library, consistent with the
 * rest of the app's hand-rolled canvas chart engine. Renders real recent
 * closes (see useSparkline); a flat/empty series renders nothing rather
 * than a misleading flat line. */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  positive,
}: {
  values: number[] | null | undefined;
  width?: number;
  height?: number;
  positive: boolean;
}) {
  if (!values || values.length < 2) {
    return <div style={{ width, height }} className="shrink-0" aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(height - ((v - min) / range) * height).toFixed(2)}`)
    .join(" ");
  const stroke = positive ? "rgb(var(--c-buy))" : "rgb(var(--c-sell))";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" aria-hidden>
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
