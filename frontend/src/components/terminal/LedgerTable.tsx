import type { LedgerEntry } from "../../lib/types";
import { classNames, fmtDateTime, fmtUsd } from "../../lib/format";
import { EmptyRow } from "../common/States";

const TYPE_LABEL: Record<LedgerEntry["type"], string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRANSFER_OUT: "Transfer sent",
  TRANSFER_IN: "Transfer received",
  MARGIN_HOLD: "Margin hold",
  MARGIN_RELEASE: "Margin release",
  FEE: "Fee",
  PNL: "PnL settlement",
  ADMIN_ADJUSTMENT: "Admin adjustment",
  SAVINGS_DEPOSIT: "To savings",
  SAVINGS_WITHDRAWAL: "From savings",
  SAVINGS_INTEREST: "Savings interest",
};

export function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) return <EmptyRow label="Леджер пуст" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-2xs">
        <thead>
          <tr className="border-b border-line-soft text-left text-txt-3">
            <th className="px-2 py-1.5 font-medium">Type</th>
            <th className="px-2 py-1.5 text-right font-medium">Amount</th>
            <th className="px-2 py-1.5 text-right font-medium">Balance After</th>
            <th className="px-2 py-1.5 font-medium">Note</th>
            <th className="px-2 py-1.5 font-medium">Time</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const amt = Number(e.amount);
            return (
              <tr key={e.id} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
                <td className="px-2 py-1.5 text-txt-1">{TYPE_LABEL[e.type] ?? e.type}</td>
                <td className={classNames("px-2 py-1.5 text-right font-medium", amt >= 0 ? "text-buy" : "text-sell")}>
                  {amt >= 0 ? "+" : ""}
                  {fmtUsd(e.amount)}
                </td>
                <td className="px-2 py-1.5 text-right text-txt-1">{fmtUsd(e.balanceAfter)}</td>
                <td className="max-w-[260px] truncate px-2 py-1.5 text-txt-2">{e.note ?? "—"}</td>
                <td className="px-2 py-1.5 text-txt-3">{fmtDateTime(e.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
