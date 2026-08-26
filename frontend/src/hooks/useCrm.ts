import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import type {
  CrmMeta, ImportLeadInput, LeadComment, LeadDetail, LeadHistoryEntry,
  LeadStatus, LeadVerificationStatus, LeadsResponse,
} from "../lib/types";

export interface LeadFilters {
  status: LeadStatus | "";
  managerId: string;
  search: string;
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
  const qs = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize) });
  if (filters.status) qs.set("status", filters.status);
  if (filters.managerId) qs.set("managerId", filters.managerId);
  if (filters.search.trim()) qs.set("search", filters.search.trim());

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

export function useLeadComments(id: string | null) {
  return useQuery({
    queryKey: ["crm", "comments", id],
    queryFn: () => apiGet<{ comments: LeadComment[] }>(`/api/crm/leads/${id}/comments`),
    enabled: !!id,
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
