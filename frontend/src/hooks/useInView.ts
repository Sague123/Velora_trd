import { useEffect, useRef, useState } from "react";

/**
 * True once the element has scrolled into view — flips once and stays true;
 * this is for a one-shot entrance reveal, not a visibility tracker.
 *
 * Defaults to true (not false) whenever IntersectionObserver is unsupported
 * or the user prefers reduced motion, so a broken or skipped observer can
 * never leave content stuck in its "not yet revealed" state — same guarantee
 * AnimatedNumber already gives its own callers.
 */
export function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(el);
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView };
}
