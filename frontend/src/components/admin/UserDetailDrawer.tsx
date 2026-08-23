import { FormEvent, useState } from "react";
import {
  useAdminAdjustBalance, useAdminCancelOrder, useAdminClosePosition,
  useAdminResetPassword, useAdminUpdateUser, useAdminUserDetail,
} from "../../hooks/useAdmin";
import { TradesTable } from "../terminal/TradesTable";
import { LedgerTable } from "../terminal/LedgerTable";
import { LoadingRow, ErrorRow } from "../common/States";
import { classNames, fmtDateTime, fmtPrice, fmtQty, fmtSigned, fmtUsd } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { useAuthStore } from "../../store/auth";
import { IconClose } from "../icons/Icon";

type Tab = "positions" | "orders" | "history" | "ledger";

export function UserDetailDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const me = useAuthStore((s) => s.user);
  const { data, isLoading, isError, refetch } = useAdminUserDetail(userId, true);
  const updateUser = useAdminUpdateUser();
  const adjustBalance = useAdminAdjustBalance();
  const resetPassword = useAdminResetPassword();
  const closePosition = useAdminClosePosition();
  const cancelOrder = useAdminCancelOrder();

  const [tab, setTab] = useState<Tab>("positions");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const isSelf = userId === me?.id;

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    if (!amount.trim()) return;
    try {
      await adjustBalance.mutateAsync({ id: userId, amount: amount.trim(), note: note.trim() || undefined });
      toast.success("Баланс изменён", `${amount.startsWith("-") ? "" : "+"}${amount}`);
      setAmount("");
      setNote("");
    } catch (e) {
      toast.error("Не удалось изменить баланс", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function onResetPassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 10) return toast.warning("Пароль должен быть не короче 10 символов");
    try {
      await resetPassword.mutateAsync({ id: userId, newPassword });
      toast.success("Пароль сброшен");
      setNewPassword("");
    } catch (e) {
      toast.error("Не удалось сбросить пароль", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function onToggleStatus() {
    if (!data) return;
    const next = data.user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await updateUser.mutateAsync({ id: userId, status: next });
      toast.success(next === "ACTIVE" ? "Аккаунт разблокирован" : "Аккаунт заблокирован");
    } catch (e) {
      toast.error("Не удалось изменить статус", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function onToggleRole() {
    if (!data) return;
    const next = data.user.role === "ADMIN" ? "USER" : "ADMIN";
    try {
      await updateUser.mutateAsync({ id: userId, role: next });
      toast.success(`Роль изменена на ${next}`);
    } catch (e) {
      toast.error("Не удалось изменить роль", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function onAdminClose(positionId: string) {
    try {
      const res = await closePosition.mutateAsync({ userId, positionId });
      toast.success("Позиция закрыта админом", fmtUsd(res.trade.pnl));
    } catch (e) {
      toast.error("Не удалось закрыть позицию", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function onAdminCancel(orderId: string) {
    try {
      await cancelOrder.mutateAsync({ userId, orderId });
      toast.info("Ордер отменён админом");
    } catch (e) {
      toast.error("Не удалось отменить ордер", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/50" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-bg-1 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {isLoading && <LoadingRow label="Загрузка пользователя…" />}
        {isError && <ErrorRow label="Не удалось загрузить пользователя" onRetry={() => refetch()} />}
        {data && (
          <>
            <div className="flex shrink-0 items-start justify-between border-b border-line px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-txt-0">{data.user.name}</span>
                  <span className={classNames("rounded px-1.5 py-0.5 text-2xs font-medium", data.user.role === "ADMIN" ? "bg-warn/10 text-warn" : "bg-accent-soft text-accent")}>
                    {data.user.role}
                  </span>
                  <span className={classNames("rounded px-1.5 py-0.5 text-2xs font-medium", data.user.status === "ACTIVE" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
                    {data.user.status}
                  </span>
                </div>
                <div className="mt-0.5 text-2xs text-txt-2">{data.user.email}</div>
                <div className="mt-0.5 text-2xs text-txt-3">
                  Зарегистрирован {fmtDateTime(data.user.createdAt)} · вход {fmtDateTime(data.user.lastLoginAt)}
                </div>
              </div>
              <button onClick={onClose} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-txt-2 hover:text-txt-0">
                <IconClose size={12} /> Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 border-b border-line px-4 py-3 sm:grid-cols-4">
                <div>
                  <div className="text-2xs text-txt-2">Cash</div>
                  <div className="tabular text-sm font-semibold text-txt-0">{fmtUsd(data.account.cash)}</div>
                </div>
                <div>
                  <div className="text-2xs text-txt-2">Equity</div>
                  <div className="tabular text-sm font-semibold text-txt-0">{fmtUsd(data.account.equity)}</div>
                </div>
                <div>
                  <div className="text-2xs text-txt-2">Used Margin</div>
                  <div className="tabular text-sm font-semibold text-txt-0">{fmtUsd(data.account.usedMargin)}</div>
                </div>
                <div>
                  <div className="text-2xs text-txt-2">Unrealised PnL</div>
                  <div className={classNames("tabular text-sm font-semibold", Number(data.account.unrealisedPnl) >= 0 ? "text-buy" : "text-sell")}>
                    {fmtUsd(data.account.unrealisedPnl)}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 border-b border-line px-4 py-3 sm:grid-cols-3">
                <form onSubmit={onAdjust} className="rounded border border-line-soft bg-bg-2/40 p-2.5">
                  <div className="mb-1.5 text-2xs font-semibold text-txt-1">Balance Adjustment</div>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="500 или -500"
                    className="mb-1.5 w-full rounded border border-line bg-bg-3 px-2 py-1 text-2xs tabular outline-none focus:border-accent"
                  />
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Примечание (опц.)"
                    className="mb-1.5 w-full rounded border border-line bg-bg-3 px-2 py-1 text-2xs outline-none focus:border-accent"
                  />
                  <button type="submit" disabled={adjustBalance.isPending} className="w-full rounded bg-accent py-1 text-2xs font-medium text-white hover:bg-accent-dim disabled:opacity-50">
                    Apply
                  </button>
                </form>

                <form onSubmit={onResetPassword} className="rounded border border-line-soft bg-bg-2/40 p-2.5">
                  <div className="mb-1.5 text-2xs font-semibold text-txt-1">Reset Password</div>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Новый пароль (мин. 10)"
                    className="mb-1.5 w-full rounded border border-line bg-bg-3 px-2 py-1 text-2xs outline-none focus:border-accent"
                  />
                  <button type="submit" disabled={resetPassword.isPending} className="w-full rounded border border-line py-1 text-2xs font-medium text-txt-1 hover:border-accent hover:text-accent disabled:opacity-50">
                    Reset
                  </button>
                </form>

                <div className="rounded border border-line-soft bg-bg-2/40 p-2.5">
                  <div className="mb-1.5 text-2xs font-semibold text-txt-1">Account Controls</div>
                  <button
                    onClick={onToggleStatus}
                    disabled={isSelf || updateUser.isPending}
                    className="mb-1.5 w-full rounded border border-line py-1 text-2xs font-medium text-txt-1 hover:border-warn hover:text-warn disabled:opacity-40"
                  >
                    {data.user.status === "ACTIVE" ? "Suspend account" : "Reactivate account"}
                  </button>
                  <button
                    onClick={onToggleRole}
                    disabled={isSelf || updateUser.isPending}
                    className="w-full rounded border border-line py-1 text-2xs font-medium text-txt-1 hover:border-accent hover:text-accent disabled:opacity-40"
                  >
                    {data.user.role === "ADMIN" ? "Demote to USER" : "Promote to ADMIN"}
                  </button>
                  {isSelf && <div className="mt-1 text-2xs text-txt-3">Нельзя изменить собственный аккаунт</div>}
                </div>
              </div>

              <div className="flex gap-0.5 border-b border-line px-2 pt-1">
                {(
                  [
                    ["positions", `Positions (${data.positions.length})`],
                    ["orders", `Orders (${data.orders.length})`],
                    ["history", "Trades"],
                    ["ledger", "Ledger"],
                  ] as [Tab, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={classNames(
                      "border-b-2 px-2.5 py-1.5 text-2xs font-medium",
                      tab === id ? "border-accent text-txt-0" : "border-transparent text-txt-2 hover:text-txt-0"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "positions" && (
                data.positions.length === 0 ? (
                  <div className="p-4 text-2xs text-txt-3">Нет открытых позиций</div>
                ) : (
                  <table className="w-full text-2xs">
                    <thead>
                      <tr className="border-b border-line-soft text-left text-txt-3">
                        <th className="px-3 py-1.5 font-medium">Symbol</th>
                        <th className="px-3 py-1.5 font-medium">Side</th>
                        <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                        <th className="px-3 py-1.5 text-right font-medium">Entry</th>
                        <th className="px-3 py-1.5 text-right font-medium">Mark</th>
                        <th className="px-3 py-1.5 text-right font-medium">uPnL</th>
                        <th className="px-3 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.positions.map((p) => (
                        <tr key={p.id} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
                          <td className="px-3 py-1.5 font-medium text-txt-0">{p.symbol}</td>
                          <td className="px-3 py-1.5">
                            <span className={classNames("rounded px-1 py-0.5 font-medium", p.side === "BUY" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
                              {p.side === "BUY" ? "Long" : "Short"} {p.leverage}x
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right">{fmtQty(p.qty)}</td>
                          <td className="px-3 py-1.5 text-right">{fmtPrice(p.entryPrice, 4)}</td>
                          <td className="px-3 py-1.5 text-right">{fmtPrice(p.markPrice, 4)}</td>
                          <td className={classNames("px-3 py-1.5 text-right font-medium", Number(p.unrealisedPnl) >= 0 ? "text-buy" : "text-sell")}>
                            {fmtSigned(p.unrealisedPnl)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <button onClick={() => onAdminClose(p.id)} className="rounded border border-line px-2 py-0.5 text-2xs text-txt-1 hover:border-sell hover:text-sell">
                              Force Close
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
              {tab === "orders" && (
                data.orders.length === 0 ? (
                  <div className="p-4 text-2xs text-txt-3">Нет активных ордеров</div>
                ) : (
                  <table className="w-full text-2xs">
                    <thead>
                      <tr className="border-b border-line-soft text-left text-txt-3">
                        <th className="px-3 py-1.5 font-medium">Symbol</th>
                        <th className="px-3 py-1.5 font-medium">Type</th>
                        <th className="px-3 py-1.5 font-medium">Side</th>
                        <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                        <th className="px-3 py-1.5 text-right font-medium">Price</th>
                        <th className="px-3 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((o) => (
                        <tr key={o.id} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
                          <td className="px-3 py-1.5 font-medium text-txt-0">{o.symbol}</td>
                          <td className="px-3 py-1.5 text-txt-1">{o.type}</td>
                          <td className="px-3 py-1.5">
                            <span className={classNames("rounded px-1 py-0.5 font-medium", o.side === "BUY" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
                              {o.side}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right">{fmtQty(o.qty)}</td>
                          <td className="px-3 py-1.5 text-right">{fmtPrice(o.price, 4)}</td>
                          <td className="px-3 py-1.5 text-right">
                            <button onClick={() => onAdminCancel(o.id)} className="rounded border border-line px-2 py-0.5 text-2xs text-txt-1 hover:border-sell hover:text-sell">
                              Force Cancel
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
              {tab === "history" && <TradesTable trades={data.trades} />}
              {tab === "ledger" && <LedgerTable entries={data.ledger} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
