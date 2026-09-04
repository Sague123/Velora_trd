import { FormEvent, useState } from "react";
import { useEditLeadPosition, useEditLeadTrade, type TradeEditInput } from "../../hooks/useCrm";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { classNames } from "../../lib/format";
import { IconClose, IconWarning } from "../icons/Icon";
import type { Position, Trade } from "../../lib/types";

const inputCls =
  "w-full rounded-lg border border-line bg-bg-2 px-2 py-1.5 text-xs tabular text-txt-0 outline-none focus:border-accent";
const labelCls = "mb-1 block text-2xs text-txt-2";

/** `<input type="datetime-local">` wants "YYYY-MM-DDTHH:mm" in local time,
 * while the API speaks ISO-8601 UTC. Converting through the Date object keeps
 * the wall-clock time the tester typed meaning what they meant by it. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

type Target =
  | { kind: "trade"; trade: Trade }
  | { kind: "position"; position: Position };

/**
 * Hand-editing of a client's trade, for driving the engine's P&L / fee /
 * margin / liquidation arithmetic through scenarios that would otherwise take
 * a market to reproduce.
 *
 * Plain number and datetime inputs, prefilled with the current values — the
 * whole point is exact figures, so nothing here rounds, snaps or slides. What
 * it changes is real: the trade, the position and order it came from, the
 * journal rows that moved the money, and the balance. Hence the confirmation
 * step, which states in words what is about to happen rather than asking
 * "are you sure?".
 */
export function TradeEditModal({
  leadId, target, onClose,
}: {
  leadId: string;
  target: Target;
  onClose: () => void;
}) {
  const editTrade = useEditLeadTrade();
  const editPosition = useEditLeadPosition();
  const isTrade = target.kind === "trade";
  const busy = editTrade.isPending || editPosition.isPending;

  const t = target.kind === "trade" ? target.trade : null;
  const p = target.kind === "position" ? target.position : null;

  const [entryPrice, setEntryPrice] = useState(t?.entryPrice ?? p?.entryPrice ?? "");
  const [exitPrice, setExitPrice] = useState(t?.exitPrice ?? "");
  const [qty, setQty] = useState(t?.qty ?? p?.qty ?? "");
  const [leverage, setLeverage] = useState(String(p?.leverage ?? t?.leverage ?? 1));
  // A closed trade carries its position's opened_at through the CRM snapshot's
  // join; an open position has it directly.
  const [entryTime, setEntryTime] = useState(toLocalInput(p?.openedAt ?? t?.openedAt));
  const [exitTime, setExitTime] = useState(toLocalInput(t?.closedAt));
  const [confirming, setConfirming] = useState(false);

  const id = isTrade ? target.trade.id : target.position.id;
  const symbol = isTrade ? target.trade.symbol : target.position.symbol;

  function patch(): TradeEditInput {
    return {
      entryPrice: entryPrice.trim() || undefined,
      exitPrice: isTrade ? exitPrice.trim() || undefined : undefined,
      qty: qty.trim() || undefined,
      leverage: Number(leverage) > 0 ? Number(leverage) : undefined,
      entryTime: fromLocalInput(entryTime),
      exitTime: isTrade ? fromLocalInput(exitTime) : undefined,
    };
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!confirming) return setConfirming(true);
    try {
      const res = isTrade
        ? await editTrade.mutateAsync({ id: leadId, tradeId: id, patch: patch() })
        : await editPosition.mutateAsync({ id: leadId, positionId: id, patch: patch() });
      toast.success(
        res.changes.length ? "Параметры пересчитаны" : "Изменений нет",
        res.changes.length ? res.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(" · ") : undefined
      );
      onClose();
    } catch (err) {
      setConfirming(false);
      toast.error("Не удалось изменить сделку", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div
        className="anim-rise max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-bg-1 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-txt-0">
              {isTrade ? "Изменить сделку" : "Изменить позицию"} · {symbol}
            </h2>
            <div className="mono text-2xs text-txt-3">#{id.slice(0, 8)}</div>
          </div>
          <button onClick={onClose} className="btn-fx tap-sm rounded-lg border border-line p-1 text-txt-2 hover:text-txt-0">
            <IconClose size={13} />
          </button>
        </div>

        <div className="mb-3 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-2 text-2xs text-warn">
          <IconWarning size={13} className="mt-0.5 shrink-0" />
          <span>
            Тестовый инструмент. Правка задним числом меняет финансовые показатели клиента: P&amp;L,
            комиссии, маржу и цену ликвидации пересчитает сервер, а записи журнала и баланс будут
            переписаны под новые значения.
          </span>
        </div>

        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Entry Price</span>
              <input value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} inputMode="decimal" className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Entry Time</span>
              <input type="datetime-local" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Qty</span>
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Leverage</span>
              <input value={leverage} onChange={(e) => setLeverage(e.target.value)} inputMode="numeric" className={inputCls} />
            </label>

            {/* Only a closed trade has an exit — an open position's exit is
                whatever the market does next, which is not this tool's to set. */}
            {isTrade && (
              <>
                <label className="block">
                  <span className={labelCls}>Exit Price</span>
                  <input value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} inputMode="decimal" className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>Exit Time</span>
                  <input type="datetime-local" value={exitTime} onChange={(e) => setExitTime(e.target.value)} className={inputCls} />
                </label>
              </>
            )}
          </div>

          {confirming && (
            <div className="rounded-lg border border-sell/40 bg-sell-soft px-2.5 py-2 text-2xs text-sell">
              Изменить параметры {isTrade ? "сделки" : "позиции"} #{id.slice(0, 8)}? Это тестовое действие,
              задним числом меняющее финансовые показатели клиента. Оно будет записано в логи карточки.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className={classNames(
                "btn-fx tap-sm rounded-lg px-3 py-1.5 text-2xs font-semibold text-white disabled:opacity-40",
                confirming ? "bg-sell-fill hover:brightness-110" : "bg-accent-fill hover:brightness-110"
              )}
            >
              {busy ? "Сохранение…" : confirming ? "Да, изменить" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => (confirming ? setConfirming(false) : onClose())}
              className="btn-fx tap-sm rounded-lg border border-line px-3 py-1.5 text-2xs text-txt-2 hover:text-txt-0"
            >
              {confirming ? "Назад" : "Отмена"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
