import { FormEvent, useState } from "react";
import type { Position } from "../../lib/types";
import { useUpdatePosition, useClosePosition } from "../../hooks/useTrading";
import { useInstruments } from "../../hooks/useMarket";
import { classNames, fmtPrice, fmtQty, fmtSigned, fmtUsd } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { IconClose } from "../icons/Icon";

export function PositionEditModal({ position, onClose }: { position: Position; onClose: () => void }) {
  const { data } = useInstruments();
  const inst = data?.instruments.find((i) => i.symbol === position.symbol);
  const maxLeverage = inst?.maxLeverage ?? position.leverage;

  const [tp, setTp] = useState(position.takeProfit ?? "");
  const [sl, setSl] = useState(position.stopLoss ?? "");
  const [leverage, setLeverage] = useState(position.leverage);
  const update = useUpdatePosition();
  const close = useClosePosition();

  const leverageChanged = leverage !== position.leverage;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: position.id,
        takeProfit: tp.trim() === "" ? null : tp.trim(),
        stopLoss: sl.trim() === "" ? null : sl.trim(),
        leverage: leverageChanged ? leverage : undefined,
      });
      toast.success("Позиция обновлена", position.symbol);
      onClose();
    } catch (err) {
      toast.error("Не удалось обновить позицию", err instanceof ApiError ? err.message : undefined);
    }
  }

  async function handleClose() {
    try {
      const res = await close.mutateAsync(position.id);
      const pnl = Number(res.trade.pnl);
      if (pnl >= 0) toast.success(`Позиция закрыта: +${fmtUsd(res.trade.pnl)}`, position.symbol);
      else toast.error(`Позиция закрыта: ${fmtUsd(res.trade.pnl)}`, position.symbol);
      onClose();
    } catch (err) {
      toast.error("Не удалось закрыть позицию", err instanceof ApiError ? err.message : undefined);
    }
  }

  const pnl = Number(position.unrealisedPnl);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="anim-rise w-full max-w-sm rounded-xl border border-line bg-bg-1 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={classNames("rounded px-1.5 py-0.5 text-2xs font-medium", position.side === "BUY" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
              {position.side === "BUY" ? "Long" : "Short"}
            </span>
            <span className="text-sm font-semibold text-txt-0">{position.symbol}</span>
          </div>
          <button onClick={onClose} className="text-txt-2 hover:text-txt-0"><IconClose size={16} /></button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg border border-line-soft bg-bg-2/40 p-2.5 text-2xs">
          <div><div className="text-txt-3">Qty</div><div className="tabular text-txt-0">{fmtQty(position.qty)}</div></div>
          <div><div className="text-txt-3">Entry</div><div className="tabular text-txt-0">{fmtPrice(position.entryPrice, 4)}</div></div>
          <div><div className="text-txt-3">Mark</div><div className="tabular text-txt-0">{fmtPrice(position.markPrice, 4)}</div></div>
          <div className="col-span-3 border-t border-line-soft pt-2">
            <span className="text-txt-3">uPnL </span>
            <span className={classNames("tabular font-medium", pnl >= 0 ? "text-buy" : "text-sell")}>{fmtSigned(position.unrealisedPnl)} ({position.roePct.toFixed(1)}%)</span>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-2xs font-medium text-buy">Take Profit</span>
              <input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" placeholder="—"
                className="w-full rounded border border-line bg-bg-2 px-2 py-1.5 text-xs tabular outline-none focus:border-buy" />
            </label>
            <label className="block">
              <span className="mb-1 block text-2xs font-medium text-sell">Stop Loss</span>
              <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="—"
                className="w-full rounded border border-line bg-bg-2 px-2 py-1.5 text-xs tabular outline-none focus:border-sell" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 flex justify-between text-2xs text-txt-2">
              <span>Leverage</span>
              <span className={classNames("tabular", leverageChanged ? "font-semibold text-accent" : "text-txt-0")}>{leverage}x</span>
            </span>
            <input
              type="range" min={1} max={maxLeverage} step={1}
              value={leverage} onChange={(e) => setLeverage(Number(e.target.value))}
              className="w-full accent-accent" disabled={maxLeverage <= 1}
            />
            {leverageChanged && (
              <div className="mt-1 text-2xs text-txt-3">
                Маржа и цена ликвидации будут пересчитаны — при увеличении маржи не хватит свободного баланса, запрос будет отклонён.
              </div>
            )}
          </label>

          <div className="rounded-lg border border-line-soft bg-bg-2/30 px-2.5 py-2 text-2xs text-txt-3">
            Частичный тейк-профит (закрытие позиции по частям на нескольких уровнях) пока не поддерживается движком — сейчас у позиции ровно один TP и один SL.
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={handleClose} disabled={close.isPending} className="btn-fx flex-1 rounded-lg border border-sell/40 py-2 text-xs font-medium text-sell hover:bg-sell-soft disabled:opacity-50">
              {close.isPending ? "…" : "Close Position"}
            </button>
            <button type="submit" disabled={update.isPending} className="btn-fx flex-1 rounded-lg bg-accent py-2 text-xs font-semibold text-white hover:bg-accent-dim disabled:opacity-50">
              {update.isPending ? "Сохранение…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
