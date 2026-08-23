import { FormEvent, useState } from "react";
import { useDeposit } from "../../hooks/useProfile";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { fmtUsd } from "../../lib/format";
import { IconWalletPlus } from "../icons/Icon";

const PRESETS = ["100", "500", "1000", "5000"];

export function QuickDepositModal({ onClose }: { onClose: () => void }) {
  const deposit = useDeposit();
  const [amount, setAmount] = useState("500");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amount.trim() || Number(amount) <= 0) return toast.warning("Укажите сумму");
    try {
      const res = await deposit.mutateAsync({ amount: amount.trim() });
      toast.success("Депозит зачислен", `Баланс: ${fmtUsd(res.balance)}`);
      onClose();
    } catch (e) {
      toast.error("Не удалось выполнить депозит", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="anim-rise w-full max-w-sm rounded-xl border border-line bg-bg-1 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-txt-0"><IconWalletPlus size={16} /> Quick Deposit</div>
        <form onSubmit={onSubmit}>
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(p)}
                className={`btn-fx rounded border px-2 py-1.5 text-xs font-medium ${amount === p ? "border-buy bg-buy-soft text-buy" : "border-line text-txt-2"}`}
              >
                ${p}
              </button>
            ))}
          </div>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            autoFocus
            className="mb-4 w-full rounded border border-line bg-bg-2 px-3 py-2 text-sm tabular outline-none focus:border-buy"
          />
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-fx flex-1 rounded border border-line py-2 text-xs text-txt-2 hover:text-txt-0">
              Cancel
            </button>
            <button type="submit" disabled={deposit.isPending} className="cta-pill cta-deposit flex-1 py-2 text-xs disabled:opacity-50">
              {deposit.isPending ? "…" : "Deposit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
