import { useState } from "react";
import { useSpotWallet } from "../../hooks/useSpot";
import { classNames, fmtAmount, fmtPrice, fmtUsd, n } from "../../lib/format";
import { ErrorRow, SkeletonLines } from "../common/States";
import { IconChevron, IconWarning } from "../icons/Icon";

const HIDE_THRESHOLD_USD = 1;

/**
 * The Spot section of the Account screen: a summary, every holding as a
 * sideways-scrolling ribbon, and — behind "Показать все" — the full table.
 *
 * Deliberately holds no actions of its own (Buy/Sell/Convert live in the
 * shared actions row below it) and no futures figures — this card answers
 * exactly one question, "what do I own", the same way Positions and Spot
 * Holdings stay two separate tabs on Portfolio rather than one merged table.
 */
export function SpotWalletCard({ onTrade }: { onTrade?: (asset: string) => void }) {
  const wallet = useSpotWallet();
  const [hideSmall, setHideSmall] = useState(true);
  const [expanded, setExpanded] = useState(false);

  if (wallet.isLoading) return <SkeletonLines lines={4} />;
  if (wallet.isError) return <ErrorRow label="Не удалось загрузить спот-кошелёк" onRetry={() => wallet.refetch()} />;
  if (!wallet.data) return null;

  const { holdings, totalValueUsd, pricedFully, quoteAsset } = wallet.data;
  // What's actually "held": USD always counts as the wallet's cash line, even
  // at zero; anything else only counts once there is a real, non-zero amount.
  const held = holdings.filter((h) => h.asset === quoteAsset || n(h.qty) > 0);
  // A handful of rows at most — sorting them fresh each render is cheaper
  // than the bookkeeping a memo would need, and skipping it keeps every hook
  // above the component's early returns instead of after them.
  const ribbon = [...held].sort((a, b) => n(b.value) - n(a.value));

  // A holding with no usable quote is never hidden by the threshold — there is
  // no value to compare against $1, and hiding it would silently drop an asset
  // the trader still owns off the screen.
  const visible = held.filter((h) => h.asset === quoteAsset || !hideSmall || h.value === null || n(h.value) >= HIDE_THRESHOLD_USD);

  return (
    <section className="rounded-lg border border-line bg-bg-1">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3.5 py-3">
        <div>
          <div className="text-sm font-semibold text-txt-0">Спот</div>
          <div className="text-2xs text-txt-3">Доступные активы</div>
        </div>
        <div className="text-right">
          <div className="tabular text-sm font-bold text-txt-0">{fmtUsd(totalValueUsd)}</div>
          <div className="text-2xs text-txt-3">{held.length} {held.length === 1 ? "актив" : "активов"}</div>
        </div>
      </div>

      {/* A ribbon rather than a fixed grid: holdings are a list of unknown
          length, and a 3-cell grid either hid the rest or squeezed the
          quantities into ellipses. Every held asset gets a card of its own
          width here and the strip scrolls sideways *within itself* — the one
          place on this screen where sideways movement is intended. */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-line-soft px-3 py-3">
        {ribbon.map((a) => (
          <button
            key={a.asset}
            type="button"
            onClick={a.asset === quoteAsset || !a.symbol ? undefined : () => onTrade?.(a.asset)}
            className={classNames(
              "w-[132px] shrink-0 rounded-xl border border-line-soft bg-bg-2 px-2.5 py-2 text-left",
              a.asset !== quoteAsset && a.symbol && "btn-fx hover:border-accent/50"
            )}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg-3 text-3xs font-bold text-txt-1">
                {a.asset.slice(0, 1)}
              </span>
              <span className="truncate text-2xs font-bold text-txt-0">{a.asset}</span>
            </div>
            <div className="truncate text-xs font-semibold tabular text-txt-0">
              {fmtAmount(a.qty, a.asset === quoteAsset)}
            </div>
            <div className="mt-0.5 truncate text-2xs tabular text-txt-3">
              {a.value === null ? "—" : fmtUsd(a.value)}
            </div>
          </button>
        ))}
      </div>

      {!pricedFully && (
        <div className="flex items-start gap-2 border-b border-line-soft bg-warn/10 px-3 py-1.5 text-2xs text-warn">
          <IconWarning size={12} className="mt-0.5 shrink-0" />
          <span>По части активов нет актуальной котировки — их стоимость не включена в сумму.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
        <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-txt-3">
          <input
            type="checkbox"
            checked={hideSmall}
            onChange={(e) => setHideSmall(e.target.checked)}
            className="accent-accent"
          />
          Скрывать активы дешевле ${HIDE_THRESHOLD_USD}
        </label>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="btn-fx flex items-center gap-1 text-2xs font-semibold text-accent hover:underline"
        >
          {expanded ? "Свернуть" : `Показать все (${visible.length})`}
          <IconChevron size={11} direction={expanded ? "up" : "down"} />
        </button>
      </div>

      {expanded && (
        <SpotHoldingsList holdings={visible} quoteAsset={quoteAsset} onTrade={onTrade} />
      )}
    </section>
  );
}

/**
 * The holdings themselves. No Leverage, Liquidation or Margin columns — a spot
 * holding has none of those, and showing empty columns for them would imply
 * the numbers exist and just weren't loaded.
 */
export function SpotHoldingsList({
  holdings, quoteAsset, onTrade, compact = false,
}: {
  holdings: { asset: string; name: string; qty: string | null; price: string | null; value: string | null; priceDecimals: number; priced: boolean; symbol: string | null }[];
  quoteAsset: string;
  onTrade?: (asset: string) => void;
  compact?: boolean;
}) {
  const rows = holdings.filter((h) => h.asset === quoteAsset || n(h.qty) > 0);

  if (rows.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-2xs text-txt-3">
        В спот-кошельке пока пусто — пополните счёт или купите актив.
      </div>
    );
  }

  // No horizontal scroll container here on purpose. Five columns did not fit a
  // 375px phone and the table quietly grew to 435px, which is what made the
  // whole screen feel draggable sideways. The price column and the per-row
  // action are the two least essential, so they appear only once there is
  // width for them; below that the quantity carries the price implicitly via
  // the value beside it.
  return (
    <table className="w-full table-fixed text-2xs">
      <thead>
        <tr className="border-b border-t border-line-soft text-left text-txt-3">
          <th className="px-2.5 py-1.5 font-medium">Актив</th>
          <th className="px-2.5 py-1.5 text-right font-medium">Количество</th>
          {!compact && <th className="hidden px-2.5 py-1.5 text-right font-medium sm:table-cell">Цена</th>}
          <th className="px-2.5 py-1.5 text-right font-medium">Стоимость</th>
          {onTrade && <th className="hidden px-2.5 py-1.5 sm:table-cell" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.asset} className="border-b border-line-soft/60 last:border-b-0 hover:bg-bg-2/50">
            <td className="px-2.5 py-2">
              <div className="font-semibold text-txt-0">{h.asset}</div>
              <div className="truncate text-3xs text-txt-3">{h.name}</div>
            </td>
            <td className="truncate px-2.5 py-2 text-right tabular text-txt-1">
              {fmtAmount(h.qty, h.asset === quoteAsset)}
            </td>
            {!compact && (
              <td className="hidden px-2.5 py-2 text-right tabular text-txt-2 sm:table-cell">
                {h.asset === quoteAsset ? "—" : h.priced ? fmtPrice(h.price, h.priceDecimals) : "нет котировки"}
              </td>
            )}
            <td className="px-2.5 py-2 text-right tabular font-medium text-txt-0">
              {h.value === null ? "—" : fmtUsd(h.value)}
            </td>
            {onTrade && (
              <td className="hidden px-2.5 py-2 text-right sm:table-cell">
                {h.asset !== quoteAsset && h.symbol && (
                  <button
                    onClick={() => onTrade(h.asset)}
                    className="btn-fx tap-sm rounded-lg border border-line px-2 py-0.5 text-txt-2 hover:border-accent hover:text-accent"
                  >
                    Обменять
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
