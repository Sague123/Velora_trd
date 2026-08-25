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

type Tab = "positions" | "orders" | "history" | "alerts";

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

  return (
    <div className="flex h-full flex-col bg-bg-1">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-line px-1">
        {(
          [
            ["positions", `${t("terminal.positions")}${positionsCount ? ` (${positionsCount})` : ""}`],
            ["orders", `${t("terminal.openOrders")}${ordersCount ? ` (${ordersCount})` : ""}`],
            ["history", t("terminal.tradeHistory")],
            ["alerts", `${t("terminal.alerts")}${alertsCount ? ` (${alertsCount})` : ""}`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={classNames(
              "btn-fx tap-sm border-b-2 px-3 py-1.5 text-2xs font-medium transition-colors",
              tab === id ? "border-accent text-txt-0" : "border-transparent text-txt-2 hover:text-txt-0"
            )}
          >
            {label}
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
