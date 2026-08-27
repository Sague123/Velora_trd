import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import type {
  ConvertLeadResponse, CrmAccountSnapshot, CrmMeta, CrmPermission, CrmViewSnapshot,
  CrmViewTokenResponse, EditLeadInput, ImportLeadInput, LeadComment, LeadCommentsResponse,
  LeadDetail, LeadHistoryEntry, LeadStatus, LeadVerificationStatus, LeadsResponse, Order, Trade,
} from "../lib/types";

export type LeadSortColumn =
  | "accountNumber" | "fullName" | "phone" | "email" | "status"
  | "verificationStatus" | "country" | "manager" | "createdAt";

export interface LeadFilters {
  status: LeadStatus | "";
  managerId: string;
  kycStatus: "" | "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  search: string;
  // Per-column filters — ANDed with `search` and with each other, so a
  // manager can narrow by exactly one field instead of only the broad OR
  // match `search` does across name/phone/email.
  fullName: string;
  phone: string;
  email: string;
  country: string;
  accountNumber: string;
  sortBy: LeadSortColumn;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

/** The status lists come from the server rather than a copy here, so adding a
 * funnel stage does not need a matching frontend release. */
export function useCrmMeta(enabled = true) {
  return useQuery({
    queryKey: ["crm", "meta"],
    queryFn: () => apiGet<CrmMeta>("/api/crm/meta"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useLeads(filters: LeadFilters, enabled = true) {
  const qs = new URLSearchParams({
    page: String(filters.page), pageSize: String(filters.pageSize),
    sortBy: filters.sortBy, sortDir: filters.sortDir,
  });
  if (filters.status) qs.set("status", filters.status);
  if (filters.managerId) qs.set("managerId", filters.managerId);
  if (filters.kycStatus) qs.set("kycStatus", filters.kycStatus);
  if (filters.search.trim()) qs.set("search", filters.search.trim());
  if (filters.fullName.trim()) qs.set("fullName", filters.fullName.trim());
  if (filters.phone.trim()) qs.set("phone", filters.phone.trim());
  if (filters.email.trim()) qs.set("email", filters.email.trim());
  if (filters.country.trim()) qs.set("country", filters.country.trim());
  if (filters.accountNumber.trim()) qs.set("accountNumber", filters.accountNumber.trim());

  return useQuery({
    queryKey: ["crm", "leads", filters],
    queryFn: () => apiGet<LeadsResponse>(`/api/crm/leads?${qs.toString()}`),
    enabled,
    // Several managers work the same board; a stale list means two people
    // calling the same lead.
    refetchInterval: 20_000,
  });
}

export function useLead(id: string | null) {
  return useQuery({
    queryKey: ["crm", "lead", id],
    queryFn: () => apiGet<{ lead: LeadDetail; history: LeadHistoryEntry[] }>(`/api/crm/leads/${id}`),
    enabled: !!id,
  });
}

/** Comments have their own page rather than an inline, ever-growing list — see
 * components/crm/CommentsPanel.tsx. */
export function useLeadComments(id: string | null, page: number, pageSize = 10) {
  return useQuery({
    queryKey: ["crm", "comments", id, page, pageSize],
    queryFn: () => apiGet<LeadCommentsResponse>(`/api/crm/leads/${id}/comments?page=${page}&pageSize=${pageSize}`),
    enabled: !!id,
  });
}

/** Read-only: the account snapshot behind a lead's converted platform user.
 * Any manager can look (the card already shows a balance figure to all of
 * them); only the mutations below are permission-gated. */
export function useLeadAccount(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["crm", "account", id],
    queryFn: () => apiGet<CrmAccountSnapshot>(`/api/crm/leads/${id}/account`),
    enabled: enabled && !!id,
    refetchInterval: 5000,
  });
}

function invalidateCrm(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["crm"] });
}

export function useSetLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      apiPatch<{ lead: LeadDetail }>(`/api/crm/leads/${id}/status`, { status }),
    onSuccess: () => invalidateCrm(qc),
  });
}

