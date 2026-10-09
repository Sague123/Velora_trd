import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import type { BrowseResponse, CatalogCategory, CountsResponse, MarketKind } from "../lib/marketTypes";

/**
 * Browsing a catalogue that no longer fits in one response.
 *
 * Paged rather than fetched whole: with thousands of instruments, "give me
 * everything and filter in the browser" is a multi-megabyte download before
 * the first row renders, and the filtering the server can do with an index
 * the client would do with a linear scan on every keystroke.
 */

const PAGE_SIZE = 100;

export interface CatalogFilters {
  category?: CatalogCategory;
  market?: MarketKind;
  q?: string;
}

function toQuery(filters: CatalogFilters, page: number): string {
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (filters.category) params.set("category", filters.category);
  if (filters.market) params.set("market", filters.market);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  return params.toString();
}

export function useCatalog(filters: CatalogFilters) {
  return useInfiniteQuery({
    queryKey: ["catalog", filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => apiGet<BrowseResponse>(`/api/instruments/browse?${toQuery(filters, pageParam)}`),
    getNextPageParam: (last) =>
      last.page * last.limit < last.total ? last.page + 1 : undefined,
    // Prices arrive over the socket; this is the catalogue, which changes
    // twice a day.
    staleTime: 60_000,
  });
}

export function useCatalogCounts() {
  return useQuery({
    queryKey: ["catalog", "counts"],
    queryFn: () => apiGet<CountsResponse>("/api/instruments/counts"),
    staleTime: 60_000,
  });
}
