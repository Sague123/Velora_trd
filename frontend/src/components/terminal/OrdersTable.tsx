import { useMemo, useState } from "react";
import type { Order } from "../../lib/types";
import { classNames, fmtDateTime, fmtPrice, fmtQty, fmtUsd } from "../../lib/format";
import { useCancelOrder } from "../../hooks/useTrading";
import { useBotOrderIds } from "../../store/strategies";
import { EmptyRow } from "../common/States";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { IconBot } from "../icons/Icon";

type OriginFilter = "ALL" | "MANUAL" | "BOT";

export function OrdersTable({ orders, showStatus = false, showOriginFilter = true }: { orders: Order[]; showStatus?: boolean; showOriginFilter?: boolean }) {
  const cancel = useCancelOrder();
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const botOrderIds = useBotOrderIds();
  const [origin, setOrigin] = useState<OriginFilter>("ALL");

  const hasBotOrders = orders.some((o) => botOrderIds.has(o.id));
  const filtered = useMemo(() => {
    if (origin === "ALL") return orders;
    return orders.filter((o) => (origin === "BOT") === botOrderIds.has(o.id));
  }, [orders, origin, botOrderIds]);

  async function handleCancel(o: Order) {
    setCancelingId(o.id);
    try {
      await cancel.mutateAsync(o.id);
      toast.info("Ордер отменён", `${o.symbol} ${o.side} ${o.qty}`);
    } catch (e) {
      toast.error("Не удалось отменить ордер", e instanceof ApiError ? e.message : undefined);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div>
      {showOriginFilter && hasBotOrders && (
        <div className="flex items-center gap-1 border-b border-line-soft px-2 py-1.5">
          <span className="mr-1 text-2xs text-txt-3">Источник:</span>
          {(["ALL", "MANUAL", "BOT"] as OriginFilter[]).map((o) => (
            <button
              key={o}
              onClick={() => setOrigin(o)}
              className={classNames("btn-fx flex items-center gap-1 rounded px-2 py-0.5 text-2xs font-medium", origin === o ? "bg-accent-soft text-accent" : "text-txt-2")}
            >
              {o === "BOT" && <IconBot size={11} />}
              {o === "ALL" ? "Все" : o === "MANUAL" ? "Ручные" : "Боты"}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyRow label="Нет ордеров" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-2xs">
            <thead>
              <tr className="border-b border-line-soft text-left text-txt-3">
                <th className="px-2 py-1.5 font-medium">Symbol</th>
                <th className="px-2 py-1.5 font-medium">Type</th>
                <th className="px-2 py-1.5 font-medium">Side</th>
                <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                <th className="px-2 py-1.5 text-right font-medium">Price</th>
                <th className="px-2 py-1.5 text-right font-medium">Margin</th>
                {showStatus && <th className="px-2 py-1.5 font-medium">Status</th>}
                <th className="px-2 py-1.5 font-medium">Created</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
                  <td className="px-2 py-1.5 font-medium text-txt-0">
                    {o.symbol}
                    {botOrderIds.has(o.id) && <span className="ml-1.5 inline-flex rounded bg-warn/10 px-1 py-px text-warn" title="Выставлен ботом"><IconBot size={11} /></span>}
                  </td>
                  <td className="px-2 py-1.5 text-txt-1">{o.type}</td>
                  <td className="px-2 py-1.5">
                    <span className={classNames("rounded px-1 py-0.5 font-medium", o.side === "BUY" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
                      {o.side}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">{fmtQty(o.qty)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtPrice(o.price, 4)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtUsd(o.margin)}</td>
                  {showStatus && (
                    <td className="px-2 py-1.5">
                      <span
                        className={classNames(
                          "rounded px-1 py-0.5 text-2xs",
                          o.status === "NEW" && "bg-accent-soft text-accent",
                          o.status === "FILLED" && "bg-buy-soft text-buy",
                          o.status === "CANCELLED" && "bg-bg-3 text-txt-3"
                        )}
                      >
                        {o.status}
                      </span>
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-txt-2">{fmtDateTime(o.createdAt)}</td>
                  <td className="px-2 py-1.5 text-right">
                    {o.status === "NEW" && (
                      <button
                        onClick={() => handleCancel(o)}
                        disabled={cancelingId === o.id}
                        className="rounded border border-line px-2 py-0.5 text-2xs text-txt-1 hover:border-sell hover:text-sell disabled:opacity-40"
                      >
                        {cancelingId === o.id ? "…" : "Cancel"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
