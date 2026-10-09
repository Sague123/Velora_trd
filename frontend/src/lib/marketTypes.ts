/** The catalogue's own vocabulary, shared by the browse endpoint, the
 * watchlist and the websocket subscription. Distinct from `Category` in
 * types.ts, which is the old four-value scale the legacy /api/instruments
 * endpoint still speaks. */

export const CATALOG_CATEGORIES = [
  "crypto", "forex", "metals", "commodities", "indices", "stocks",
] as const;

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];
export type MarketKind = "spot" | "perp";

export const CATEGORY_LABEL: Record<CatalogCategory, string> = {
  crypto: "Криптовалюты",
  forex: "Валюты",
  metals: "Металлы",
  commodities: "Сырьё",
  indices: "Индексы",
  stocks: "Акции",
};

export interface CatalogInstrument {
  symbol: string;
  name: string;
  category: CatalogCategory;
  market: MarketKind;
  provider: string;
  providerSymbol: string | null;
  base: string | null;
  quote: string | null;
  tickSize: string | null;
  stepSize: string | null;
  minQty: string | null;
  maxLeverage: number;
  priceDecimals: number;
  status: "TRADING" | "BREAK" | "HALT" | "DELISTED";
  tradingHours: string | null;
  price: string | null;
  bid: string | null;
  ask: string | null;
  change24h: number;
  volume24h: string | null;
  updatedAt: string | null;
  /** The quote is older than the server's freshness window. The last price is
   * still shown; the instrument simply cannot be traded until a new one
   * arrives. */
  stale: boolean;
  tradeable: boolean;
}

export interface BrowseResponse {
  total: number;
  page: number;
  limit: number;
  instruments: CatalogInstrument[];
}

export interface CountsResponse {
  total: number;
  byCategory: Record<CatalogCategory, number>;
  catalog: { category: string; market: string; n: number }[];
}
