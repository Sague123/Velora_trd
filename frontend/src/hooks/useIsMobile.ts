import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// The desktop layout needs real horizontal room to fit market-watch + chart +
// order book + order entry side by side. A narrow window triggers it on width
// alone, but a portrait tablet or a roughly square window (tall relative to
// its width) is just as cramped even above 860px — so also fall back to the
// tabbed mobile layout whenever the window is squarish/portrait up to a
// moderately wide point.
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 860px), (max-width: 1280px) and (max-aspect-ratio: 5/4)");
}
