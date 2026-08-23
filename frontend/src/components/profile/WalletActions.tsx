import { useState } from "react";
import { useAccount } from "../../hooks/useTrading";
import { useAuthStore } from "../../store/auth";
import { useLedger } from "../../hooks/useTrading";
import { fmtDateTime, fmtUsd, fmtSigned, classNames } from "../../lib/format";
import { WalletFlowModal, WalletMethod } from "./WalletFlowModal";
import { demoWalletAddress } from "../../lib/demoWallet";
import { toast } from "../../store/toast";
import { IconCopy, IconCrypto, IconSwap, IconWalletMinus, IconWalletPlus } from "../icons/Icon";

const TILES: { method: WalletMethod; Icon: typeof IconWalletPlus; label: string; sub: string; gradient: string }[] = [
  { method: "deposit", Icon: IconWalletPlus, label: "Deposit", sub: "Пополнить баланс", gradient: "from-buy to-emerald-400" },
  { method: "withdraw", Icon: IconWalletMinus, label: "Withdraw", sub: "Вывести средства", gradient: "from-warn to-sell" },
  { method: "transfer", Icon: IconSwap, label: "Transfer", sub: "Другому юзеру", gradient: "from-accent to-[#7c3aed]" },
];

export function WalletActions() {
  const user = useAuthStore((s) => s.user);
  const { data: account } = useAccount(!!user);
  const ledger = useLedger(true);
  const [open, setOpen] = useState<WalletMethod | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {open && <WalletFlowModal method={open} onClose={() => setOpen(null)} />}

      <div className="anim-rise relative overflow-hidden rounded-xl border border-line bg-bg-1 p-5">
        <div className="hero-glow" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-2xs font-medium uppercase tracking-wide text-txt-2">Available Balance</div>
            <div className="tabular gradient-text mt-1 text-3xl font-bold">{account ? fmtUsd(account.cash) : "—"}</div>
          </div>
          {user?.accountNumber && (
            <div className="rounded-lg border border-line-soft bg-bg-2/60 px-3 py-1.5 text-right">
              <div className="text-2xs text-txt-3">Номер счёта</div>
              <div className="tabular text-sm font-semibold text-txt-0">{user.accountNumber}</div>
            </div>
          )}
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

      <div className="grid grid-cols-3 gap-2">
        {TILES.map((t, idx) => (
          <button
            key={t.method}
            onClick={() => setOpen(t.method)}
            className={classNames(
              "btn-fx group flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center shadow-panel transition-transform hover:-translate-y-0.5",
              "bg-gradient-to-br text-white",
              t.gradient,
              idx === 0 ? "anim-rise-1" : idx === 1 ? "anim-rise-2" : "anim-rise-3"
            )}
          >
            <t.Icon size={18} />
            <div className="text-2xs font-bold sm:text-xs">{t.label}</div>
            <div className="hidden text-2xs text-white/80 sm:block">{t.sub}</div>
          </button>
        ))}
      </div>

      <div className="rounded border border-line bg-bg-1">
        <div className="border-b border-line-soft px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-txt-2">Recent Wallet Activity</div>
        <div className="max-h-72 overflow-y-auto">
          {ledger.data?.entries?.length ? (
            <table className="w-full text-2xs">
              <tbody>
                {ledger.data.entries.slice(0, 12).map((e) => (
                  <tr key={e.id} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
                    <td className="px-3 py-1.5 text-txt-2">{fmtDateTime(e.createdAt)}</td>
                    <td className="px-3 py-1.5 font-medium text-txt-0">{e.type.replace(/_/g, " ")}</td>
                    <td className={classNames("px-3 py-1.5 text-right font-medium", Number(e.amount) >= 0 ? "text-buy" : "text-sell")}>{fmtSigned(e.amount)}</td>
                    <td className="px-3 py-1.5 text-right text-txt-2">{fmtUsd(e.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-3 py-6 text-center text-2xs text-txt-3">Пока нет операций</div>
          )}
        </div>
      </div>
    </div>
  );
}
