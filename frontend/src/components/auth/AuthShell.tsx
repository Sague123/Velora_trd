import type { ReactNode } from "react";
import { classNames } from "../../lib/format";

/**
 * The frame every out-of-app auth screen shares — login, registration, the
 * emailed-link screens. Extracted so a new one cannot drift into looking like
 * a different product, and so the logo, width and spacing exist in one place.
 *
 * Deliberately roomier than the terminal behind it. Density is right when
 * someone is watching a book tick; it is wrong on the one screen where a
 * person is typing a password they will have to remember.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    // text-txt-0 explicitly: these screens render outside the app shell, so they
    // inherit no text colour from it — without this the wordmark below is
    // near-invisible in light mode.
    <div className="flex min-h-screen w-full items-center justify-center bg-bg-0 px-4 py-10 text-txt-0">
      <div className={classNames("w-full", wide ? "max-w-lg" : "max-w-md")}>
        <div className="mb-6 flex flex-col items-center gap-2">
          <svg width="40" height="40" viewBox="0 0 32 32" aria-hidden className="drop-shadow-[0_4px_12px_rgb(var(--c-buy)/0.25)]">
            <rect width="32" height="32" rx="7" fill="#0b0e14" />
            <path d="M8 9l8 15 8-15h-3.4L16 19.6 10.4 9H8z" fill="#17c885" />
          </svg>
          <div className="text-base font-semibold tracking-tight">Velora Terminal</div>
        </div>

        <div className="anim-rise rounded-xl border border-line bg-bg-1 p-6 shadow-lift sm:p-7">
          <h1 className="text-base font-semibold tracking-tight text-txt-0">{title}</h1>
          {subtitle && <div className="mt-1 text-2xs leading-relaxed text-txt-2">{subtitle}</div>}
          <div className="mt-5">{children}</div>
        </div>

        {footer && <div className="mt-4 text-center text-2xs text-txt-2">{footer}</div>}
      </div>
    </div>
  );
}

/** Field styling shared by every auth form. Taller than a terminal input on
 * purpose — these are typed once, carefully, not scanned. */
export const authInputCls =
  "w-full rounded-lg border border-line bg-bg-2 px-3 py-2.5 text-xs text-txt-0 outline-none transition-colors placeholder:text-txt-3 focus:border-accent";

/** The single primary action on the page: the one place in Velora that carries
 * a real shadow at rest, and lifts further on hover. */
export const authButtonCls =
  "btn-fx w-full rounded-lg bg-accent-fill py-2.5 text-xs font-semibold text-white shadow-btn hover:bg-accent-dim hover:shadow-lift disabled:opacity-50 disabled:shadow-none";

/** Secondary actions: bordered, no fill, same height so rows line up. */
export const authGhostCls =
  "btn-fx w-full rounded-lg border border-line bg-bg-2/40 py-2.5 text-xs font-medium text-txt-1 hover:border-accent hover:text-accent disabled:opacity-50";
