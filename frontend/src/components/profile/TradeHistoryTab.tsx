import { useMemo } from "react";
import { useTrades } from "../../hooks/useTrading";
import { classNames, fmtDateTime, fmtPrice, fmtQty, fmtSigned, fmtUsd, n } from "../../lib/format";
import { LoadingRow, ErrorRow, EmptyRow } from "../common/States";
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

  if (isLoading) return <LoadingRow />;
  if (isError) return <ErrorRow label="Не удалось загрузить историю" onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Всего сделок" value={String(trades.length)} />
        <Stat label="Валовый P&L" value={fmtSigned(totals.pnl)} tone={totals.pnl >= 0 ? "buy" : "sell"} />
        <Stat label="Комиссии всего" value={fmtUsd(totals.fees, 4)} tone="warn" />
        <Stat label="Чистый результат" value={fmtSigned(totals.net)} tone={totals.net >= 0 ? "buy" : "sell"} />
        <Stat label="Winrate" value={totals.winRate === null ? "—" : `${totals.winRate}%`} />
      </div>

      <div className="rounded-lg border border-line bg-bg-1">
        {trades.length === 0 ? (
          <EmptyRow label="Закрытых сделок пока нет" />
        ) : (
          <div className="overflow-x-auto">
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
                {trades.map((t) => {
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
        )}
      </div>

      {trades.length >= 200 && (
        <p className="text-2xs text-txt-3">
          Показаны последние 200 закрытых сделок — столько отдаёт API за один запрос.
        </p>
      )}
    </div>
  );
}
