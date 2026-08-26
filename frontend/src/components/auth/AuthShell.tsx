import type { ReactNode } from "react";

/**
 * The frame every out-of-app auth screen shares — login, registration, the
 * emailed-link screens. Extracted so a new one (verify email, reset password)
 * cannot drift into looking like a different product, and so the logo and
 * spacing exist in exactly one place.
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
    <div className="flex min-h-screen w-full items-center justify-center bg-bg-0 px-4 py-8">
      <div className={wide ? "w-full max-w-lg" : "w-full max-w-sm"}>
        <div className="mb-8 flex flex-col items-center gap-2">
          <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="6" fill="#0b0e14" />
            <path d="M8 9l8 15 8-15h-3.4L16 19.6 10.4 9H8z" fill="#17c885" />
          </svg>
          <div className="text-base font-semibold tracking-tight">Velora Terminal</div>
        </div>

        <div className="rounded border border-line bg-bg-1 p-5 shadow-panel">
          <h1 className="mb-1 text-sm font-semibold text-txt-0">{title}</h1>
          {subtitle && <div className="mb-4 text-2xs text-txt-2">{subtitle}</div>}
          {children}
        </div>

        {footer && <div className="mt-3 text-center text-2xs text-txt-2">{footer}</div>}
      </div>
    </div>
  );
}

export const authInputCls =
  "w-full rounded border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent";
export const authButtonCls =
  "w-full rounded bg-accent-fill py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-dim disabled:opacity-50";
