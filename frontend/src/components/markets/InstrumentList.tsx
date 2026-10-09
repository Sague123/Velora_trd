import { useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { useCatalog, useCatalogCounts } from "../../hooks/useCatalog";
import { usePriceStore } from "../../store/prices";
import { useFavoritesStore } from "../../store/favorites";
import { classNames, fmtPct, fmtPrice } from "../../lib/format";
import { fieldCls } from "../../lib/ui";
import { IconStar } from "../icons/Icon";
import { EmptyRow, SkeletonTableRows } from "../common/States";
import { Tooltip } from "../common/Tooltip";
import {
  CATALOG_CATEGORIES, CATEGORY_LABEL,
  type CatalogCategory, type CatalogInstrument, type MarketKind,
} from "../../lib/marketTypes";

/**
 * The instrument picker, built for a catalogue of thousands rather than a
 * list of eighteen.
 *
 * Three things follow from that size, and none of them are optional:
 *  - rows are virtualised, so the DOM holds a screenful rather than the whole
 *    catalogue;
 *  - the catalogue is paged from the server and the search is a server query,
 *    not a filter over everything already downloaded;
 *  - the price socket is told which categories this list is showing, so the
 *    frames it receives are about what is on screen.
 *
 * Favourites sort to the top rather than living in a separate tab: a desk
 * wants its own handful first and the rest still reachable underneath.
 */

const ROW_HEIGHT = 44;
const LIST_HEIGHT = 520;

function StaleBadge() {
  return (
    <Tooltip label="Котировка устарела — торговля приостановлена до восстановления фида">
      <span className="shrink-0 rounded border border-warn/40 bg-warn/10 px-1 py-px text-3xs font-medium uppercase tracking-wide text-warn">
        stale
      </span>
    </Tooltip>
  );
}

interface RowData {
  rows: CatalogInstrument[];
  onPick: (symbol: string) => void;
  favorites: string[];
  toggleFavorite: (symbol: string) => void;
}

function Row({ index, style, data }: ListChildComponentProps<RowData>) {
  const instrument = data.rows[index];
  const tick = usePriceStore((s) => s.ticks[instrument.symbol]);

  // The socket's price when there is one, the catalogue's last known price
  // otherwise — a row that has not ticked yet shows the last print rather
  // than a blank cell.
  const price = tick?.price ?? instrument.price;
  const change = tick?.change24h ?? instrument.change24h;
  const stale = tick ? ((tick as { stale?: boolean }).stale ?? false) : instrument.stale;
  const favorite = data.favorites.includes(instrument.symbol);

  return (
    <div style={style} className="flex items-center gap-2 border-b border-line-soft px-3 hover:bg-bg-2/60">
      <button
        type="button"
        aria-label={favorite ? "Убрать из избранного" : "В избранное"}
        onClick={() => data.toggleFavorite(instrument.symbol)}
        className={classNames(
          "btn-fx tap-sm shrink-0 rounded p-1",
          favorite ? "text-cat-gold" : "text-txt-3 hover:text-cat-gold"
        )}
      >
        <IconStar size={13} fill={favorite ? "currentColor" : "none"} />
      </button>

      <button
        type="button"
        onClick={() => data.onPick(instrument.symbol)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-txt-0">{instrument.symbol}</span>
            {instrument.market === "perp" && (
              <span className="shrink-0 rounded bg-bg-3 px-1 py-px text-3xs uppercase tracking-wide text-txt-3">perp</span>
            )}
            {stale && <StaleBadge />}
          </span>
          <span className="block truncate text-2xs text-txt-3">{instrument.name}</span>
        </span>

        <span className="tabular shrink-0 text-right text-xs text-txt-1">
          {price ? fmtPrice(price, instrument.priceDecimals) : "—"}
        </span>
        <span
          className={classNames(
            "tabular w-16 shrink-0 text-right text-2xs font-medium",
            change >= 0 ? "text-buy" : "text-sell"
          )}
        >
          {fmtPct(change)}
        </span>
      </button>
    </div>
  );
}

export function InstrumentList({ onPick }: { onPick: (symbol: string) => void }) {
  const [category, setCategory] = useState<CatalogCategory>("crypto");
  const [market, setMarket] = useState<MarketKind | "all">("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  const favorites = useFavoritesStore((s) => s.symbols);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const subscribe = usePriceStore((s) => s.subscribe);

  // A query per keystroke would be one request per character typed.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const counts = useCatalogCounts();
  const catalog = useCatalog({
    category,
    market: market === "all" ? undefined : market,
    q: debounced || undefined,
  });

  // Tell the server what this tab is looking at. Favourites ride along by
  // symbol so a starred instrument keeps ticking while another category is
  // open.
  useEffect(() => {
    subscribe({ categories: [category], symbols: favorites });
  }, [category, favorites, subscribe]);

  const rows = useMemo(() => {
    const all = (catalog.data?.pages ?? []).flatMap((page) => page.instruments);
    const starred = all.filter((i) => favorites.includes(i.symbol));
    const rest = all.filter((i) => !favorites.includes(i.symbol));
    return [...starred, ...rest];
  }, [catalog.data, favorites]);

  const listRef = useRef<FixedSizeList>(null);
  // A new filter starts at the top; keeping the old scroll offset would open
  // the list halfway down a different catalogue.
  useEffect(() => { listRef.current?.scrollTo(0); }, [category, market, debounced]);

  const total = catalog.data?.pages[0]?.total ?? 0;

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {CATALOG_CATEGORIES.map((id) => {
          const n = counts.data?.byCategory?.[id] ?? 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              // An empty category is shown disabled rather than hidden:
              // "where did forex go" is a support question, a greyed tab
              // reading 0 answers it.
              disabled={n === 0}
              className={classNames(
                "btn-fx tap-sm rounded-lg px-2.5 py-1 text-2xs font-medium transition-colors",
                category === id
                  ? "bg-accent-soft text-accent"
                  : n === 0
                    ? "text-txt-3 opacity-50"
                    : "text-txt-2 hover:text-txt-0"
              )}
            >
              {CATEGORY_LABEL[id]}
              <span className="tabular ml-1 text-txt-3">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по символу или названию"
          className={fieldCls("md", "flex-1")}
        />
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-line">
          {(["all", "spot", "perp"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setMarket(id)}
              className={classNames(
                "btn-fx tap-sm px-2.5 py-1 text-2xs font-medium",
                market === id ? "bg-accent-soft text-accent" : "text-txt-2 hover:text-txt-0"
              )}
            >
              {id === "all" ? "Все" : id === "spot" ? "Спот" : "Перп"}
            </button>
          ))}
        </div>
      </div>

      {catalog.isLoading ? (
        <SkeletonTableRows rows={8} columns={3} />
      ) : rows.length === 0 ? (
        <EmptyRow label="Ничего не найдено" />
      ) : (
        <>
          <FixedSizeList
            ref={listRef}
            height={LIST_HEIGHT}
            width="100%"
            itemCount={rows.length}
            itemSize={ROW_HEIGHT}
            itemData={{ rows, onPick, favorites, toggleFavorite }}
            // Fetch the next page while the user is still scrolling through
            // this one, rather than at the very bottom where they would see
            // the list stop.
            onItemsRendered={({ visibleStopIndex }) => {
              if (
                visibleStopIndex >= rows.length - 20 &&
                catalog.hasNextPage &&
                !catalog.isFetchingNextPage
              ) {
                catalog.fetchNextPage();
              }
            }}
          >
            {Row}
          </FixedSizeList>
          <div className="mt-1.5 flex items-center justify-between text-2xs text-txt-3">
            <span>Показано {rows.length} из {total}</span>
            {catalog.isFetchingNextPage && <span>Загрузка…</span>}
          </div>
        </>
      )}
    </div>
  );
}
