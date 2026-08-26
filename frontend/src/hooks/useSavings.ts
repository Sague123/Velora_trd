import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api";
import type { LedgerEntry, SavingsAccount, SavingsOverview } from "../lib/types";

export function useSavings(enabled = true) {
  return useQuery({
    queryKey: ["savings"],
    queryFn: () => apiGet<SavingsOverview>("/api/savings"),
    enabled,
    // Interest lands on the server's own daily schedule, so there is nothing
    // here worth polling faster than a page visit.
    refetchInterval: 30_000,
  });
}

export function useSavingsHistory(enabled = true) {
  return useQuery({
    queryKey: ["savings-history"],
    queryFn: () => apiGet<{ entries: LedgerEntry[] }>("/api/savings/history"),
    enabled,
    refetchInterval: 30_000,
  });
}

/** Savings moves the trading balance, so the account views refresh with it. */
function invalidateSavings(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["savings"] });
  qc.invalidateQueries({ queryKey: ["savings-history"] });
  qc.invalidateQueries({ queryKey: ["account"] });
  qc.invalidateQueries({ queryKey: ["ledger"] });
}

export function useOpenSavings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planType: string; amount: string }) =>
      apiPost<{ account: SavingsAccount }>("/api/savings/accounts", input),
    onSuccess: () => invalidateSavings(qc),
  });
}

export function useSavingsDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string }) =>
      apiPost<{ account: SavingsAccount }>(`/api/savings/accounts/${id}/deposit`, { amount }),
    onSuccess: () => invalidateSavings(qc),
  });
}

export function useSavingsWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    // No amount means "all of it", which is how an account is closed.
    mutationFn: ({ id, amount }: { id: string; amount?: string }) =>
      apiPost<{ account: SavingsAccount; closed: boolean }>(`/api/savings/accounts/${id}/withdraw`, { amount }),
    onSuccess: () => invalidateSavings(qc),
  });
}
