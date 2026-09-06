import { Link } from "react-router-dom";
import { Logo } from "./Logo";

/**
 * Closing band for any scrollable page. Beyond the branding, it does a
 * practical job: it gives the scroll a clear, deliberate end, so the last
 * real content block is never left flush against the browser chrome looking
 * like it was cut off mid-page.
 *
 * `compact` is for use inside the authenticated app: no marketing tagline,
 * no nav links (the app shell's own TopBar already has Markets/Trade/
 * Strategies — repeating them here read as a second, marketing-site nav
 * bolted onto a logged-in trading screen), just the minimal close-of-page
 * marker the practical job above actually needs.
 */
export function SiteFooter({ compact = false }: { compact?: boolean } = {}) {
  if (compact) {
    return (
      <footer className="mt-3 border-t border-line-soft px-1 py-2.5 text-2xs text-txt-3">
        <div className="flex items-center gap-1.5">
          <Logo size={13} />
          <span className="font-medium text-txt-2">Velora</span>
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-6 border-t border-line bg-bg-1">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Logo size={18} />
          <span className="text-sm font-semibold tracking-tight text-txt-0">Velora</span>
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
