import { FormEvent, useState } from "react";
import { useSpotTransfer, useSpotWallet } from "../../hooks/useSpot";
import { useAccount } from "../../hooks/useTrading";
import { useModalExit } from "../../hooks/useModalExit";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { classNames, fmtUsd, n } from "../../lib/format";
import { IconArrowRight, IconSwap } from "../icons/Icon";

type Direction = "TO_FUTURES" | "TO_SPOT";

/**
 * The one door between the two wallets.
 *
 * It is a deliberate, explicit step rather than something the platform does
 * silently when a trade needs margin: spot money is the trader's assets, and
 * futures money is collateral that an open position can be liquidated
 * against. Moving between those two states should be a decision someone made,
 * not a side effect they discover afterwards.
 */
export function SpotTransferModal({ onClose, initial = "TO_FUTURES" }: { onClose: () => void; initial?: Direction }) {
  const { closing, requestClose } = useModalExit(onClose);
  const { data: wallet } = useSpotWallet();
  const { data: account } = useAccount(true);
  const transfer = useSpotTransfer();
  const [direction, setDirection] = useState<Direction>(initial);
  const [amount, setAmount] = useState("");

  const spotUsd = wallet?.availableUsd ?? "0";
  // Futures cash, not equity: equity counts margin that is already committed
  // to open positions, and that money cannot be moved out from under them.
  const futuresCash = account?.cash ?? "0";
  const source = direction === "TO_FUTURES" ? spotUsd : futuresCash;
  const overBalance = Number(amount) > n(source);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = amount.trim();
    if (!value || Number(value) <= 0) return toast.warning("Укажите сумму");
    if (overBalance) return toast.warning("Недостаточно средств", `Доступно: ${fmtUsd(source)}`);
    try {
      await transfer.mutateAsync({ direction, amount: value });
      toast.success(
        direction === "TO_FUTURES" ? "Переведено во фьючерсный кошелёк" : "Переведено в спот-кошелёк",
        fmtUsd(value)
      );
      requestClose();
    } catch (err) {
      toast.error("Перевод отклонён", err instanceof ApiError ? err.message : undefined);
    }
  }

  const from = direction === "TO_FUTURES" ? "Спот" : "Фьючерсы";
  const to = direction === "TO_FUTURES" ? "Фьючерсы" : "Спот";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={requestClose}>
      <div
        className={`${closing ? "anim-rise-out" : "anim-rise"} w-full max-w-sm rounded-xl border border-accent/40 bg-bg-1 p-5 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-txt-0">
          <IconSwap size={18} /> Перевод между кошельками
        </div>
        <div className="mb-4 text-2xs text-txt-3">
          Во фьючерсном кошельке деньги работают как залог под позиции с плечом; в споте — как свободные средства,
          которые можно вывести или потратить на покупку актива.
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-bg-2/40 p-2.5">
            <div className="min-w-0 flex-1 text-center">
              <div className="text-2xs text-txt-3">Откуда</div>
              <div className="truncate text-xs font-semibold text-txt-0">{from}</div>
              <div className="tabular text-2xs text-txt-2">{fmtUsd(source)}</div>
            </div>
            <button
              type="button"
              onClick={() => { setDirection((d) => (d === "TO_FUTURES" ? "TO_SPOT" : "TO_FUTURES")); setAmount(""); }}
              aria-label="Сменить направление перевода"
              className="btn-fx tap-sm shrink-0 rounded-full border border-line bg-bg-1 p-1.5 text-accent"
            >
              <IconArrowRight size={14} />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="text-2xs text-txt-3">Куда</div>
              <div className="truncate text-xs font-semibold text-txt-0">{to}</div>
              <div className="tabular text-2xs text-txt-2">
                {fmtUsd(direction === "TO_FUTURES" ? futuresCash : spotUsd)}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-2xs text-txt-2">Сумма, USD</span>
              <button type="button" onClick={() => setAmount(source)} className="btn-fx text-2xs text-accent hover:underline">
                Max
              </button>
            </div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
              className={classNames(
                "w-full rounded-lg border border-line bg-bg-2 px-2.5 py-2 text-sm font-semibold tabular text-txt-0 outline-none focus:border-accent",
                overBalance && "border-sell"
              )}
            />
            {overBalance && (
              <div className="mt-1 text-2xs text-sell">
                {direction === "TO_SPOT"
                  ? "Больше, чем свободно во фьючерсном кошельке — часть средств удерживается под открытые позиции"
                  : "Больше, чем есть в спот-кошельке"}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={transfer.isPending || overBalance}
              className="btn-fx tap flex-1 rounded-lg bg-accent-fill py-2.5 text-xs font-bold text-white hover:brightness-110 disabled:opacity-40"
            >
              {transfer.isPending ? "Переводим…" : "Перевести"}
            </button>
            <button type="button" onClick={requestClose} className="btn-fx tap rounded-lg border border-line px-4 text-xs text-txt-2 hover:text-txt-0">
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
