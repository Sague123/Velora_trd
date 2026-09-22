import type { ReactNode } from "react";
import { classNames } from "../../../lib/format";

/**
 * The landing page's visual vocabulary — a small set of primitives every
 * section composes differently, so six sections read as one system instead of
 * six unrelated layouts.
 *
 * Coordinates throughout are in a 0–100 percent space. SVG strokes are drawn
 * in a `viewBox="0 0 100 100"` with `preserveAspectRatio="none"` and
 * `vector-effect: non-scaling-stroke`, and anything that must not distort
 * (dots, labels) is HTML placed at the same percentages. One coordinate set
 * therefore lines up at every width, which is what lets the same trajectory
 * serve desktop, tablet and phone.
 */

/** The page measure. One place, so no section invents its own width. */
export const LANDING_WRAP = "mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8";

/**
 * Section boundaries. Open sections sit on the page (bg-0); the raised ones
 * are inset, rounded bg-1 panels with a small gutter, so the page alternates
 * open → contained → open and every section edge is visible without a single
 * divider line. The content inside still uses LANDING_WRAP, so text columns
 * line up across open and contained sections alike.
 */
export const LANDING_PANEL_GUTTER = "px-2 sm:px-4 lg:px-6";
export const LANDING_PANEL = "mx-auto max-w-[1440px] overflow-hidden rounded-xl border border-line bg-bg-1";

export type Point = readonly [x: number, y: number];

export function toPath(points: readonly Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
}

/**
 * The page's signature line. It recurs — hero, market system, final call —
 * so the page reads as one continuous movement rather than six drawings.
 * Illustrative: an abstract grid-strategy trace, not a real instrument's price.
 */
export const SIGNATURE: readonly Point[] = [
  [0, 84], [6, 80], [12, 86], [19, 72], [25, 65], [31, 70], [38, 58], [44, 50],
  [50, 56], [57, 44], [63, 35], [69, 40], [76, 28], [82, 20], [88, 24], [96, 12],
];

/** Grid levels the signature line is drawn against, L1 (lowest) to L5. */
export const LEVELS = [80, 65, 50, 35, 20] as const;

/** The vertices where the line lands exactly on a level — the "fills". */
export const FILLS: readonly Point[] = SIGNATURE.filter(([, y]) => (LEVELS as readonly number[]).includes(y));

/** `01 — ARSENAL`. The index carries the brand blue; the word stays quiet. */
export function SectionLabel({ index, label }: { index: string; label: string }) {
  return (
    <p className="font-mono text-2xs uppercase tracking-widest text-txt-3">
      <span className="text-accent">{index}</span> — {label}
    </p>
  );
}

/** Small technical annotation: axis ticks, level names, instrument tags. */
export function TechLabel({
  children, tone = "muted", className,
}: {
  children: ReactNode;
  tone?: "muted" | "strong" | "accent";
  className?: string;
}) {
  return (
    <span
      className={classNames(
        "font-mono text-2xs uppercase tracking-widest",
        tone === "muted" && "text-txt-3",
        tone === "strong" && "text-txt-1",
        tone === "accent" && "text-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Chart-paper backdrop. An SVG pattern rather than a repeating CSS gradient:
 * it is structure, not a colour effect, and it scales without banding.
 */
export function GridLines({ id, cell = 48, className }: { id: string; cell?: number; className?: string }) {
  return (
    <svg aria-hidden className={classNames("pointer-events-none absolute inset-0 h-full w-full", className)}>
      <defs>
        <pattern id={id} width={cell} height={cell} patternUnits="userSpaceOnUse">
          <path d={`M${cell} 0H0V${cell}`} fill="none" className="stroke-line-soft" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * A stroke in the shared 0–100 space. Always 1px on screen regardless of how
 * far the box is stretched, because every chart here is drawn at the width it
 * is given rather than at a fixed aspect ratio.
 */
export function Stroke({
  d, className, dashed, width = 1.5,
}: {
  d: string;
  className: string;
  dashed?: boolean;
  width?: number;
}) {
  return (
    <path
      d={d}
      fill="none"
      className={className}
      strokeWidth={width}
      strokeDasharray={dashed ? "3 5" : undefined}
      strokeLinejoin="round"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** Anything placed by the shared coordinates — dots, tags, labels. */
export function At({ x, y, children, className }: { x: number; y: number; children: ReactNode; className?: string }) {
  return (
    <span
      className={classNames("absolute -translate-x-1/2 -translate-y-1/2", className)}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {children}
    </span>
  );
}

/**
 * A point where the market touched something — a filled grid level, a node.
 * The ring punches the node out of whatever line it sits on, so it must match
 * the surface: `on="bg-1"` inside the raised sections.
 */
export function Node({
  tone = "accent", size = "md", on = "bg-0",
}: {
  tone?: "accent" | "buy" | "sell" | "muted";
  size?: "sm" | "md";
  on?: "bg-0" | "bg-1";
}) {
  return (
    <span
      aria-hidden
      className={classNames(
        "block rounded-full ring-4",
        on === "bg-0" ? "ring-bg-0" : "ring-bg-1",
        size === "md" ? "h-2 w-2" : "h-1.5 w-1.5",
        tone === "accent" && "bg-accent",
        tone === "buy" && "bg-buy",
        tone === "sell" && "bg-sell",
        tone === "muted" && "bg-txt-3",
      )}
    />
  );
}

/**
 * Direction of travel. Uses `buy` because it states market direction, which
 * is the one meaning the design system allows that colour to carry.
 */
export function DirectionMarker() {
  return (
    <svg aria-hidden viewBox="0 0 10 10" className="h-2.5 w-2.5 fill-buy">
      <path d="M5 0l5 9H0z" />
    </svg>
  );
}
