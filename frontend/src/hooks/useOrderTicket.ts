import { useEffect, useMemo, useRef } from "react";
import { useTerminalStore } from "../store/terminal";
import { useOrderTicketStore } from "../store/orderTicket";
import { useUserSettings } from "../store/userSettings";
import { useAuthStore } from "../store/auth";
import { useLiveInstrument } from "./useLivePrices";
import { useAccount, usePlaceOrder } from "./useTrading";
import { estFee, estLiquidationPrice, estMargin, estNotional } from "../lib/tradeMath";
import { fmtPrice, fmtQty, n } from "../lib/format";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";
import type { OrderSide } from "../lib/types";

/**
 * Everything derived from the order ticket: quantity, cost estimates, the
 * reasons an order can't go through, and submission itself.
 *
 * Split out of the form component because the ticket's fields and its
 * Buy/Sell buttons are no longer in the same place on mobile (see
 * store/orderTicket.ts). Both callers get identical validation and the same
 * two-press arming behaviour from here rather than each re-implementing it.
 */
/** Which saved defaults the ticket was last seeded from (see below). */
let seededKey: string | null = null;

export function useOrderTicket() {
  const symbol = useTerminalStore((s) => s.symbol);
  const inst = useLiveInstrument(symbol);
  const user = useAuthStore((s) => s.user);
  const { data: account } = useAccount(!!user);
  const place = usePlaceOrder();
  // Settings → Trading. Only pre-fills and guards the ticket; the engine
  // validates every order on its own terms regardless.
  const prefs = useUserSettings((s) => s.settings.trading);
  const prefsLoaded = useUserSettings((s) => s.loaded);
  const confirmOnOrder = prefs.confirmOrders;

  const side = useOrderTicketStore((s) => s.side);
  const type = useOrderTicketStore((s) => s.type);
  const amountMode = useOrderTicketStore((s) => s.amountMode);
  const amount = useOrderTicketStore((s) => s.amount);
  const price = useOrderTicketStore((s) => s.price);
  const leverage = useOrderTicketStore((s) => s.leverage);
  const useTpSl = useOrderTicketStore((s) => s.useTpSl);
  const tp = useOrderTicketStore((s) => s.tp);
  const sl = useOrderTicketStore((s) => s.sl);
  const armed = useOrderTicketStore((s) => s.armed);
  const setSide = useOrderTicketStore((s) => s.setSide);
  const setArmed = useOrderTicketStore((s) => s.setArmed);
  const setLeverage = useOrderTicketStore((s) => s.setLeverage);
  const clearAfterSubmit = useOrderTicketStore((s) => s.clearAfterSubmit);

  // Seed the ticket from the saved defaults — once per distinct set of
  // defaults, so it happens on arrival and again after they're changed in
  // Settings, but never over the top of what the trader is typing.
  useEffect(() => {
    if (!prefsLoaded) return;
    const key = JSON.stringify([prefs.orderType, prefs.amountMode, prefs.defaultAmount, prefs.leverage, prefs.stopLossPct, prefs.takeProfitPct]);
    if (seededKey === key) return;
    seededKey = key;
    const st = useOrderTicketStore.getState();
    st.setType(prefs.orderType);
    st.setAmountMode(prefs.amountMode);
    st.setLeverage(prefs.leverage);
    if (prefs.defaultAmount && !st.amount) st.setAmount(prefs.defaultAmount);
    if (prefs.stopLossPct || prefs.takeProfitPct) st.setUseTpSl(true);
  }, [prefsLoaded, prefs]);

  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  const baseAsset = inst?.symbol.replace(/(USDT|-PERP)$/, "") ?? "";
  const markPrice = n(inst?.livePrice);
  const effectivePrice = type === "MARKET" ? markPrice : n(price) || markPrice;

  // Clamp leverage whenever the instrument (and so its ceiling) changes. Set
  // only when it actually differs — this hook is mounted more than once at a
  // time on mobile, and an unconditional write would loop them against each
  // other through the shared store.
  useEffect(() => {
    if (!inst) return;
    const clamped = Math.min(Math.max(1, leverage), inst.maxLeverage);
    if (clamped !== leverage) setLeverage(clamped);
  }, [inst?.symbol, inst?.maxLeverage, leverage, setLeverage]);

  const qty = useMemo(() => {
    const a = n(amount);
    if (a <= 0 || effectivePrice <= 0) return 0;
    if (amountMode === "QUOTE") return a / effectivePrice;
    if (amountMode === "MARGIN") return (a * Math.max(1, leverage)) / effectivePrice;
    return a;
  }, [amount, amountMode, effectivePrice, leverage]);

  const estimate = useMemo(() => {
    const notional = estNotional(qty, effectivePrice);
    const margin = estMargin(notional, leverage);
    const fee = estFee(notional);
    // Side isn't chosen up front — Buy and Sell are both submit buttons — so
    // liquidation is estimated for each direction rather than one of them.
    const priced = qty > 0 && effectivePrice > 0;
    return {
      notional, margin, fee, total: margin + fee,
      liqLong: priced ? estLiquidationPrice("BUY", effectivePrice, leverage) : null,
      liqShort: priced ? estLiquidationPrice("SELL", effectivePrice, leverage) : null,
    };
  }, [qty, effectivePrice, leverage]);

  const availableCash = n(account?.cash);

  // Default TP/SL as a distance from the entry price. Direction isn't known
  // until Buy or Sell is pressed, so they are resolved at submit (and shown
  // to the trader as the fields' placeholders until then).
  const tpSlFromDefaults = (submitSide: OrderSide, entry: number) => {
    const dec = inst?.priceDecimals ?? 2;
    const at = (pct: number | null, sign: 1 | -1) =>
      pct && entry > 0 ? (entry * (1 + (sign * pct) / 100)).toFixed(dec) : undefined;
    const long = submitSide === "BUY";
    return { tp: at(prefs.takeProfitPct, long ? 1 : -1), sl: at(prefs.stopLossPct, long ? -1 : 1) };
  };

  // What the order would lose if its stop is hit, against the trader's own
  // per-trade limit. Advisory — it warns, it doesn't block.
  const risk = useMemo(() => {
    if (!prefs.riskPerTradePct || qty <= 0 || effectivePrice <= 0) return null;
    const slDistance = useTpSl && n(sl) > 0
      ? Math.abs(effectivePrice - n(sl))
      : prefs.stopLossPct && useTpSl ? (effectivePrice * prefs.stopLossPct) / 100 : null;
    if (slDistance === null) return null;
    const lossAtSl = qty * slDistance;
    const equity = n(account?.equity ?? account?.cash);
    const limit = (equity * prefs.riskPerTradePct) / 100;
    return { lossAtSl, limit, exceeded: equity > 0 && lossAtSl > limit, pctOfEquity: equity > 0 ? (lossAtSl / equity) * 100 : null };
  }, [prefs.riskPerTradePct, prefs.stopLossPct, qty, effectivePrice, useTpSl, sl, account?.equity, account?.cash]);
  const insufficientFunds = estimate.total > 0 && estimate.total > availableCash;
  const priceMissing = type !== "MARKET" && !price.trim();
  const qtyInvalid = qty <= 0;
  // The server halts a symbol whose quote has gone stale rather than filling
  // against a price the market left behind (see engine/execution.ts). Saying
  // so here beats letting the ticket look live and then rejecting the order.
  const halted = !!inst && inst.tradeable === false;
  const canSubmit = !!inst && !halted && !qtyInvalid && !priceMissing && !place.isPending && !insufficientFunds;

  async function submit(submitSide: OrderSide) {
    if (!inst) return;
    if (qtyInvalid) return toast.warning("Укажите сумму или количество");
    if (priceMissing) return toast.warning("Укажите цену для лимитного/стоп-ордера");

    const qtyStr = qty.toFixed(8).replace(/0+$/, "").replace(/\.$/, "") || "0";
    const defaults = tpSlFromDefaults(submitSide, effectivePrice);

    try {
      const res = await place.mutateAsync({
        symbol: inst.symbol,
        side: submitSide,
        type,
        qty: qtyStr,
        price: type === "MARKET" ? undefined : price.trim(),
        leverage,
        takeProfit: useTpSl ? tp.trim() || defaults.tp : undefined,
        stopLoss: useTpSl ? sl.trim() || defaults.sl : undefined,
      });
      toast.success(
        res.order.status === "FILLED" ? "Ордер исполнен" : "Ордер выставлен",
        `${inst.symbol} ${submitSide} ${fmtQty(qty)} ${type === "MARKET" ? "" : "@ " + fmtPrice(n(price), inst.priceDecimals)}`.trim()
      );
      clearAfterSubmit();
    } catch (e) {
      toast.error("Ордер отклонён", e instanceof ApiError ? e.message : "Неизвестная ошибка");
    }
  }

  /**
   * One press picks the direction, the next one sends it.
   *
   * `requireArm` is what the pinned mobile bar passes: there the first press
   * also scrolls the ticket into view, so sending on that same press would
   * fire an order at the moment the form appears — before the trader has
   * seen the amount, leverage or liquidation price they're committing to.
   * Desktop keeps its existing behaviour, where arming is the opt-in
   * "confirm orders" setting.
   */
  function handleSubmitClick(submitSide: OrderSide, requireArm = false) {
    if (qtyInvalid) return toast.warning("Укажите сумму или количество");
    if (priceMissing) return toast.warning("Укажите цену для лимитного/стоп-ордера");
    setSide(submitSide);
    if ((confirmOnOrder || requireArm) && armed !== submitSide) {
      setArmed(submitSide);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(null), 4000);
      return;
    }
    setArmed(null);
    if (armTimer.current) clearTimeout(armTimer.current);
    submit(submitSide);
  }

  return {
    inst, account, baseAsset, markPrice, effectivePrice, qty, estimate, availableCash,
    insufficientFunds, priceMissing, qtyInvalid, halted, canSubmit,
    risk, prefs,
    side, armed, isPending: place.isPending,
    handleSubmitClick,
  };
}
