import { useMemo, useState } from "react";
import { useAccount } from "../../hooks/useTrading";
import { useAuthStore } from "../../store/auth";
import { useLedger } from "../../hooks/useTrading";
import { useSpotLedger } from "../../hooks/useSpot";
import { fmtDateTime, fmtUsd, fmtSigned, classNames } from "../../lib/format";
import { WalletFlowModal, WalletMethod } from "./WalletFlowModal";
import { demoWalletAddress } from "../../lib/demoWallet";
import { toast } from "../../store/toast";
import { Tooltip } from "../common/Tooltip";
import { IconCopy, IconCrypto, IconWalletMinus, IconWalletPlus } from "../icons/Icon";

const TILES: { method: WalletMethod; Icon: typeof IconWalletPlus; label: string; sub: string; fill: string; text: string }[] = [
  // Flat semantic fills, not gradients — same -fill tokens the terminal's own
  // Buy/Sell buttons use, so "deposit" and "withdraw" read as the same kind
  // of action everywhere in the app, not a decorative one-off here.
  { method: "deposit", Icon: IconWalletPlus, label: "Deposit", sub: "Пополнить баланс", fill: "bg-buy-fill", text: "text-black" },
  { method: "withdraw", Icon: IconWalletMinus, label: "Withdraw", sub: "Вывести средства", fill: "bg-sell-fill", text: "text-white" },
];

export function WalletActions() {
  const user = useAuthStore((s) => s.user);
  const { data: account } = useAccount(!!user);
  const [open, setOpen] = useState<WalletMethod | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {open && <WalletFlowModal method={open} onClose={() => setOpen(null)} />}

      {/* Two figures, because they are two different things and calling either
          one "balance" is what made the old screen misleading: Total Balance
          is everything the account holds (spot assets at market + futures
          equity), while what a withdrawal can actually take is only the free
          USD sitting in the spot wallet. Futures collateral is not withdrawable
          money — it is backing open positions. */}
      <div className="anim-rise relative overflow-hidden rounded-xl border border-line bg-bg-1 p-5">
        <div className="hero-glow" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-2xs font-medium uppercase tracking-wide text-txt-2">Total Balance</div>
            <div className="tabular mt-1 text-3xl font-bold text-txt-0">{account ? fmtUsd(account.totalBalance) : "—"}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-txt-3">
              <span>Спот: <span className="tabular text-txt-2">{account ? fmtUsd(account.spotValue) : "—"}</span></span>
              <span>Фьючерсы: <span className="tabular text-txt-2">{account ? fmtUsd(account.equity) : "—"}</span></span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Tooltip label="Свободные средства спот-кошелька. Залог во фьючерсном кошельке сюда не входит: он держит открытые позиции, и вывести его можно только после перевода в спот.">
              <div className="cursor-help rounded-lg border border-line-soft bg-bg-2/60 px-3 py-1.5 text-right">
                <div className="text-2xs text-txt-3 underline decoration-dotted">Available to Withdraw</div>
                <div className="tabular text-sm font-semibold text-txt-0">{account ? fmtUsd(account.availableToWithdraw) : "—"}</div>
              </div>
            </Tooltip>
            {user?.accountNumber && (
              <div className="rounded-lg border border-line-soft bg-bg-2/60 px-3 py-1.5 text-right">
                <div className="text-2xs text-txt-3">Номер счёта</div>
                <div className="tabular text-sm font-semibold text-txt-0">{user.accountNumber}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {user && (
        <div className="rounded-lg border border-line-soft bg-bg-1 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">
            <IconCrypto size={13} /> Криптокошелёк
          </div>
          <div className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded border border-line bg-bg-2 px-2 py-1.5 text-2xs text-txt-1">{demoWalletAddress(user.id)}</code>
            <button
              onClick={() => { navigator.clipboard?.writeText(demoWalletAddress(user.id)); toast.info("Адрес скопирован"); }}
              className="btn-fx shrink-0 rounded border border-line p-1.5 text-txt-2 hover:text-accent"
            >
              <IconCopy size={13} />
            </button>
          </div>
          <div className="mt-1 text-2xs text-txt-3">Адрес для иллюстрации — не привязан к реальной блокчейн-сети.</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {TILES.map((t, idx) => (
          <button
            key={t.method}
            onClick={() => setOpen(t.method)}
            className={classNames(
              "btn-fx group flex flex-col items-center gap-1 rounded-xl border border-line px-2 py-2.5 text-center shadow-panel transition-transform hover:-translate-y-0.5",
              t.fill,
              t.text,
              idx === 0 ? "anim-rise-1" : idx === 1 ? "anim-rise-2" : "anim-rise-3"
            )}
          >
            <t.Icon size={18} />
            <div className="text-2xs font-bold sm:text-xs">{t.label}</div>
            {/* Full opacity, not a faded /80 — a diluted tint here reads fine
                by eye but measures under the 4.5:1 AA floor on more than one
                fill/theme combination; hierarchy comes from weight/size
                instead, same rule the txt ramp itself follows. */}
            <div className="hidden text-2xs sm:block">{t.sub}</div>
          </button>
        ))}
      </div>

    </div>
  );
}

/**
 * The last few account movements — enough to confirm a deposit landed, not a
 * second copy of the ledger. It's a separate export from WalletActions so the
 * Account tab can put it where it belongs: below the balance figures, at the
 * bottom of the page, rather than between the deposit buttons and the
 * numbers those buttons change. `onSeeAll` opens the History tab, which holds
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
