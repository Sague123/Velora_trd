import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPatch, apiPost } from "../lib/api";

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiPost<{ ok: boolean }>("/api/auth/change-password", input),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; dateOfBirth?: string | null; avatar?: string | null }) => apiPatch<{ ok: boolean }>("/api/auth/me", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

function invalidateWallet(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["account"] });
  qc.invalidateQueries({ queryKey: ["ledger"] });
}

export function useDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: string; note?: string }) => apiPost<{ balance: string }>("/api/account/deposit", input),
    onSuccess: () => invalidateWallet(qc),
  });
}

export function useWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: string; note?: string }) => apiPost<{ balance: string }>("/api/account/withdraw", input),
    onSuccess: () => invalidateWallet(qc),
  });
}

export function useTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { toEmail?: string; toAccountId?: string; amount: string; note?: string }) =>
      apiPost<{ balance: string }>("/api/account/transfer", input),
    onSuccess: () => invalidateWallet(qc),
  });
}
