import { FormEvent, useState } from "react";
import { useAlerts, useCreateAlert, useDeleteAlert } from "../../hooks/useTrading";
import { useInstruments } from "../../hooks/useMarket";
import { useTerminalStore } from "../../store/terminal";
import { LoadingRow, ErrorRow, EmptyRow } from "../common/States";
import { classNames, fmtDateTime, fmtPrice } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import type { AlertDirection } from "../../lib/types";

export function AlertsTab() {
  const terminalSymbol = useTerminalStore((s) => s.symbol);
  const { data, isLoading, isError, refetch } = useAlerts(true);
  const { data: instruments } = useInstruments();
  const create = useCreateAlert();
  const del = useDeleteAlert();

  const [symbol, setSymbol] = useState(terminalSymbol);
  const [direction, setDirection] = useState<AlertDirection>("ABOVE");
  const [price, setPrice] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!price.trim()) return toast.warning("Укажите цену");
    try {
      await create.mutateAsync({ symbol, direction, price: price.trim() });
      toast.success("Алерт создан", `${symbol} ${direction === "ABOVE" ? "выше" : "ниже"} ${price}`);
      setPrice("");
    } catch (e) {
      toast.error("Не удалось создать алерт", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function onDelete(id: string, label: string) {
    try {
      await del.mutateAsync(id);
      toast.info("Алерт удалён", label);
    } catch (e) {
      toast.error("Не удалось удалить алерт", e instanceof ApiError ? e.message : undefined);
    }
  }

  const active = (data?.alerts ?? []).filter((a) => !a.firedAt);
  const fired = (data?.alerts ?? []).filter((a) => a.firedAt);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <form onSubmit={onSubmit} className="flex shrink-0 flex-wrap items-end gap-2 border-b border-line-soft px-2.5 py-2">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded border border-line bg-bg-2 px-2 py-1 text-2xs outline-none focus:border-accent">
          {(instruments?.instruments ?? []).map((i) => (
            <option key={i.symbol} value={i.symbol}>{i.symbol}</option>
          ))}
        </select>
        <div className="flex gap-0.5 rounded border border-line p-0.5">
          <button type="button" onClick={() => setDirection("ABOVE")} className={classNames("rounded px-2 py-1 text-2xs font-medium", direction === "ABOVE" ? "bg-buy-soft text-buy" : "text-txt-2")}>
            Above ≥
          </button>
          <button type="button" onClick={() => setDirection("BELOW")} className={classNames("rounded px-2 py-1 text-2xs font-medium", direction === "BELOW" ? "bg-sell-soft text-sell" : "text-txt-2")}>
            Below ≤
          </button>
        </div>
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Price"
          className="w-28 rounded border border-line bg-bg-2 px-2 py-1 text-2xs tabular outline-none focus:border-accent" />
        <button type="submit" disabled={create.isPending} className="btn-fx rounded bg-accent-fill px-3 py-1 text-2xs font-semibold text-white hover:bg-accent-dim disabled:opacity-50">
          {create.isPending ? "…" : "Create Alert"}
        </button>
        {data && <span className="ml-auto text-2xs text-txt-3">{active.length} активных</span>}
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <LoadingRow label="Загрузка алертов…" />}
        {isError && <ErrorRow label="Не удалось загрузить алерты" onRetry={() => refetch()} />}
        {!isLoading && !isError && (
          <>
            {active.length === 0 && fired.length === 0 && <EmptyRow label="Нет алертов" />}
            {active.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-line-soft/60 px-2.5 py-1.5 text-2xs tabular hover:bg-bg-2/60">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-txt-0">{a.symbol}</span>
                  <span className={a.direction === "ABOVE" ? "text-buy" : "text-sell"}>{a.direction === "ABOVE" ? "≥" : "≤"} {fmtPrice(a.price, 4)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-txt-3">создан {fmtDateTime(a.createdAt)}</span>
                  <button onClick={() => onDelete(a.id, a.symbol)} className="rounded border border-line px-2 py-0.5 text-txt-1 hover:border-sell hover:text-sell">Delete</button>
                </div>
              </div>
            ))}
            {fired.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-line-soft/60 px-2.5 py-1.5 text-2xs tabular opacity-60">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-txt-0">{a.symbol}</span>
                  <span>{a.direction === "ABOVE" ? "≥" : "≤"} {fmtPrice(a.price, 4)}</span>
                  <span className="rounded bg-bg-3 px-1 py-px text-txt-3">fired</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-txt-3">{fmtDateTime(a.firedAt)}</span>
                  <button onClick={() => onDelete(a.id, a.symbol)} className="rounded border border-line px-2 py-0.5 text-txt-1 hover:border-sell hover:text-sell">Delete</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
