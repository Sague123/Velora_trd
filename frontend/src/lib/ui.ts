/**
 * Canonical class strings for form controls.
 *
 * The same input was being spelled eight different ways across the app —
 * `rounded` here, `rounded-lg` there, `rounded-xl` in one modal, padding
 * anywhere from `px-1 py-0.5` to `px-3 py-2.5`, and a text size picked per
 * file. Each spelling looked fine alone; side by side on Profile, or above a
 * Button, they did not line up.
 *
 * Sizes mirror Button's exactly, so a field and the button next to it are the
 * same height and radius. Import these instead of re-declaring a local
 * `inputCls` — that local const is how the drift started.
 */
export type FieldSize = "sm" | "md" | "lg";

const FIELD_SIZES: Record<FieldSize, string> = {
  sm: "h-7 rounded px-2 text-2xs",
  md: "h-8 rounded-lg px-2.5 text-xs",
  lg: "h-10 rounded-lg px-3 text-sm",
};

// Deliberately no width: `w-full` in the base would collide with a caller's
// own `w-24` (two same-specificity Tailwind utilities — the stylesheet's
// order decides, not the class attribute's), so width stays the caller's.
const FIELD_BASE =
  "border border-line bg-bg-2 text-txt-0 outline-none transition-colors " +
  "placeholder:text-txt-3 focus:border-accent disabled:cursor-not-allowed disabled:opacity-50";

/** Input / select / any single-line control. `tabular` for numeric fields. */
export function fieldCls(size: FieldSize = "md", extra = ""): string {
  return `${FIELD_BASE} ${FIELD_SIZES[size]} ${extra}`.trim();
}

/** Multi-line: same skin, no fixed height. */
export function textareaCls(size: FieldSize = "md", extra = ""): string {
  const sized = FIELD_SIZES[size].replace(/h-\d+\s?/, "");
  return `${FIELD_BASE} ${sized} py-2 ${extra}`.trim();
}

/** The label above a field. */
export const labelCls = "mb-1 block text-2xs font-medium text-txt-2";

/* ------------------------------------------------------------------ */

/**
 * Button skin, shared with the `Button` component (which is this plus the
 * `<button>` element). Exposed as a class string too, because a lot of call
 * sites already have a `<button>` with their own handlers/aria wiring — those
 * only ever needed the *look* unified, not their markup rewritten.
 *
 * `buy`/`sell` mean market direction, never confirm/cancel. Destructive is
 * `danger`: neutral at rest, sell-toned on hover, the way the terminal's
 * cancel-order and close-position controls already read.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "buy" | "sell" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent-fill text-white shadow-btn hover:brightness-110",
  secondary: "border border-line bg-bg-2 text-txt-1 hover:border-accent hover:text-accent",
  ghost: "text-txt-2 hover:bg-bg-2 hover:text-txt-0",
  buy: "bg-buy-fill text-white shadow-btn hover:brightness-110",
  sell: "bg-sell-fill text-white shadow-btn hover:brightness-110",
  danger: "border border-line bg-bg-2 text-txt-1 hover:border-sell hover:text-sell",
};

// Heights match fieldCls exactly, so a button and the input beside it line up
// instead of each being however tall its own padding made it. Radius follows
// the design system: `sm` is a dense terminal control (4px), the rest is app
// chrome (8px). `tap`/`tap-sm` still floor the touch target on a phone.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "tap-sm h-7 gap-1 rounded px-2.5 text-2xs",
  md: "tap-sm h-8 gap-1.5 rounded-lg px-3 text-xs",
  lg: "tap h-10 gap-2 rounded-lg px-4 text-sm",
};

const BUTTON_BASE =
  "btn-fx inline-flex shrink-0 items-center justify-center font-semibold transition-colors " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent " +
  "disabled:cursor-not-allowed disabled:opacity-40";

export function buttonCls(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra = ""): string {
  return `${BUTTON_BASE} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${extra}`.trim();
}
