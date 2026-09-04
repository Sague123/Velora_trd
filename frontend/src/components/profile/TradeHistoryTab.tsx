import { useMemo } from "react";
import { useTrades } from "../../hooks/useTrading";
import { classNames, fmtDateTime, fmtPrice, fmtQty, fmtSigned, fmtUsd, n } from "../../lib/format";
import { ErrorRow, EmptyRow, SkeletonBar, SkeletonTableRows } from "../common/States";
import { CoinBadge } from "../common/CoinBadge";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "buy" | "sell" | "warn" }) {
  return (
    <div className="rounded-lg border border-line bg-bg-1 p-3">
      <div className="text-2xs text-txt-3">{label}</div>
      <div
        className={classNames(
          "tabular text-base font-semibold",
          tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : tone === "warn" ? "text-warn" : "text-txt-0"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-lg border border-line bg-bg-1 p-3">
      <SkeletonBar width="60%" height={10} />
      <div className="mt-2"><SkeletonBar width="45%" height={18} /></div>
    </div>
  );
}

/**
 * Every closed trade, with the running totals that matter across the whole
 * history rather than per row — most importantly the cumulative fee bill,
 * which is invisible when you only ever see one trade's fee at a time.
 *
 * Net result is deliberately shown alongside gross PnL: the engine books the
 * exit fee as its own ledger entry separate from PnL, so gross profit alone
 * overstates what actually reached the balance.
 */
export function TradeHistoryTab() {
  const { data, isLoading, isError, refetch } = useTrades(true);
  const trades = data?.trades ?? [];

  const totals = useMemo(() => {
    let pnl = 0;
    let fees = 0;
    let wins = 0;
    for (const t of trades) {
      const p = n(t.pnl);
      pnl += p;
      fees += n(t.fee);
      if (p > 0) wins++;
    }
    return {
      pnl,
      fees,
      wins,
      net: pnl - fees,
      winRate: trades.length ? Math.round((wins / trades.length) * 100) : null,
    };
  }, [trades]);

  if (isError) return <ErrorRow label="Не удалось загрузить историю" onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <Stat label="Всего сделок" value={String(trades.length)} />
            <Stat label="Валовый P&L" value={fmtSigned(totals.pnl)} tone={totals.pnl >= 0 ? "buy" : "sell"} />
            {/* "Closing", not "all": a trade row carries only the fee booked
                when the position closed. The entry fee is charged separately
                at order placement and lands in the ledger, which is what
                Account's own "Fees Paid" adds up — so the two totals differ
                by design, and each now says which one it is. */}
            <Stat label="Комиссии закрытия" value={fmtUsd(totals.fees, 4)} tone="warn" />
            <Stat label="Чистый результат" value={fmtSigned(totals.net)} tone={totals.net >= 0 ? "buy" : "sell"} />
            <Stat label="Winrate" value={totals.winRate === null ? "—" : `${totals.winRate}%`} />
          </>
        )}
      </div>

      <div className="rounded-lg border border-line bg-bg-1">
        {!isLoading && trades.length === 0 ? (
          <EmptyRow label="Закрытых сделок пока нет" />
        ) : (
          <>
            {/* Below `sm`: stacked cards — the table's min-w-[620px] used to
                force this whole tab (reachable from the avatar on every
                screen) into a horizontal-scroll page on a phone, the same
                failure mode already fixed in the terminal's own tables. */}
            <div className="sm:hidden">
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="border-b border-line-soft/60 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <SkeletonBar width="35%" height={12} />
                      <SkeletonBar width="20%" height={12} />
                    </div>
                    <div className="mt-1.5"><SkeletonBar width="55%" height={9} /></div>
                  </div>
                ))}
              {!isLoading &&
                trades.map((t) => {
                  const pnl = n(t.pnl);
                  return (
                    <div key={t.id} className="border-b border-line-soft/60 px-3 py-2.5 tabular">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <CoinBadge symbol={t.symbol} size={20} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-txt-0">{t.symbol}</div>
                            <span className={classNames("text-2xs", t.side === "BUY" ? "text-buy" : "text-sell")}>{t.side}</span>
                          </div>
                        </div>
                        <span className={classNames("shrink-0 text-xs font-semibold", pnl >= 0 ? "text-buy" : "text-sell")}>{fmtSigned(t.pnl)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-txt-2">
                        <span>Qty <span className="text-txt-1">{fmtQty(t.qty)}</span></span>
                        <span>Open <span className="text-txt-1">{fmtPrice(t.entryPrice, 4)}</span></span>
                        <span>Close <span className="text-txt-1">{fmtPrice(t.exitPrice, 4)}</span></span>
                        <span>Fee <span className="text-txt-1">{fmtUsd(t.fee, 4)}</span></span>
                        <span className="text-txt-3">{fmtDateTime(t.closedAt)}</span>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* `sm` and up: unchanged desktop table. */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[620px] text-2xs">
                <thead>
                  <tr className="border-b border-line text-left text-txt-3">
                    <th className="px-3 py-2 font-medium">Символ</th>
                    <th className="px-2 py-2 text-right font-medium">Количество</th>
                    <th className="px-2 py-2 text-right font-medium">Цена открытия</th>
                    <th className="px-2 py-2 text-right font-medium">Цена закрытия</th>
                    <th className="px-2 py-2 text-right font-medium">Комиссия</th>
                    <th className="px-2 py-2 text-right font-medium">Прибыль</th>
                    <th className="px-3 py-2 font-medium">Время закрытия</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <SkeletonTableRows columns={7} />}
                  {!isLoading &&
                    trades.map((t) => {
                      const pnl = n(t.pnl);
                      return (
                        <tr key={t.id} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <CoinBadge symbol={t.symbol} size={20} />
                              <div>
                                <div className="font-medium text-txt-0">{t.symbol}</div>
                                <span className={classNames("text-2xs", t.side === "BUY" ? "text-buy" : "text-sell")}>{t.side}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right text-txt-1">{fmtQty(t.qty)}</td>
                          <td className="px-2 py-2 text-right text-txt-1">{fmtPrice(t.entryPrice, 4)}</td>
                          <td className="px-2 py-2 text-right text-txt-1">{fmtPrice(t.exitPrice, 4)}</td>
                          <td className="px-2 py-2 text-right text-txt-2">{fmtUsd(t.fee, 4)}</td>
                          <td className={classNames("px-2 py-2 text-right font-semibold", pnl >= 0 ? "text-buy" : "text-sell")}>
                            {fmtSigned(t.pnl)}
                          </td>
                          <td className="px-3 py-2 text-txt-2">{fmtDateTime(t.closedAt)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {!isLoading && trades.length >= 200 && (
        <p className="text-2xs text-txt-3">
          Показаны последние 200 закрытых сделок — столько отдаёт API за один запрос.
        </p>
      )}
    </div>
  );
}
