import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { useAlerts, useOrders, usePositions, useTrades } from "../../hooks/useTrading";
import { PositionsTable } from "./PositionsTable";
import { OrdersTable } from "./OrdersTable";
import { TradesTable } from "./TradesTable";
import { AlertsTab } from "./AlertsTab";
import { LoadingRow, ErrorRow } from "../common/States";
import { classNames } from "../../lib/format";
import { IconBell, IconClipboard, IconHistory, IconTrade } from "../icons/Icon";
import type { ComponentType } from "react";

type Tab = "positions" | "orders" | "history" | "alerts";

const TABS: { id: Tab; Icon: ComponentType<{ size?: number }> }[] = [
  // Ordered live-to-quiet, not alphabetical: positions/orders are what a
  // trade in progress actually needs watching; history/alerts are consulted,
  // not watched. Icons anchor that same weighting at a glance rather than
  // presenting four identically-weighted text labels.
  { id: "positions", Icon: IconTrade },
  { id: "orders", Icon: IconClipboard },
  { id: "history", Icon: IconHistory },
  { id: "alerts", Icon: IconBell },
];

export function BottomPanel() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("positions");

  const positions = usePositions(!!user && tab === "positions");
  const orders = useOrders("NEW", !!user && tab === "orders");
  const trades = useTrades(!!user && tab === "history");
  const alerts = useAlerts(!!user && tab === "alerts");

  const positionsCount = positions.data?.positions.length ?? 0;
  const ordersCount = orders.data?.orders.length ?? 0;
  const alertsCount = alerts.data?.alerts.filter((a) => !a.firedAt).length ?? 0;

  const LABELS: Record<Tab, string> = {
    positions: `${t("terminal.positions")}${positionsCount ? ` (${positionsCount})` : ""}`,
    orders: `${t("terminal.openOrders")}${ordersCount ? ` (${ordersCount})` : ""}`,
    history: t("terminal.tradeHistory"),
    alerts: `${t("terminal.alerts")}${alertsCount ? ` (${alertsCount})` : ""}`,
  };

  return (
    <div className="flex h-full flex-col bg-bg-1">
      {/* overflow-x-auto rather than forcing all four tabs to shrink to fit —
          on a 390px phone that used to squeeze "Открытые ордера"/"История
          сделок" down to their tightest possible width; this keeps every
          label at full, readable size and lets the strip scroll instead. */}
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line px-1">
        {TABS.map(({ id, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={classNames(
              "btn-fx tap-sm flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-1.5 text-2xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              tab === id ? "border-accent text-txt-0" : "border-transparent text-txt-2 hover:text-txt-0"
            )}
          >
            <Icon size={14} />
            {LABELS[id]}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "positions" && (
          <>
            {positions.isLoading && <LoadingRow />}
            {positions.isError && <ErrorRow label="Не удалось загрузить позиции" onRetry={() => positions.refetch()} />}
            {positions.data && <PositionsTable positions={positions.data.positions} />}
          </>
        )}
        {tab === "orders" && (
          <>
            {orders.isLoading && <LoadingRow />}
            {orders.isError && <ErrorRow label="Не удалось загрузить ордера" onRetry={() => orders.refetch()} />}
            {orders.data && <OrdersTable orders={orders.data.orders} />}
          </>
        )}
        {tab === "history" && (
          <>
            {trades.isLoading && <LoadingRow />}
            {trades.isError && <ErrorRow label="Не удалось загрузить историю" onRetry={() => trades.refetch()} />}
            {trades.data && <TradesTable trades={trades.data.trades} />}
          </>
        )}
        {tab === "alerts" && <AlertsTab />}
      </div>
    </div>
  );
}
