import { useId } from "react";
import type { CSSProperties } from "react";

export type RangeTone = "accent" | "warn" | "buy";

const TONE_VAR: Record<RangeTone, string> = {
  accent: "var(--c-accent)",
  warn: "var(--c-warn)",
  buy: "var(--c-buy)",
};

/**
 * A native `<input type="range">` restyled to carry meaning through colour
 * instead of the browser's flat accent-color chip: the track fills from a
 * neutral tone up to the given `tone` at full saturation as the value
 * climbs, so the bar itself reads as "how much of this range" — rising risk
 * for Leverage, rising size for Position size — not just a generic progress
 * bar. Tick marks (optional) sit on the track at fixed values, independent
 * of `step`, with labels positioned to match them exactly rather than spaced
 * evenly — the ticks themselves usually aren't (1/5/10/25x…).
 *
 * `snapPoints` gives the slider soft magnetism, Binance-style: a free,
 * granular `step` everywhere except within `snapTolerance` of one of these
 * values, where it locks on instead of forcing a pixel-perfect drag. Omit it
 * for a slider that should never round the input, like Leverage.
 */
export function RangeSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  tone = "accent",
  ticks,
  tickLabel,
  disabled,
  ariaLabel,
  snapPoints,
  snapTolerance = 2,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  tone?: RangeTone;
  ticks?: number[];
  tickLabel?: (t: number) => string;
  disabled?: boolean;
  ariaLabel?: string;
  snapPoints?: number[];
  snapTolerance?: number;
}) {
  const id = useId();
  const span = max - min;
  const pct = span > 0 ? ((value - min) / span) * 100 : 0;
  const colorVar = TONE_VAR[tone];
  const tickPct = (t: number) => (span > 0 ? ((t - min) / span) * 100 : 0);

  function handleChange(raw: number) {
    if (!snapPoints || snapPoints.length === 0) return onChange(raw);
    let nearest = snapPoints[0];
    for (const p of snapPoints) {
      if (Math.abs(p - raw) < Math.abs(nearest - raw)) nearest = p;
    }
    onChange(Math.abs(nearest - raw) <= snapTolerance ? nearest : raw);
  }

  return (
    <div>
      <div className="relative flex items-center py-1.5">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => handleChange(Number(e.target.value))}
          aria-label={ariaLabel}
          className="range-slider"
          style={
            {
              "--range-thumb": colorVar,
              background: `linear-gradient(to right, rgb(var(--c-bg-4)) 0%, rgb(${colorVar}) ${pct}%, rgb(var(--c-bg-4)) ${pct}%, rgb(var(--c-bg-4)) 100%)`,
            } as CSSProperties
          }
        />
        {/* 8px inset each side ≈ half the thumb's own width, so a tick at the
            slider's min/max lines up with where the thumb actually travels to
            rather than the raw 0%/100% of the element's box. */}
        {ticks && ticks.length > 0 && (
          <div className="pointer-events-none absolute left-2 right-2 top-1/2 h-2 -translate-y-1/2" aria-hidden>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute top-0 h-2 w-px -translate-x-1/2 bg-bg-0/70"
                style={{ left: `${tickPct(t)}%` }}
              />
            ))}
          </div>
        )}
      </div>
      {ticks && ticks.length > 0 && tickLabel && (
        <div className="relative mx-2 h-3 text-[9px] text-txt-3">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-0 -translate-x-1/2 tabular first:translate-x-0 last:-translate-x-full"
              style={{ left: `${tickPct(t)}%` }}
            >
              {tickLabel(t)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
