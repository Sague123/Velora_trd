import { FormEvent, useState } from "react";
import {
  useAdjustLeadBalance, useCancelLeadOrder, useCloseLeadPosition, useLeadAccount, useSetLeadAccountStatus,
} from "../../hooks/useCrm";
import { classNames, fmtDateTime, fmtSigned, fmtUsd, n } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { SkeletonLines } from "../common/States";
import { AnimatedNumber } from "../common/AnimatedNumber";
import { LedgerTable } from "../terminal/LedgerTable";
import { TradeEditModal } from "./TradeEditModal";
import type { CrmPermission, Position, Trade } from "../../lib/types";

const inputCls = "w-full rounded-lg border border-line bg-bg-2 px-2 py-1.5 text-xs tabular outline-none focus:border-accent";

/**
 * The account behind a converted lead: balances, open positions, open orders,
 * recent trades. Reading it needs no permission — the card already shows a
 * balance figure to any manager — but every action here does, and each is
 * checked again on the server regardless of what this component shows or
 * hides, so a stale permission list never grants more than a confusing
 * "forbidden" toast.
 */
export function AccountPanel({
  leadId, permissions, platformStatus,
}: {
  leadId: string;
  permissions: CrmPermission[];
  /** The linked account's current status — decides which of "block" /
   * "unblock" this panel offers. */
  platformStatus: "ACTIVE" | "SUSPENDED";
}) {
  const canBalance = permissions.includes("MANAGE_BALANCE");
  const canAccount = permissions.includes("MANAGE_ACCOUNT");
  const canTrades = permissions.includes("MANAGE_TRADES");

  const { data, isLoading } = useLeadAccount(leadId, true);
  const adjustBalance = useAdjustLeadBalance();
  const setStatus = useSetLeadAccountStatus();
  const closePosition = useCloseLeadPosition();
  const cancelOrder = useCancelLeadOrder();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  // Which row the edit modal is open for, if any. Showing the button follows
  // MANAGE_TRADES like the close/cancel buttons beside it; the server checks
  // the stricter rule (assignee + recorded consent) again on save, so a stale
  // permission here only ever produces a refusal, never an edit.
  const [editing, setEditing] = useState<
    { kind: "trade"; trade: Trade } | { kind: "position"; position: Position } | null
  >(null);

  function fail(e: unknown, what: string) {
    toast.error(what, e instanceof ApiError ? e.message : undefined);
  }

  async function submitBalance(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!value) return toast.warning("Введите сумму — можно со знаком минус");
    try {
      await adjustBalance.mutateAsync({ id: leadId, amount: value.toFixed(2), note: note.trim() || undefined });
      toast.success("Баланс скорректирован", fmtUsd(value));
      setAmount(""); setNote("");
    } catch (e) {
      fail(e, "Не удалось скорректировать баланс");
    }
  }

  async function toggleStatus(next: "ACTIVE" | "SUSPENDED") {
    try {
      await setStatus.mutateAsync({ id: leadId, status: next });
      toast.success(next === "SUSPENDED" ? "Аккаунт заблокирован" : "Аккаунт разблокирован");
    } catch (e) {
      fail(e, "Не удалось изменить статус аккаунта");
    }
  }

  async function doClose(positionId: string) {
    try {
      await closePosition.mutateAsync({ id: leadId, positionId });
      toast.success("Позиция закрыта");
    } catch (e) {
      fail(e, "Не удалось закрыть позицию");
    }
  }

  async function doCancel(orderId: string) {
    try {
      await cancelOrder.mutateAsync({ id: leadId, orderId });
      toast.success("Ордер отменён");
    } catch (e) {
      fail(e, "Не удалось отменить ордер");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-line-soft bg-bg-2/30 p-3">
          <SkeletonLines lines={2} />
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { summary, positions, openOrders, trades, ledger } = data;

  return (
    <div className="space-y-3">
      {editing && <TradeEditModal leadId={leadId} target={editing} onClose={() => setEditing(null)} />}

      <div className="grid grid-cols-2 gap-2 rounded-lg border border-line-soft bg-bg-2/30 p-3 text-2xs shadow-none transition-shadow hover:shadow-float sm:grid-cols-4">
        <div><span className="text-txt-2">Свободно</span><AnimatedNumber value={n(summary.cash)} format={fmtUsd} className="tabular block font-medium text-txt-0" /></div>
        <div><span className="text-txt-2">В марже</span><AnimatedNumber value={n(summary.usedMargin)} format={fmtUsd} className="tabular block text-txt-1" /></div>
        <div><span className="text-txt-2">Накопления</span><AnimatedNumber value={n(summary.savings)} format={fmtUsd} className="tabular block text-txt-1" /></div>
        <div><span className="text-txt-2">Equity</span><AnimatedNumber value={n(summary.equity)} format={fmtUsd} className="tabular block font-medium text-txt-0" /></div>
      </div>

      {(canBalance || canAccount) && (
        <div className="flex flex-wrap gap-2">
          {canBalance && (
            <form onSubmit={submitBalance} className="flex flex-1 flex-wrap items-end gap-2 rounded-lg border border-line-soft bg-bg-2/30 p-2.5">
              <label className="min-w-[100px]">
                <span className="mb-1 block text-2xs text-txt-2">Сумма (± )</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={inputCls} placeholder="100 или -50" />
              </label>
              <label className="min-w-[140px] flex-1">
                <span className="mb-1 block text-2xs text-txt-2">Примечание</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Причина корректировки" />
              </label>
              <button
                type="submit"
                disabled={!amount || adjustBalance.isPending}
                className="btn-fx rounded-lg bg-accent-fill px-3 py-1.5 text-2xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
              >
                Применить
              </button>
            </form>
          )}
          {canAccount && (
            <div className="flex items-center rounded-lg border border-line-soft bg-bg-2/30 p-2.5">
              {platformStatus === "ACTIVE" ? (
                <button
                  onClick={() => toggleStatus("SUSPENDED")}
                  disabled={setStatus.isPending}
                  className="btn-fx rounded-lg border border-sell/40 px-3 py-1.5 text-2xs font-medium text-sell hover:bg-sell-soft disabled:opacity-40"
                >
                  Заблокировать аккаунт
                </button>
              ) : (
                <button
                  onClick={() => toggleStatus("ACTIVE")}
                  disabled={setStatus.isPending}
                  className="btn-fx rounded-lg border border-buy/40 px-3 py-1.5 text-2xs font-medium text-buy hover:bg-buy-soft disabled:opacity-40"
                >
                  Разблокировать аккаунт
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-txt-2">Открытые позиции ({positions.length})</div>
        {positions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-2xs text-txt-3">Нет открытых позиций.</div>
        ) : (
          <table className="w-full text-2xs">
            <thead>
              <tr className="border-b border-line-soft text-left text-txt-3">
                <th className="px-2 py-1">Символ</th><th className="px-2 py-1">Сторона</th>
                <th className="px-2 py-1 text-right">Объём</th><th className="px-2 py-1 text-right">uPnL</th>
                {canTrades && <th className="px-2 py-1" />}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-line-soft/60 tabular">
                  <td className="px-2 py-1 text-txt-0">{p.symbol}</td>
                  <td className={p.side === "BUY" ? "px-2 py-1 text-buy" : "px-2 py-1 text-sell"}>{p.side}</td>
                  <td className="px-2 py-1 text-right text-txt-1">{p.qty}</td>
                  <td className={classNames("px-2 py-1 text-right font-medium", Number(p.unrealisedPnl) >= 0 ? "text-buy" : "text-sell")}>
                    {fmtSigned(p.unrealisedPnl)}
                  </td>
                  {canTrades && (
                    <td className="flex justify-end gap-1 px-2 py-1 text-right">
                      <button onClick={() => setEditing({ kind: "position", position: p })} className="btn-fx rounded-lg border border-line px-2 py-0.5 text-txt-2 hover:border-accent hover:text-accent">
                        Изменить
                      </button>
                      <button onClick={() => doClose(p.id)} disabled={closePosition.isPending} className="btn-fx rounded-lg border border-line px-2 py-0.5 text-txt-2 hover:border-sell hover:text-sell">
                        Закрыть
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-txt-2">Открытые ордера ({openOrders.length})</div>
        {openOrders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-2xs text-txt-3">Нет открытых ордеров.</div>
        ) : (
          <table className="w-full text-2xs">
            <thead>
              <tr className="border-b border-line-soft text-left text-txt-3">
                <th className="px-2 py-1">Символ</th><th className="px-2 py-1">Тип</th>
                <th className="px-2 py-1 text-right">Цена</th>
                {canTrades && <th className="px-2 py-1" />}
              </tr>
            </thead>
            <tbody>
              {openOrders.map((o) => (
                <tr key={o.id} className="border-b border-line-soft/60 tabular">
                  <td className="px-2 py-1 text-txt-0">{o.symbol}</td>
                  <td className="px-2 py-1 text-txt-1">{o.side} {o.type}</td>
                  <td className="px-2 py-1 text-right text-txt-1">{o.price}</td>
                  {canTrades && (
                    <td className="px-2 py-1 text-right">
                      <button onClick={() => doCancel(o.id)} disabled={cancelOrder.isPending} className="btn-fx rounded-lg border border-line px-2 py-0.5 text-txt-2 hover:border-sell hover:text-sell">
                        Отменить
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {trades.length > 0 && (
        <div>
          <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-txt-2">Последние сделки</div>
          <table className="w-full text-2xs">
            <thead>
              <tr className="border-b border-line-soft text-left text-txt-3">
                <th className="px-2 py-1">Символ</th><th className="px-2 py-1 text-right">PnL</th><th className="px-2 py-1 text-right">Закрыта</th>
                {canTrades && <th className="px-2 py-1" />}
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 10).map((t) => (
                <tr key={t.id} className="border-b border-line-soft/60 tabular">
                  <td className="px-2 py-1 text-txt-0">{t.symbol}</td>
                  <td className={classNames("px-2 py-1 text-right font-medium", Number(t.pnl) >= 0 ? "text-buy" : "text-sell")}>{fmtSigned(t.pnl)}</td>
                  <td className="px-2 py-1 text-right text-txt-3">{fmtDateTime(t.closedAt)}</td>
                  {canTrades && (
                    <td className="px-2 py-1 text-right">
                      <button onClick={() => setEditing({ kind: "trade", trade: t })} className="btn-fx rounded-lg border border-line px-2 py-0.5 text-txt-2 hover:border-accent hover:text-accent">
                        Изменить
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-txt-2">Журнал счёта</div>
        {ledger.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-2xs text-txt-3">Записей нет.</div>
        ) : (
          <LedgerTable entries={ledger} />
        )}
      </div>
    </div>
  );
}
