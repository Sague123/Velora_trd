import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api";
import type { KycState, KycSubmission, KycSubmitInput } from "../lib/types";

export function useKyc(enabled = true) {
  return useQuery({
    queryKey: ["kyc"],
    queryFn: () => apiGet<KycState>("/api/kyc"),
    enabled,
  });
}

export function useSubmitKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: KycSubmitInput) => apiPost<{ submission: KycSubmission }>("/api/kyc", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kyc"] });
      // Approval status rides on the user object too, so /me has to catch up.
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
