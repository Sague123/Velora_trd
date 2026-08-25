import { Link } from "react-router-dom";
import { Logo } from "./Logo";

/**
 * Closing band for the public pages. Beyond the branding, it does a practical
 * job on mobile: it gives the scroll a clear, deliberate end so the last real
 * content block is never left flush against the browser chrome looking cut off.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
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

      <div className="border-t border-line-soft px-4 py-3">
        <p className="mx-auto max-w-[1600px] text-2xs leading-relaxed text-txt-3">
          © {year} Velora. Котировки поставляются Binance и отображаются как есть; торговля ведётся
          виртуальными средствами. Материалы платформы носят информационный характер и не являются
          инвестиционной рекомендацией.
        </p>
      </div>
    </footer>
  );
}
