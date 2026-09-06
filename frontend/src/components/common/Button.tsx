import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "../../lib/format";
import { buttonCls, type ButtonSize, type ButtonVariant } from "../../lib/ui";

/**
 * The one button in Velora.
 *
 * Before this, "the primary action button" existed in ~20 slightly different
 * spellings — `px-3 py-1.5 text-2xs font-semibold` here, `px-4 py-1.5 text-xs`
 * there, `py-3 text-sm font-bold` in a modal, half with `hover:brightness-110`
 * and half with `hover:bg-accent-dim`, `disabled:opacity-40` beside
 * `disabled:opacity-50`, and `focus-visible` on maybe a third of them. None of
 * that was a decision; it was drift.
 *
 * Two axes, both closed: `variant` is what the button means, `size` is how
 * dense the surface around it is. Everything else — radius, height, focus
 * ring, disabled treatment — follows from those. See `buttonCls` in lib/ui.ts,
 * which this shares with the call sites that keep their own `<button>`.
 */
export type { ButtonSize, ButtonVariant };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches to the container — the common case for a form's submit. */
  block?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "secondary", size = "md", block = false, className, type = "button", children, ...rest
}: ButtonProps) {
  return (
    <button type={type} className={classNames(buttonCls(variant, size), block && "w-full", className)} {...rest}>
      {children}
    </button>
  );
}
