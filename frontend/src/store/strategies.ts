import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "../lib/api";
import type { Bot, BotDetail, CreateBotInput } from "../lib/types";

/**
 * Bots used to live here: a Zustand store persisted to localStorage, driven by
 * an interval in the page. That made this browser tab the bot's runtime — the
 * strategy only traded while it was open, a reload could silently re-arm it,
 * and two tabs would run the same bot twice.
 *
 * The engine now runs on the server (server/src/engine/strategy.ts), so this
 * file holds no bot state at all any more. It is a thin read/write layer over
 * /api/strategies: the server is the single source of truth for what a bot is,
 * whether it's running and what it currently holds, and every screen reads
 * that same truth.
 */

const BOTS_KEY = ["bots"] as const;

export function useBots(enabled = true) {
  return useQuery({
    queryKey: BOTS_KEY,
    queryFn: () => apiGet<{ bots: Bot[] }>("/api/strategies"),
    enabled,
    // Bots act on the server's own schedule, so what's shown here is a poll of
    // someone else's progress rather than a mirror of local state.
    refetchInterval: 4000,
  });
}

export function useBot(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ["bot", id],
    queryFn: () => apiGet<BotDetail>(`/api/strategies/${id}`),
    enabled: enabled && !!id,
    refetchInterval: 4000,
  });
}

/** Bot actions move real money, so they refresh the trading views too. */
function invalidateBotState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: BOTS_KEY });
  qc.invalidateQueries({ queryKey: ["bot"] });
  qc.invalidateQueries({ queryKey: ["orders"] });
  qc.invalidateQueries({ queryKey: ["positions"] });
  qc.invalidateQueries({ queryKey: ["account"] });
}

export function useCreateBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBotInput) => apiPost<{ bot: Bot }>("/api/strategies", input),
    onSuccess: () => invalidateBotState(qc),
  });
}

export function useStartBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<{ bot: Bot }>(`/api/strategies/${id}/start`),
    onSuccess: () => invalidateBotState(qc),
  });
}

export function useStopBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<{ bot: Bot }>(`/api/strategies/${id}/stop`),
    onSuccess: () => invalidateBotState(qc),
  });
}

export function useDeleteBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean; openPositions: number }>(`/api/strategies/${id}`),
    onSuccess: () => invalidateBotState(qc),
  });
}

/** Orders currently held by a grid bot — lets the shared Orders views tell a
 * bot's rungs apart from orders the trader placed by hand. */
export function useBotOrderIds(enabled = true): Set<string> {
  const { data } = useBots(enabled);
  return useMemo(() => {
    const ids = new Set<string>();
    for (const bot of data?.bots ?? []) {
      if (bot.type === "GRID") for (const rung of bot.state.gridOrders ?? []) ids.add(rung.orderId);
    }
    return ids;
  }, [data]);
}
