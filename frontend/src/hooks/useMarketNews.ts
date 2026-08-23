import { useQuery } from "@tanstack/react-query";

export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  imageUrl: string | null;
  publishedAt: number; // unix seconds
}

/**
 * Real crypto headlines from CryptoCompare's public news endpoint (no key
 * required for this feed). If it's unreachable — network/CORS/upstream
 * down — this resolves to `null`, and MarketNewsSection renders an honest
 * "feed not connected" state instead of fabricating articles or throwing.
 * Swapping in a different provider later is just a new fetch in here; the
 * component only ever consumes the NewsArticle[] shape.
 */
async function fetchNews(): Promise<NewsArticle[] | null> {
  try {
    const res = await fetch("https://min-api.cryptocompare.com/data/v2/news/?lang=EN");
    if (!res.ok) return null;
    const json = await res.json();
    const rows = json?.Data;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows.slice(0, 8).map((r: any): NewsArticle => ({
      id: String(r.id ?? r.guid ?? r.url),
      title: String(r.title ?? "").trim(),
      url: String(r.url ?? "#"),
      source: String(r.source_info?.name ?? r.source ?? "—"),
      imageUrl: r.imageurl && String(r.imageurl).startsWith("http") ? String(r.imageurl) : null,
      publishedAt: Number(r.published_on) || 0,
    })).filter((a: NewsArticle) => a.title.length > 0);
  } catch {
    return null;
  }
}

export function useMarketNews() {
  return useQuery({
    queryKey: ["market-news"],
    queryFn: fetchNews,
    staleTime: 4 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
}
