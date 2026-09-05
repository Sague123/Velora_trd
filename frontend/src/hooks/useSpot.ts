import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api";
import type {
  SpotAsset, SpotExchangeResult, SpotLedgerEntry, SpotQuote, SpotWallet,
} from "../lib/types";

/**
 * The spot wallet: what the trader owns outright, as opposed to the futures
 * wallet's collateral. Read here, moved through the mutations below.
 *
 * Every mutation invalidates `account` alongside the wallet itself, because
 * each of them changes at least one of the two figures the Account screen
 * leads with — total balance and what's available to withdraw — and those are
 * computed server-side from both wallets at once.
 */

const WALLET_KEY = ["spot", "wallet"] as const;

export function useSpotWallet(enabled = true) {
  return useQuery({
    queryKey: WALLET_KEY,
    queryFn: () => apiGet<SpotWallet>("/api/spot/wallet"),
    enabled,
    // Holdings are valued at the live mark, so this moves with the market the
    // same way the account summary next to it does.
    refetchInterval: 4000,
  });
}

export function useSpotAssets(enabled = true) {
  return useQuery({
    queryKey: ["spot", "assets"],
    queryFn: () => apiGet<{ quoteAsset: string; assets: SpotAsset[] }>("/api/spot/assets"),
    enabled,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function useSpotLedger(enabled = true) {
  return useQuery({
    queryKey: ["spot", "ledger"],
    queryFn: () => apiGet<{ entries: SpotLedgerEntry[] }>("/api/spot/ledger"),
    enabled,
    refetchInterval: 10_000,
  });
}

/**
 * What an exchange would return, before committing to it. Only asks once the
 * form holds a usable amount — a quote for an empty box is a request the
 * server would refuse anyway, and the error would flash under the field the
 * moment someone started typing.
 */
export function useSpotQuote(fromAsset: string, toAsset: string, amount: string) {
  const enabled = !!fromAsset && !!toAsset && fromAsset !== toAsset && Number(amount) > 0;
  return useQuery({
    queryKey: ["spot", "quote", fromAsset, toAsset, amount],
    queryFn: () => apiGet<SpotQuote>(
      `/api/spot/quote?fromAsset=${fromAsset}&toAsset=${toAsset}&amount=${encodeURIComponent(amount)}`
    ),
    enabled,
    // Prices move; a quote older than a few seconds is worse than no quote.
    refetchInterval: 5000,
    staleTime: 2000,
    retry: false,
  });
}

function useSpotMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spot"] });
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
    },
  });
}

export function useSpotTrade() {
  return useSpotMutation((input: { asset: string; side: "BUY" | "SELL"; amount: string }) =>
    apiPost<{ trade: SpotExchangeResult; wallet: SpotWallet }>("/api/spot/trade", input));
}

export function useSpotConvert() {
  return useSpotMutation((input: { fromAsset: string; toAsset: string; amount: string }) =>
    apiPost<{ conversion: SpotExchangeResult; wallet: SpotWallet }>("/api/spot/convert", input));
}

export function useSpotTransfer() {
  return useSpotMutation((input: { direction: "TO_FUTURES" | "TO_SPOT"; amount: string }) =>
    apiPost<{ wallet: SpotWallet }>("/api/spot/transfer", input));
}
