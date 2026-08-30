import { useState } from "react";
import { useInstruments } from "../../hooks/useMarket";
import { useAdminUpdateInstrument } from "../../hooks/useAdmin";
import { LoadingRow, ErrorRow } from "../common/States";
import { classNames, fmtPrice } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";

export function InstrumentsTab() {
  const { data, isLoading, isError, refetch } = useInstruments();
  const update = useAdminUpdateInstrument();
  const [editing, setEditing] = useState<Record<string, string>>({});

  async function toggleActive(symbol: string, active: boolean) {
    try {
      await update.mutateAsync({ symbol, active: !active });
      toast.success(`${symbol} ${!active ? "включён" : "отключён"}`);
    } catch (e) {
      toast.error("Не удалось обновить инструмент", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function saveMaxLeverage(symbol: string) {
    const raw = editing[symbol];
    const val = Number(raw);
    if (!Number.isFinite(val) || val < 1 || val > 125) return toast.warning("Плечо должно быть от 1 до 125");
    try {
      await update.mutateAsync({ symbol, maxLeverage: Math.trunc(val) });
      toast.success(`${symbol}: max leverage ${val}x`);
      setEditing((e) => { const n = { ...e }; delete n[symbol]; return n; });
    } catch (e) {
      toast.error("Не удалось обновить плечо", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <LoadingRow label="Загрузка инструментов…" />}
        {isError && <ErrorRow label="Не удалось загрузить инструменты" onRetry={() => refetch()} />}
        {data && (
          <table className="w-full min-w-[720px] text-xs">
            <thead className="sticky top-0 bg-bg-1">
              <tr className="border-b border-line text-left text-txt-3">
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Active</th>
                <th className="px-3 py-2 font-medium">Max Leverage</th>
              </tr>
            </thead>
            <tbody>
              {data.instruments.map((i) => (
                <tr key={i.symbol} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
                  <td className="px-3 py-2 font-medium text-txt-0">{i.symbol}</td>
                  <td className="px-3 py-2 text-txt-2">{i.category}</td>
                  <td className="px-3 py-2 text-right text-txt-1">{fmtPrice(i.price, i.priceDecimals)}</td>
                  <td className="px-3 py-2">
                    <span className={classNames("rounded px-1 py-0.5 text-2xs", i.source === "SYNTHETIC" ? "bg-warn/10 text-warn" : "bg-buy-soft text-buy")}>
                      {i.source}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleActive(i.symbol, true)}
                      className={classNames(
                        "rounded px-2 py-0.5 text-2xs font-medium",
                        "bg-buy-soft text-buy hover:bg-buy/20"
                      )}
                      title="Активен — нажмите, чтобы отключить"
                    >
                      Active
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        value={editing[i.symbol] ?? String(i.maxLeverage)}
                        onChange={(e) => setEditing((s) => ({ ...s, [i.symbol]: e.target.value }))}
                        className="w-16 rounded-lg border border-line bg-bg-2 px-1.5 py-1 text-2xs tabular outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => saveMaxLeverage(i.symbol)}
                        className="rounded-lg border border-line px-2 py-1 text-2xs text-txt-1 hover:border-accent hover:text-accent"
                      >
                        Save
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="shrink-0 border-t border-line px-3 py-1.5 text-2xs text-txt-3">
        Примечание: бэкенд не возвращает флаг «активен» по инструментам, отличным от активных (эндпоинт отдаёт только активные). Кнопка отправляет PATCH и переключает состояние на сервере.
      </div>
    </div>
  );
}
