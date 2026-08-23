import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import type {
  AdminStats, AdminUserDetail, AdminUsersResponse, AuditResponse, Role, UserStatus,
} from "../lib/types";

export function useAdminStats(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => apiGet<AdminStats>("/api/admin/stats"),
    enabled,
    refetchInterval: 10_000,
  });
}

export function useAdminUsers(params: { search: string; status: UserStatus | "ALL"; page: number; pageSize: number }, enabled: boolean) {
  const qs = new URLSearchParams({
    status: params.status, page: String(params.page), pageSize: String(params.pageSize),
    ...(params.search ? { search: params.search } : {}),
  });
  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: () => apiGet<AdminUsersResponse>(`/api/admin/users?${qs.toString()}`),
    enabled,
  });
}

export function useAdminUserDetail(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => apiGet<AdminUserDetail>(`/api/admin/users/${id}`),
    enabled: enabled && !!id,
    refetchInterval: 6000,
  });
}

export function useAdminAudit(params: { action: string; targetUserId: string; page: number; pageSize: number }, enabled: boolean) {
  const qs = new URLSearchParams({
    page: String(params.page), pageSize: String(params.pageSize),
    ...(params.action ? { action: params.action } : {}),
    ...(params.targetUserId ? { targetUserId: params.targetUserId } : {}),
  });
  return useQuery({
    queryKey: ["admin", "audit", params],
    queryFn: () => apiGet<AuditResponse>(`/api/admin/audit?${qs.toString()}`),
    enabled,
    refetchInterval: 15_000,
  });
}

export function useAdminUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name?: string; status?: UserStatus; role?: Role }) =>
      apiPatch(`/api/admin/users/${input.id}`, { name: input.name, status: input.status, role: input.role }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "user", vars.id] });
    },
  });
}

export function useAdminAdjustBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; amount: string; note?: string }) =>
      apiPost<{ balance: string }>(`/api/admin/users/${input.id}/balance`, { amount: input.amount, note: input.note }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "user", vars.id] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminResetPassword() {
  return useMutation({
    mutationFn: (input: { id: string; newPassword: string }) =>
      apiPost<{ ok: boolean }>(`/api/admin/users/${input.id}/reset-password`, { newPassword: input.newPassword }),
  });
}

export function useAdminClosePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; positionId: string }) =>
      apiPost<{ trade: import("../lib/types").Trade }>(`/api/admin/users/${input.userId}/positions/${input.positionId}/close`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "user", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; orderId: string }) =>
      apiDelete(`/api/admin/users/${input.userId}/orders/${input.orderId}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "user", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminUpdateInstrument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { symbol: string; active?: boolean; maxLeverage?: number }) =>
      apiPatch(`/api/admin/instruments/${input.symbol}`, { active: input.active, maxLeverage: input.maxLeverage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instruments"] }),
  });
}