export function useSetLeadVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verificationStatus }: { id: string; verificationStatus: LeadVerificationStatus }) =>
      apiPatch<{ lead: LeadDetail }>(`/api/crm/leads/${id}/verification`, { verificationStatus }),
    onSuccess: () => invalidateCrm(qc),
  });
}

export function useAssignLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      apiPatch<{ lead: LeadDetail }>(`/api/crm/leads/${id}/assign`, { managerId }),
    onSuccess: () => invalidateCrm(qc),
  });
}

export function useAddLeadComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      apiPost<{ comment: LeadComment }>(`/api/crm/leads/${id}/comments`, { text }),
    onSuccess: () => invalidateCrm(qc),
  });
}

export function useImportLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportLeadInput) => apiPost<{ lead: LeadDetail }>("/api/crm/leads/import", input),
    onSuccess: () => invalidateCrm(qc),
  });
}

export function useEditLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EditLeadInput }) =>
      apiPatch<{ lead: LeadDetail }>(`/api/crm/leads/${id}`, input),
    onSuccess: () => invalidateCrm(qc),
  });
}

/** Converts a lead into a real platform account. The response's
 * `temporaryPassword` is the only time the server ever hands it back — the
 * caller must show it once and never fetch it again, because there is nowhere
 * to fetch it *from*. */
export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<ConvertLeadResponse>(`/api/crm/leads/${id}/convert`),
    onSuccess: () => invalidateCrm(qc),
  });
}

function invalidateLeadAccount(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: ["crm", "account", id] });
  qc.invalidateQueries({ queryKey: ["crm", "lead", id] });
}

export function useAdjustLeadBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount: string; note?: string }) =>
      apiPost<{ balance: string }>(`/api/crm/leads/${id}/account/balance`, { amount, note }),
    onSuccess: (_data, vars) => invalidateLeadAccount(qc, vars.id),
  });
}

export function useSetLeadAccountStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "SUSPENDED" }) =>
      apiPatch<{ status: string }>(`/api/crm/leads/${id}/account/status`, { status }),
    onSuccess: (_data, vars) => invalidateLeadAccount(qc, vars.id),
  });
}

export function useCloseLeadPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, positionId }: { id: string; positionId: string }) =>
      apiPost<{ trade: Trade }>(`/api/crm/leads/${id}/trades/positions/${positionId}/close`),
    onSuccess: (_data, vars) => invalidateLeadAccount(qc, vars.id),
  });
}

export function useCancelLeadOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, orderId }: { id: string; orderId: string }) =>
      apiDelete<{ order: Order }>(`/api/crm/leads/${id}/trades/orders/${orderId}`),
    onSuccess: (_data, vars) => invalidateLeadAccount(qc, vars.id),
  });
}

/** Mints a one-time support link — see components/crm/ViewTokenButton.tsx.
 * Not cached: every call must mint a fresh token, never replay one from the
 * query cache. */
export function useIssueViewToken() {
  return useMutation({
    mutationFn: (id: string) => apiPost<CrmViewTokenResponse>(`/api/crm/leads/${id}/view-token`),
  });
}

/** Consumes a support link. Lives outside `/api/crm` (see
 * server/src/routes/crmView.ts) — no manager session is expected here, only
 * the token itself. */
export function useConsumeViewToken() {
  return useMutation({
    mutationFn: (token: string) => apiPost<CrmViewSnapshot>("/api/crm-view", { token }),
  });
}

/** Grants or revokes a manager's CRM permissions. Admin-only on the server;
 * exposed here for the admin console's user-detail view. */
export function useSetCrmPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, permissions }: { userId: string; permissions: CrmPermission[] }) =>
      apiPatch<{ crmPermissions: CrmPermission[] }>(`/api/admin/users/${userId}/crm-permissions`, { permissions }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
}
