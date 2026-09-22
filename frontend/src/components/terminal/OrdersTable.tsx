import { useMemo, useState } from "react";
import type { Order } from "../../lib/types";
import { classNames, fmtDateTime, fmtPrice, fmtQty, fmtUsd, n } from "../../lib/format";
import { useCancelOrder } from "../../hooks/useTrading";
import { useBotOrderIds } from "../../store/strategies";
import { EmptyRow } from "../common/States";
import { SortTh, useTableSort, type SortCol } from "../common/SortableTable";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { IconBot } from "../icons/Icon";
import { buttonCls } from "../../lib/ui";

type OriginFilter = "ALL" | "MANUAL" | "BOT";

const STATUS_CLS: Record<Order["status"], string> = {
  NEW: "bg-accent-soft text-accent",
  FILLED: "bg-buy-soft text-buy",
  CANCELLED: "bg-bg-3 text-txt-3",
};

type OrderSortKey = "symbol" | "type" | "side" | "qty" | "price" | "margin" | "status" | "created";

/** Module scope so the reference stays stable across renders — see useTableSort. */
const ORDER_COLS: SortCol<Order, OrderSortKey>[] = [
  { key: "symbol", label: "Symbol", firstDir: 1, compare: (a, b) => a.symbol.localeCompare(b.symbol) },
  { key: "type", label: "Type", firstDir: 1, compare: (a, b) => a.type.localeCompare(b.type) },
  { key: "side", label: "Side", firstDir: 1, compare: (a, b) => a.side.localeCompare(b.side) },
  { key: "qty", label: "Qty", align: "right", compare: (a, b) => n(a.qty) - n(b.qty) },
  { key: "price", label: "Price", align: "right", compare: (a, b) => n(a.price) - n(b.price) },
  { key: "margin", label: "Margin", align: "right", compare: (a, b) => n(a.margin) - n(b.margin) },
  { key: "status", label: "Status", firstDir: 1, compare: (a, b) => a.status.localeCompare(b.status) },
  { key: "created", label: "Created", compare: (a, b) => a.createdAt.localeCompare(b.createdAt) },
];

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

  // Newest first by default: an order list is read as "what did I just place".
  const { sorted, sort, toggle } = useTableSort(filtered, ORDER_COLS, { key: "created", dir: -1 });

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
              className={classNames(
                "btn-fx flex items-center gap-1 rounded px-2 py-1 text-2xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                origin === o ? "bg-accent-soft text-accent" : "text-txt-2"
              )}
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
        <>
          {/* Below `sm`: stacked cards, same reasoning as PositionsTable —
              the table's min-w-[640px] used to push Cancel off-screen. */}
          <div className="sm:hidden">
            {sorted.map((o) => (
              <div key={o.id} className="border-b border-line-soft/60 p-2.5 tabular">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium text-txt-0">{o.symbol}</span>
                    {botOrderIds.has(o.id) && (
                      <span className="inline-flex shrink-0 rounded bg-warn/10 px-1 py-px text-warn" title="Выставлен ботом">
                        <IconBot size={11} />
                      </span>
                    )}
                    <span className={classNames("shrink-0 rounded px-1 py-0.5 text-2xs font-medium", o.side === "BUY" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
                      {o.side}
                    </span>
                  </div>
                  {showStatus && (
                    <span className={classNames("shrink-0 rounded px-1 py-0.5 text-2xs", STATUS_CLS[o.status])}>{o.status}</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-txt-2">
                  <span>{o.type}</span>
                  <span>Qty <span className="text-txt-1">{fmtQty(o.qty)}</span></span>
                  <span>Price <span className="text-txt-1">{fmtPrice(o.price, 4)}</span></span>
                  <span>Margin <span className="text-txt-1">{fmtUsd(o.margin)}</span></span>
                  <span className="text-txt-3">{fmtDateTime(o.createdAt)}</span>
                </div>
                {o.status === "NEW" && (
                  <div className="mt-2">
                    <button
                      onClick={() => handleCancel(o)}
                      disabled={cancelingId === o.id}
                      className={buttonCls("danger", "sm", "w-full")}
                    >
                      {cancelingId === o.id ? "…" : "Cancel"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] text-2xs">
              <thead>
                <tr className="border-b border-line-soft text-left text-txt-3">
                  {ORDER_COLS.map((c) =>
                    c.key === "status" && !showStatus
                      ? null
                      : <SortTh key={c.key} col={c} sort={sort} onToggle={toggle} />,
                  )}
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => (
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
                        <span className={classNames("rounded px-1 py-0.5 text-2xs", STATUS_CLS[o.status])}>{o.status}</span>
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-txt-2">{fmtDateTime(o.createdAt)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {o.status === "NEW" && (
                        <button
                          onClick={() => handleCancel(o)}
                          disabled={cancelingId === o.id}
                          className={buttonCls("danger", "sm")}
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
        </>
      )}
    </div>
  );
}
