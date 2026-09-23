import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAccount, useOrders, useTrades } from "./useTrading";
import { useUserSettings } from "../store/userSettings";
import { toast } from "../store/toast";
import { fmtPrice, fmtQty, fmtSigned, n } from "../lib/format";

/** Margin usage at or above this raises the in-app margin warning. */
const MARGIN_WARN_PCT = 80;

/**
 * Settings → Notifications → In-app, for trading events.
 *
 * Only what happens *without* the trader pressing a button: a resting
 * limit/stop order filling, TP/SL or a liquidation closing a position, and
 * margin usage crossing into the warning zone. (A market order placed from
 * the ticket already confirms itself.) Events from before this session are
 * never replayed — the baseline is taken from the first response.
 */
export function useInAppNotices(enabled: boolean) {
  const { t } = useTranslation();
  const prefs = useUserSettings((s) => s.settings.notifications);
  const wantFills = enabled && prefs.orderFilled.inApp;
  const wantCloses = enabled && (prefs.slTpTriggered.inApp || prefs.marginWarning.inApp);
  const wantMargin = enabled && prefs.marginWarning.inApp;

  const filled = useOrders("FILLED", wantFills);
  const trades = useTrades(wantCloses);
  const account = useAccount(wantMargin);

  const seenOrders = useRef<Set<string> | null>(null);
  const seenTrades = useRef<Set<string> | null>(null);
  const marginHigh = useRef<boolean | null>(null);

  useEffect(() => {
    const orders = filled.data?.orders;
    if (!orders) return;
    if (!seenOrders.current) {
      seenOrders.current = new Set(orders.map((o) => o.id));
      return;
    }
    for (const o of orders) {
      if (seenOrders.current.has(o.id)) continue;
      seenOrders.current.add(o.id);
      if (o.type === "MARKET") continue;
      toast.success(t("notices.orderFilled"), `${o.symbol} ${o.side} ${fmtQty(o.qty)} @ ${fmtPrice(n(o.filledPrice ?? o.price), 4)}`);
    }
  }, [filled.data, t]);

  useEffect(() => {
    const list = trades.data?.trades;
    if (!list) return;
    if (!seenTrades.current) {
      seenTrades.current = new Set(list.map((tr) => tr.id));
      return;
    }
    for (const tr of list) {
      if (seenTrades.current.has(tr.id)) continue;
      seenTrades.current.add(tr.id);
      const detail = `${tr.symbol} @ ${fmtPrice(n(tr.exitPrice), 4)} · ${fmtSigned(tr.pnl)}`;
      if ((tr.closeReason === "TAKE_PROFIT" || tr.closeReason === "STOP_LOSS") && prefs.slTpTriggered.inApp) {
        const title = tr.closeReason === "TAKE_PROFIT" ? t("notices.takeProfit") : t("notices.stopLoss");
        (n(tr.pnl) >= 0 ? toast.success : toast.error)(title, detail);
      } else if (tr.closeReason === "LIQUIDATION" && prefs.marginWarning.inApp) {
        toast.error(t("notices.liquidated"), detail);
      }
    }
  }, [trades.data, prefs.slTpTriggered.inApp, prefs.marginWarning.inApp, t]);

  useEffect(() => {
    const pct = account.data?.marginUsagePct;
    if (pct === undefined) return;
    const high = pct >= MARGIN_WARN_PCT;
    // Warn on the way up, once per crossing — not on every poll while high,
    // and not for a level the account was already at when the page opened.
    if (marginHigh.current === false && high) {
      toast.warning(t("notices.marginWarning"), t("notices.marginWarningBody", { pct: pct.toFixed(0) }));
    }
    marginHigh.current = high;
  }, [account.data?.marginUsagePct, t]);
}
