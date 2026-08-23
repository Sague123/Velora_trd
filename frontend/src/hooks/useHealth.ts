import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";

interface HealthResponse {
  status: string;
  env: string;
  feed: { healthy: boolean; lastFetch: string | null };
  time: string;
}

export function useServerHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthResponse>("/api/health"),
    refetchInterval: 15_000,
    retry: 0,
  });
}
