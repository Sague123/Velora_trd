import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import type {
  Account, Alert, AlertDirection, LedgerEntry, Order, OrderSide, OrderStatus, OrderType, Position, Trade,
} from "../lib/types";

// Account/positions/orders carry PnL, margin and liquidation numbers that
// move with the market — polled at least every 2s (matching the order
// book's cadence) so they don't visibly lag behind the live price ticks
// merged in elsewhere and make the platform feel stale.
export function useAccount(enabled: boolean) {
  return useQuery({
    queryKey: ["account"],
    queryFn: () => apiGet<Account>("/api/account"),
    enabled,
    refetchInterval: 2000,
  });
}

export function usePositions(enabled: boolean) {
  return useQuery({
    queryKey: ["positions"],
    queryFn: () => apiGet<{ positions: Position[] }>("/api/positions"),
    enabled,
    refetchInterval: 2000,
  });
}

export function useOrders(status: OrderStatus | "ALL", enabled: boolean) {
  return useQuery({
    queryKey: ["orders", status],
    queryFn: () => apiGet<{ orders: Order[] }>(`/api/orders?status=${status}`),
    enabled,
    refetchInterval: 2000,
  });
}

export function useTrades(enabled: boolean) {
  return useQuery({
    queryKey: ["trades"],
    queryFn: () => apiGet<{ trades: Trade[] }>("/api/trades"),
    enabled,
    refetchInterval: 3000,
  });
}

export function useLedger(enabled: boolean) {
  return useQuery({
    queryKey: ["ledger"],
    queryFn: () => apiGet<{ entries: LedgerEntry[] }>("/api/ledger"),
    enabled,
    refetchInterval: 3000,
  });
}

export function useAlerts(enabled: boolean) {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiGet<{ alerts: Alert[] }>("/api/alerts"),
    enabled,
    refetchInterval: 3000,
  });
}

export interface PlaceOrderInput {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: string;
  price?: string;
  leverage: number;
  takeProfit?: string;
  stopLoss?: string;
}

function invalidateTradingState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["account"] });
  qc.invalidateQueries({ queryKey: ["positions"] });
  qc.invalidateQueries({ queryKey: ["orders"] });
  qc.invalidateQueries({ queryKey: ["trades"] });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceOrderInput) =>
      apiPost<{ order: Order; position: Position | null }>("/api/orders", input),
    onSuccess: () => invalidateTradingState(qc),
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ order: Order }>(`/api/orders/${id}`),
    onSuccess: () => invalidateTradingState(qc),
  });
}

export function useClosePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<{ trade: Trade }>(`/api/positions/${id}/close`),
    onSuccess: () => invalidateTradingState(qc),
  });
}

export function useUpdatePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; takeProfit?: string | null; stopLoss?: string | null; leverage?: number }) =>
      apiPatch<{ position: Position }>(`/api/positions/${input.id}`, {
        takeProfit: input.takeProfit,
        stopLoss: input.stopLoss,
        leverage: input.leverage,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["account"] });
    },
  });
}

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { symbol: string; direction: AlertDirection; price: string }) =>
      apiPost<{ id: string }>("/api/alerts", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/api/alerts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}
