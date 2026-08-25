import { Link } from "react-router-dom";
import { classNames } from "../../lib/format";
import { Logo } from "./Logo";

/**
 * Closing band for any scrollable page. Beyond the branding, it does a
 * practical job: it gives the scroll a clear, deliberate end, so the last
 * real content block is never left flush against the browser chrome looking
 * like it was cut off mid-page.
 *
 * `compact` trims the padding for use inside the authenticated app, where
 * vertical space is worth more than on the marketing pages.
 */
export function SiteFooter({ compact = false }: { compact?: boolean } = {}) {
  return (
    <footer className={classNames("border-t border-line bg-bg-1", compact ? "mt-3" : "mt-6")}>
      <div
        className={classNames(
          "mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between",
          compact ? "py-3" : "py-6"
        )}
      >
        <div className="flex items-center gap-2">
          <Logo size={compact ? 16 : 18} />
          <span className={classNames("font-semibold tracking-tight text-txt-0", compact ? "text-xs" : "text-sm")}>
            Velora
          </span>
          <span className="text-2xs text-txt-3">— лучшая криптоплатформа</span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-txt-2">
          <Link to="/markets" className="hover:text-accent">Markets</Link>
          <Link to="/terminal" className="hover:text-accent">Trade</Link>
          <Link to="/strategies" className="hover:text-accent">Strategies</Link>
          <Link to="/legal/privacy" className="hover:text-accent">Политика данных</Link>
        </nav>
      </div>
    </footer>
  );
}
