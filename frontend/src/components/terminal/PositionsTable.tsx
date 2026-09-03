import { useEffect, useRef, useState } from "react";
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
        <button
          onClick={save}
          disabled={update.isPending}
          className="btn-fx flex-1 rounded bg-accent-fill py-1 text-2xs font-medium text-white hover:bg-accent-dim disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Сохранить
        </button>
        <button
          onClick={onDone}
          className="btn-fx flex-1 rounded border border-line py-1 text-2xs text-txt-2 hover:text-txt-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
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

  // A position that just appeared (bot fill, manual order filling, a fresh
  // page of data landing) gets one brief highlight — reusing the same
  // flash-up keyframes the live price ticker already uses, rather than
  // inventing a new animation for what's the same idea: "this just changed."
  const prevIdsRef = useRef<Set<string> | null>(null);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(positions.map((p) => p.id));
    const prev = prevIdsRef.current;
    prevIdsRef.current = ids;
    if (!prev) return; // first render — nothing "just" appeared yet
    const added = [...ids].filter((id) => !prev.has(id));
    if (added.length === 0) return;
    setJustAdded(new Set(added));
    const timer = setTimeout(() => setJustAdded(new Set()), 700);
    return () => clearTimeout(timer);
  }, [positions]);

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
    <div>
      {editModalPosition && <PositionEditModal position={editModalPosition} onClose={() => setEditModalId(null)} />}

      {/* Below `sm` (640px): a stacked card per position instead of the
          desktop table. The table's own min-w-[720px] used to render here
          too, forcing the Close button off the right edge of a phone screen
          behind a horizontal scroll — this shows the same information (Qty/
          Entry/Mark/Liq/Margin/uPnL) without needing any scroll at all, and
          gives Edit/Close real touch targets (tap-sm) instead of 20px chips. */}
      <div className="sm:hidden">
        {positions.map((p) => {
          const pnl = Number(p.unrealisedPnl);
          return (
            <div
              key={p.id}
              onClick={() => openOnChart(p.symbol)}
              className={classNames("cursor-pointer border-b border-line-soft/60 p-2.5 tabular hover:bg-bg-2/60", justAdded.has(p.id) && "flash-up")}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium text-txt-0">{p.symbol}</span>
                  <span className={classNames("shrink-0 rounded px-1 py-0.5 text-2xs font-medium", p.side === "BUY" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
                    {p.side === "BUY" ? "Long" : "Short"} {p.leverage}x
                  </span>
                </div>
                <span className={classNames("shrink-0 text-right text-xs font-semibold", pnl >= 0 ? "text-buy" : "text-sell")}>
                  {fmtSigned(p.unrealisedPnl)} <span className="text-2xs font-normal text-txt-3">({p.roePct.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-txt-2">
                <span>Qty <span className="text-txt-1">{fmtQty(p.qty)}</span></span>
                <span>Entry <span className="text-txt-1">{fmtPrice(p.entryPrice, 4)}</span></span>
                <span>Mark <span className="text-txt-1">{fmtPrice(p.markPrice, 4)}</span></span>
                <span>Liq <span className="text-warn">{p.liquidationPrice ? fmtPrice(p.liquidationPrice, 4) : "—"}</span></span>
                <span>Margin <span className="text-txt-1">{fmtUsd(p.margin)}</span></span>
              </div>
              {!compact && (
                <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setEditModalId(p.id)}
                    className="btn-fx tap-sm flex flex-1 items-center justify-center gap-1 rounded border border-line text-2xs text-txt-2 hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <IconGear size={13} /> {p.takeProfit || p.stopLoss ? "TP/SL" : "Edit"}
                  </button>
                  <button
                    onClick={() => handleClose(p)}
                    disabled={closingId === p.id}
                    className="btn-fx tap-sm flex-1 rounded border border-line text-2xs text-txt-1 hover:border-sell hover:text-sell disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sell"
                  >
                    {closingId === p.id ? "…" : "Close"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* `sm` and up: the full desktop table, unchanged columns/information. */}
      <div className="hidden overflow-x-auto sm:block">
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
                  className={classNames("cursor-pointer border-b border-line-soft/60 tabular hover:bg-bg-2/60", justAdded.has(p.id) && "flash-up")}
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
                      <button onClick={() => setEditingId(p.id === editingId ? null : p.id)} className="btn-fx rounded text-txt-2 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
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
                        className="btn-fx rounded border border-line px-1.5 py-0.5 text-txt-2 hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <IconGear size={12} />
                      </button>
                      <button
                        onClick={() => handleClose(p)}
                        disabled={closingId === p.id}
                        className="btn-fx rounded border border-line px-2 py-0.5 text-2xs text-txt-1 hover:border-sell hover:text-sell disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sell"
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
    </div>
  );
}

export function positionOpenedLabel(iso: string) {
  return fmtDateTime(iso);
}
