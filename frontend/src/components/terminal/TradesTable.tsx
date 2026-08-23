import type { Trade } from "../../lib/types";
import { classNames, fmtDateTime, fmtPrice, fmtQty, fmtSigned, fmtUsd } from "../../lib/format";
import { EmptyRow } from "../common/States";

const REASON_LABEL: Record<Trade["closeReason"], string> = {
  MANUAL: "Manual",
  TAKE_PROFIT: "Take Profit",
  STOP_LOSS: "Stop Loss",
  LIQUIDATION: "Liquidation",
  ADMIN: "Admin",
};

export function TradesTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return <EmptyRow label="История сделок пуста" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-2xs">
        <thead>
          <tr className="border-b border-line-soft text-left text-txt-3">
            <th className="px-2 py-1.5 font-medium">Symbol</th>
            <th className="px-2 py-1.5 font-medium">Side</th>
            <th className="px-2 py-1.5 text-right font-medium">Qty</th>
            <th className="px-2 py-1.5 text-right font-medium">Entry</th>
            <th className="px-2 py-1.5 text-right font-medium">Exit</th>
            <th className="px-2 py-1.5 text-right font-medium">Fee</th>
            <th className="px-2 py-1.5 text-right font-medium">PnL</th>
            <th className="px-2 py-1.5 font-medium">Reason</th>
            <th className="px-2 py-1.5 font-medium">Closed</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const pnl = Number(t.pnl);
            return (
              <tr key={t.id} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
                <td className="px-2 py-1.5 font-medium text-txt-0">{t.symbol}</td>
                <td className="px-2 py-1.5">
                  <span className={classNames("rounded px-1 py-0.5 font-medium", t.side === "BUY" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
                    {t.side}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right">{fmtQty(t.qty)}</td>
                <td className="px-2 py-1.5 text-right">{fmtPrice(t.entryPrice, 4)}</td>
                <td className="px-2 py-1.5 text-right">{fmtPrice(t.exitPrice, 4)}</td>
                <td className="px-2 py-1.5 text-right text-txt-2">{fmtUsd(t.fee, 4)}</td>
                <td className={classNames("px-2 py-1.5 text-right font-medium", pnl >= 0 ? "text-buy" : "text-sell")}>{fmtSigned(t.pnl)}</td>
                <td className="px-2 py-1.5 text-txt-2">{REASON_LABEL[t.closeReason]}</td>
                <td className="px-2 py-1.5 text-txt-2">{fmtDateTime(t.closedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
