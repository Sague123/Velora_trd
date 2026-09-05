import { useMemo } from "react";
import { useLedger } from "../../hooks/useTrading";
import { useSpotLedger } from "../../hooks/useSpot";
import { fmtDateTime, fmtUsd, fmtSigned, classNames } from "../../lib/format";

/**
 * The last few account movements — enough to confirm a deposit landed, not a
 * second copy of the ledger. `onSeeAll` opens the History tab, which holds
 * the full ledger.
 */
export function RecentWalletActivity({ onSeeAll }: { onSeeAll?: () => void } = {}) {
  const ledger = useLedger(true);
  const spot = useSpotLedger(true);

  // Both journals, newest first. Deposits, withdrawals and asset purchases
  // live in the spot journal while margin, fees and PnL live in the cash one —
  // showing only the cash side here would mean a trader tops up their account
  // and sees nothing happen on the very screen they did it from.
  const entries = useMemo(() => {
    const cash = (ledger.data?.entries ?? []).map((e) => ({
      id: e.id, at: e.createdAt, type: e.type, amount: e.amount,
      asset: "USD", balanceAfter: e.balanceAfter, wallet: "Фьючерсы",
    }));
    const assets = (spot.data?.entries ?? []).map((e) => ({
      id: e.id, at: e.createdAt, type: e.type, amount: e.qty,
      asset: e.asset, balanceAfter: e.balanceAfter, wallet: "Спот",
    }));
    return [...cash, ...assets].sort((a, b) => b.at.localeCompare(a.at));
  }, [ledger.data, spot.data]);

  return (
    <div className="rounded border border-line bg-bg-1">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-txt-2">Recent Wallet Activity</span>
        {onSeeAll && entries.length > 0 && (
          <button onClick={onSeeAll} className="btn-fx tap-sm rounded px-1.5 text-2xs font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            Смотреть всё
          </button>
        )}
      </div>
      {entries.length ? (
        <table className="w-full text-2xs">
          <tbody>
            {entries.slice(0, 6).map((e) => (
              <tr key={e.id} className="border-b border-line-soft/60 tabular last:border-b-0 hover:bg-bg-2/60">
                <td className="px-3 py-1.5 text-txt-2">{fmtDateTime(e.at)}</td>
                <td className="px-3 py-1.5 font-medium text-txt-0">
                  {e.type.replace(/_/g, " ")}
                  <span className="ml-1.5 text-2xs font-normal text-txt-3">{e.wallet}</span>
                </td>
                <td className={classNames("px-3 py-1.5 text-right font-medium", Number(e.amount) >= 0 ? "text-buy" : "text-sell")}>
                  {fmtSigned(e.amount, e.asset === "USD" ? 2 : 8)} <span className="text-txt-3">{e.asset}</span>
                </td>
                {/* Balance after, in that row's own asset — a BTC purchase
                    leaves a BTC balance, and formatting it as dollars would
                    read as a hundred-thousand-fold error. */}
                <td className="px-3 py-1.5 text-right text-txt-2">
                  {e.asset === "USD" ? fmtUsd(e.balanceAfter) : `${e.balanceAfter} ${e.asset}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-3 py-6 text-center text-2xs text-txt-3">Пока нет операций</div>
      )}
    </div>
  );
}
