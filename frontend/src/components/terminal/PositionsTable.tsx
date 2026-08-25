import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Position } from "../../lib/types";
import { classNames, fmtDateTime, fmtPrice, fmtQty, fmtSigned, fmtUsd } from "../../lib/format";
import { useClosePosition, useUpdatePosition } from "../../hooks/useTrading";
import { useTerminalStore } from "../../store/terminal";
import { EmptyRow } from "../common/States";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { PositionEditModal } from "./PositionEditModal";
import { IconGear } from "../icons/Icon";

function TpSlEditor({ position, onDone }: { position: Position; onDone: () => void }) {
  const [tp, setTp] = useState(position.takeProfit ?? "");
  const [sl, setSl] = useState(position.stopLoss ?? "");
  const update = useUpdatePosition();

  async function save() {
    try {
      await update.mutateAsync({
        id: position.id,
        takeProfit: tp.trim() === "" ? null : tp.trim(),
        stopLoss: sl.trim() === "" ? null : sl.trim(),
      });
      toast.success("TP/SL обновлены", position.symbol);
      onDone();
    } catch (e) {
      toast.error("Не удалось обновить TP/SL", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded border border-line bg-bg-2 p-2 shadow-xl">
      <label className="mb-1.5 block text-2xs text-txt-2">
        Take Profit
        <input
          value={tp}
          onChange={(e) => setTp(e.target.value)}
          placeholder="—"
          className="mt-0.5 w-full rounded border border-line bg-bg-3 px-1.5 py-1 text-xs outline-none focus:border-buy"
        />
      </label>
      <label className="mb-2 block text-2xs text-txt-2">
        Stop Loss
        <input
          value={sl}
          onChange={(e) => setSl(e.target.value)}
          placeholder="—"
          className="mt-0.5 w-full rounded border border-line bg-bg-3 px-1.5 py-1 text-xs outline-none focus:border-sell"
        />
      </label>
      <div className="flex gap-1.5">
        <button onClick={save} disabled={update.isPending} className="flex-1 rounded bg-accent-fill py-1 text-2xs font-medium text-white hover:bg-accent-dim disabled:opacity-50">
          Сохранить
        </button>
        <button onClick={onDone} className="flex-1 rounded border border-line py-1 text-2xs text-txt-2 hover:text-txt-0">
          Отмена
        </button>
      </div>
    </div>
  );
}

export function PositionsTable({ positions, compact = false }: { positions: Position[]; compact?: boolean }) {
  const { t } = useTranslation();
  const close = useClosePosition();
  const navigate = useNavigate();
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [editModalId, setEditModalId] = useState<string | null>(null);
  const editModalPosition = editModalId ? positions.find((p) => p.id === editModalId) ?? null : null;

  function openOnChart(symbol: string) {
    setSymbol(symbol);
    navigate("/terminal");
  }

  async function handleClose(p: Position) {
    setClosingId(p.id);
    try {
      const res = await close.mutateAsync(p.id);
      const pnl = Number(res.trade.pnl);
      if (pnl >= 0) toast.success(`Позиция закрыта: +${fmtUsd(res.trade.pnl)}`, p.symbol);
      else toast.error(`Позиция закрыта: ${fmtUsd(res.trade.pnl)}`, p.symbol);
    } catch (e) {
      toast.error("Не удалось закрыть позицию", e instanceof ApiError ? e.message : undefined);
    } finally {
      setClosingId(null);
    }
  }

  if (positions.length === 0) return <EmptyRow label={t("terminal.noOpenPositions")} />;

  return (
    <div className="overflow-x-auto">
      {editModalPosition && <PositionEditModal position={editModalPosition} onClose={() => setEditModalId(null)} />}
      <table className="w-full min-w-[720px] text-2xs">
        <thead>
          <tr className="border-b border-line-soft text-left text-txt-3">
            <th className="px-2 py-1.5 font-medium">Symbol</th>
            <th className="px-2 py-1.5 font-medium">Side</th>
            <th className="px-2 py-1.5 text-right font-medium">Qty</th>
            <th className="px-2 py-1.5 text-right font-medium">Entry</th>
            <th className="px-2 py-1.5 text-right font-medium">Mark</th>
            <th className="px-2 py-1.5 text-right font-medium">Liq.</th>
            <th className="px-2 py-1.5 text-right font-medium">Margin</th>
            <th className="px-2 py-1.5 text-right font-medium">uPnL / ROE</th>
            {!compact && <th className="px-2 py-1.5 font-medium">TP / SL</th>}
            <th className="px-2 py-1.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const pnl = Number(p.unrealisedPnl);
            return (
              <tr
                key={p.id}
                onClick={() => openOnChart(p.symbol)}
                title="Открыть на графике"
                className="cursor-pointer border-b border-line-soft/60 tabular hover:bg-bg-2/60"
              >
                <td className="px-2 py-1.5 font-medium text-txt-0">{p.symbol}</td>
                <td className="px-2 py-1.5">
                  <span className={classNames("rounded px-1 py-0.5 font-medium", p.side === "BUY" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
                    {p.side === "BUY" ? "Long" : "Short"} {p.leverage}x
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right">{fmtQty(p.qty)}</td>
                <td className="px-2 py-1.5 text-right">{fmtPrice(p.entryPrice, 4)}</td>
                <td className="px-2 py-1.5 text-right">{fmtPrice(p.markPrice, 4)}</td>
                <td className="px-2 py-1.5 text-right text-warn">{p.liquidationPrice ? fmtPrice(p.liquidationPrice, 4) : "—"}</td>
                <td className="px-2 py-1.5 text-right">{fmtUsd(p.margin)}</td>
                <td className={classNames("px-2 py-1.5 text-right font-medium", pnl >= 0 ? "text-buy" : "text-sell")}>
                  {fmtSigned(p.unrealisedPnl)} <span className="text-txt-3">({p.roePct.toFixed(1)}%)</span>
                </td>
                {!compact && (
                  <td className="relative px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditingId(p.id === editingId ? null : p.id)} className="text-txt-2 hover:text-accent">
                      {p.takeProfit ? fmtPrice(p.takeProfit, 4) : "—"} / {p.stopLoss ? fmtPrice(p.stopLoss, 4) : "—"}
                    </button>
                    {editingId === p.id && <TpSlEditor position={p} onDone={() => setEditingId(null)} />}
                  </td>
                )}
                <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setEditModalId(p.id)}
                      title="Редактировать: TP/SL, плечо"
                      className="rounded border border-line px-1.5 py-0.5 text-txt-2 hover:border-accent hover:text-accent"
                    >
                      <IconGear size={12} />
                    </button>
                    <button
                      onClick={() => handleClose(p)}
                      disabled={closingId === p.id}
                      className="rounded border border-line px-2 py-0.5 text-2xs text-txt-1 hover:border-sell hover:text-sell disabled:opacity-40"
                    >
                      {closingId === p.id ? "…" : "Close"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function positionOpenedLabel(iso: string) {
  return fmtDateTime(iso);
}
