import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTerminalStore } from "../../store/terminal";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { useAccount, usePlaceOrder } from "../../hooks/useTrading";
import { useAuthStore } from "../../store/auth";
import { useSettingsStore } from "../../store/settings";
import { classNames, fmtPrice, fmtQty, fmtUsd, n } from "../../lib/format";
import { estFee, estLiquidationPrice, estMargin, estNotional, MAINTENANCE_MARGIN_RATIO } from "../../lib/tradeMath";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { Tooltip } from "../common/Tooltip";
import { Popover } from "../common/Popover";
import { mobileCtrlCls, mobileCtrlTone } from "./ChartToolbar";
import { IconChevron } from "../icons/Icon";
import type { OrderSide, OrderType } from "../../lib/types";

const TYPES: OrderType[] = ["MARKET", "LIMIT", "STOP"];
// BASE: amount = qty of the base asset. QUOTE: amount = total position
// notional (qty*price), the way spot order forms on real exchanges size a
// "Total" input. MARGIN: amount = the trader's own capital committed —
// qty = (amount * leverage) / price — matching how Binance/Bybit futures
// order forms size their "Cost"/"Margin" input, i.e. leverage scales the
// position up from what you actually put down rather than being applied
// after the fact to a fixed notional.
type AmountMode = "BASE" | "QUOTE" | "MARGIN";

export function OrderEntry({ compact = false }: { compact?: boolean } = {}) {
  const { t } = useTranslation();
  const symbol = useTerminalStore((s) => s.symbol);
  const inst = useLiveInstrument(symbol);
  const user = useAuthStore((s) => s.user);
  const { data: account } = useAccount(!!user);
  const place = usePlaceOrder();
  const defaultLeverage = useSettingsStore((s) => s.defaultLeverage);
  const defaultAmountMode = useSettingsStore((s) => s.defaultAmountMode);
  const confirmOnOrder = useSettingsStore((s) => s.confirmOnOrder);

  const [side, setSide] = useState<OrderSide>("BUY");
  const [type, setType] = useState<OrderType>("MARKET");
  const [amountMode, setAmountMode] = useState<AmountMode>(defaultAmountMode);
  const [amount, setAmount] = useState(""); // meaning depends on amountMode
  const [price, setPrice] = useState("");
  const [leverage, setLeverage] = useState(defaultLeverage);
  const [useTpSl, setUseTpSl] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [armed, setArmed] = useState<OrderSide | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseAsset = inst?.symbol.replace(/(USDT|-PERP)$/, "") ?? "";

  // clamp leverage whenever the instrument (and thus its max leverage) changes
  useEffect(() => {
    if (!inst) return;
    setLeverage((l) => Math.min(Math.max(1, l), inst.maxLeverage));
  }, [inst?.symbol, inst?.maxLeverage]);

  const markPrice = n(inst?.livePrice);
  const effectivePrice = type === "MARKET" ? markPrice : n(price) || markPrice;

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
    // Side is no longer chosen up-front — Buy and Sell are both submit
    // buttons now — so the liquidation estimate is shown for each direction
    // rather than for one pre-selected side.
    const priced = qty > 0 && effectivePrice > 0;
    return {
      notional, margin, fee, total: margin + fee,
      liqLong: priced ? estLiquidationPrice("BUY", effectivePrice, leverage) : null,
      liqShort: priced ? estLiquidationPrice("SELL", effectivePrice, leverage) : null,
    };
  }, [qty, effectivePrice, leverage]);

  const availableCash = n(account?.cash);
  const insufficientFunds = estimate.total > 0 && estimate.total > availableCash;
  const priceMissing = type !== "MARKET" && !price.trim();
  const qtyInvalid = qty <= 0;
  // The server halts a symbol whose quote has gone stale rather than filling
  // against a price the market left behind (see engine/execution.ts). Saying so
  // here beats letting the ticket look live and then rejecting the order.
  const halted = !!inst && inst.tradeable === false;
  const canSubmit = !!inst && !halted && !qtyInvalid && !priceMissing && !place.isPending && !insufficientFunds;

  function handleSubmitClick(submitSide: OrderSide) {
    if (qtyInvalid) return toast.warning("Укажите сумму или количество");
    if (priceMissing) return toast.warning("Укажите цену для лимитного/стоп-ордера");
    // There is no separate side selector any more, so the pressed button is
    // what defines the direction — record it so the pending/armed state
    // renders on the right button.
    setSide(submitSide);
    if (confirmOnOrder && armed !== submitSide) {
      setArmed(submitSide);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(null), 4000);
      return;
    }
    setArmed(null);
    if (armTimer.current) clearTimeout(armTimer.current);
    submit(submitSide);
  }

  async function submit(submitSide: OrderSide) {
    if (!inst) return;
    if (qtyInvalid) return toast.warning("Укажите сумму или количество");
    if (priceMissing) return toast.warning("Укажите цену для лимитного/стоп-ордера");

    const qtyStr = qty.toFixed(8).replace(/0+$/, "").replace(/\.$/, "") || "0";

    try {
      const res = await place.mutateAsync({
        symbol: inst.symbol,
        side: submitSide,
        type,
        qty: qtyStr,
        price: type === "MARKET" ? undefined : price.trim(),
        leverage,
        takeProfit: useTpSl && tp.trim() ? tp.trim() : undefined,
        stopLoss: useTpSl && sl.trim() ? sl.trim() : undefined,
      });
      toast.success(
        res.order.status === "FILLED" ? "Ордер исполнен" : "Ордер выставлен",
        `${inst.symbol} ${submitSide} ${fmtQty(qty)} ${type === "MARKET" ? "" : "@ " + price}`.trim()
      );
      setAmount("");
      if (type !== "MARKET") setPrice("");
      setTp("");
      setSl("");
    } catch (e) {
      toast.error("Ордер отклонён", e instanceof ApiError ? e.message : "Неизвестная ошибка");
    }
  }

  return (
    // The root no longer scrolls; only the field area between the side
    // selector and the pinned submit bar does. That keeps the Buy/Sell button
    // on screen at all times — on a phone it used to sit below the fold, so
    // placing an order meant scrolling the form first.
    <div className={classNames("flex h-full flex-col overflow-hidden bg-bg-1", compact && "text-2xs")}>
      {/* Desktop keeps its own dedicated row (untouched). Compact drops it
          entirely — the same three buttons move inline next to the Amount
          input further down, so a standing header row doesn't cost a whole
          line of its own on a phone. */}
      {!compact && (
        <div className="flex shrink-0 gap-0.5 border-b border-line p-1">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={classNames(
                "btn-fx flex-1 rounded px-2 py-1.5 text-2xs font-medium transition-colors",
                type === t ? "bg-bg-3 text-txt-0" : "text-txt-2 hover:text-txt-0"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className={classNames("min-h-0 flex-1 overflow-y-auto px-2.5 pb-2", compact ? "space-y-1.5" : "space-y-3")}>
        {type !== "MARKET" && (
          <label className="block">
            <span className="mb-1 flex justify-between text-2xs text-txt-2">
              <span>{t("terminal.price")}</span>
              <button type="button" onClick={() => setPrice(String(markPrice))} className="text-accent hover:underline">
                mark {fmtPrice(inst?.livePrice, inst?.priceDecimals ?? 2)}
              </button>
            </span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded border border-line bg-bg-2 px-2 py-1.5 text-xs tabular outline-none focus:border-accent"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 flex items-center justify-between text-2xs text-txt-2">
            <span>{t("terminal.amount")}</span>
            <div className="flex gap-0.5 rounded border border-line p-0.5">
              <button
                type="button"
                onClick={() => setAmountMode("BASE")}
                className={classNames("rounded px-1.5 py-0.5 text-2xs font-medium", amountMode === "BASE" ? "bg-accent-soft text-accent" : "text-txt-2")}
              >
                {baseAsset || t("terminal.base")}
              </button>
              <button
                type="button"
                onClick={() => setAmountMode("QUOTE")}
                className={classNames("rounded px-1.5 py-0.5 text-2xs font-medium", amountMode === "QUOTE" ? "bg-accent-soft text-accent" : "text-txt-2")}
              >
                {t("terminal.total")}
              </button>
              <Tooltip label="Сумма — это ваш собственный капитал (маржа), которым вы рискуете; размер позиции = маржа × плечо, как в форме ордера на Binance/Bybit Futures">
                <button
                  type="button"
                  onClick={() => setAmountMode("MARGIN")}
                  className={classNames("cursor-help rounded px-1.5 py-0.5 text-2xs font-medium underline decoration-dotted", amountMode === "MARGIN" ? "bg-accent-soft text-accent" : "text-txt-2")}
                >
                  {t("terminal.margin")}
                </button>
              </Tooltip>
            </div>
          </span>
          {/* Compact: the order-type buttons live right here instead of a
              row of their own above — same idea as before (two controls
              sharing one row instead of two full-width stacked blocks), just
              swapped for what actually needed the space back: TP/SL moved to
              its own block below, tight around just the toggle. */}
          <div className="flex items-stretch gap-1.5">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={amountMode === "BASE" ? "0.00" : "$ 0.00"}
              className="min-w-0 flex-1 rounded border border-line bg-bg-2 px-2 py-1.5 text-xs tabular outline-none focus:border-accent"
            />
            {compact ? (
              <div className="flex shrink-0 gap-0.5 rounded-lg border border-line bg-bg-2 p-0.5">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={classNames(
                      "rounded px-1.5 py-1 text-[10px] font-semibold transition-colors",
                      type === t ? "bg-accent-fill text-white" : "text-txt-2"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setUseTpSl((v) => !v)}
                aria-pressed={useTpSl}
                title="Take Profit / Stop Loss"
                className={classNames(
                  "btn-fx flex shrink-0 items-center gap-1.5 rounded border px-2 transition-colors",
                  useTpSl ? "border-accent/50 bg-accent-soft" : "border-line bg-bg-2"
                )}
              >
                <span className={classNames("text-2xs font-semibold", useTpSl ? "text-accent" : "text-txt-2")}>TP/SL</span>
                <span
                  className={classNames(
                    "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200",
                    useTpSl ? "bg-gradient-to-r from-buy to-sell" : "bg-bg-4"
                  )}
                >
                  <span
                    className={classNames(
                      "inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform duration-200",
                      useTpSl ? "translate-x-[14px]" : "translate-x-0.5"
                    )}
                  />
                </span>
              </button>
            )}
          </div>
          {!compact && (
            <div className="mt-1 text-2xs text-txt-3">
              {amountMode === "BASE" && qty > 0 && `≈ ${fmtUsd(estNotional(qty, effectivePrice))} total · ${fmtUsd(estMargin(estNotional(qty, effectivePrice), leverage))} margin`}
              {amountMode === "QUOTE" && qty > 0 && `≈ ${fmtQty(qty)} ${baseAsset} · ${fmtUsd(estMargin(estNotional(qty, effectivePrice), leverage))} margin`}
              {amountMode === "MARGIN" && qty > 0 && `≈ ${fmtQty(qty)} ${baseAsset} · ${fmtUsd(estNotional(qty, effectivePrice))} total`}
            </div>
          )}
        </label>

        {/* Compact only: TP/SL as its own tight block — a toggle row, and
            when on, the two price inputs directly beneath it. Desktop keeps
            the toggle beside Amount and this same collapsible panel below
            (unchanged, see the block after Leverage). */}
        {compact && (
          <div>
            <button
              type="button"
              onClick={() => setUseTpSl((v) => !v)}
              aria-pressed={useTpSl}
              className="flex w-full items-center justify-between"
            >
              <span className={classNames("text-2xs font-semibold", useTpSl ? "text-accent" : "text-txt-2")}>TP/SL</span>
              <span
                className={classNames(
                  "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200",
                  useTpSl ? "bg-gradient-to-r from-buy to-sell" : "bg-bg-4"
                )}
              >
                <span
                  className={classNames(
                    "inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform duration-200",
                    useTpSl ? "translate-x-[14px]" : "translate-x-0.5"
                  )}
                />
              </span>
            </button>
            {useTpSl && (
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <input
                  value={tp}
                  onChange={(e) => setTp(e.target.value)}
                  inputMode="decimal"
                  placeholder="TP price"
                  className="w-full rounded border border-line bg-bg-2 px-1.5 py-1 text-2xs tabular text-buy outline-none focus:border-buy"
                />
                <input
                  value={sl}
                  onChange={(e) => setSl(e.target.value)}
                  inputMode="decimal"
                  placeholder="SL price"
                  className="w-full rounded border border-line bg-bg-2 px-1.5 py-1 text-2xs tabular text-sell outline-none focus:border-sell"
                />
              </div>
            )}
          </div>
        )}

        <label className="block">
          <span className="mb-1 flex justify-between text-2xs text-txt-2">
            <span>{t("terminal.leverage")}</span>
            <span className="tabular text-txt-0">{leverage}x</span>
          </span>
          <input
            type="range"
            min={1}
            max={inst?.maxLeverage ?? 1}
            step={1}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full accent-accent"
            disabled={!inst || inst.maxLeverage <= 1}
          />
          {/* Min/max labels dropped in compact mode — the current value is
              already the number right next to "Плечо" above, and the range
              endpoints are what the slider's own two ends already show; on a
              phone that redundant row was one of a handful of small costs
              that added up to needing a scroll to see the whole form. */}
          {!compact && (
            <div className="mt-0.5 flex justify-between text-2xs text-txt-3">
              <span>1x</span>
              <span>{inst?.maxLeverage ?? 1}x</span>
            </div>
          )}
        </label>

        {/* Desktop only — compact has its own tight TP/SL block right under
            Amount instead (see above): a toggle plus, directly beneath it,
            just the two inputs, not this bordered panel. */}
        {!compact && (
          <div className={classNames("transition-colors", useTpSl && "rounded-lg border border-line-soft bg-bg-2/40 p-2.5")}>
            <div className={classNames("grid transition-[grid-template-rows] duration-300 ease-out", useTpSl ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="overflow-hidden">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="mb-1 block text-2xs font-medium text-buy">{t("terminal.takeProfit")}</span>
                    <input
                      value={tp}
                      onChange={(e) => setTp(e.target.value)}
                      inputMode="decimal"
                      placeholder="price"
                      tabIndex={useTpSl ? 0 : -1}
                      className="w-full rounded border border-line bg-bg-3 px-1.5 py-1.5 text-2xs tabular outline-none focus:border-buy"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-2xs font-medium text-sell">{t("terminal.stopLoss")}</span>
                    <input
                      value={sl}
                      onChange={(e) => setSl(e.target.value)}
                      inputMode="decimal"
                      placeholder="price"
                      tabIndex={useTpSl ? 0 : -1}
                      className="w-full rounded border border-line bg-bg-3 px-1.5 py-1.5 text-2xs tabular outline-none focus:border-sell"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {compact ? (
          // Packed rather than sparse: with the extra room this layout
          // freed up, an empty gap below the fields would just be wasted —
          // so this now also states the entry price and position size, not
          // only the two numbers (Total/Available) it used to.
          <div className="rounded-lg border border-line-soft bg-bg-2/40 px-2 py-1 tabular text-2xs">
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <div className="flex justify-between">
                <span className="text-txt-2">{t("terminal.price")}</span>
                <span className="text-txt-1">{effectivePrice > 0 ? fmtPrice(effectivePrice, inst?.priceDecimals ?? 2) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-2">{t("terminal.qty")}</span>
                <span className="text-txt-1">{qty > 0 ? `${fmtQty(qty)} ${baseAsset}` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-2">{t("terminal.total")}</span>
                <span className={classNames("font-medium", insufficientFunds ? "text-sell" : "text-txt-0")}>{fmtUsd(estimate.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-2">{t("terminal.available")}</span>
                <span className="text-txt-1">{fmtUsd(account?.cash ?? 0)}</span>
              </div>
            </div>
            {estimate.liqLong !== null && estimate.liqShort !== null && (
              <div className="mt-0.5 flex justify-between border-t border-line-soft pt-0.5 text-txt-2">
                <span>{t("terminal.estLiqPrice")}</span>
                <span>
                  <span className="text-buy">{fmtPrice(estimate.liqLong, inst?.priceDecimals ?? 2)}</span>
                  <span className="mx-1 text-txt-3">/</span>
                  <span className="text-sell">{fmtPrice(estimate.liqShort, inst?.priceDecimals ?? 2)}</span>
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1 rounded border border-line-soft bg-bg-2/40 p-2 tabular text-2xs">
            <div className="flex justify-between text-txt-2">
              <span>{t("terminal.estNotional")}</span>
              <span className="text-txt-1">{fmtUsd(estimate.notional)}</span>
            </div>
            <div className="flex justify-between text-txt-2">
              <span>{t("terminal.estMargin")}</span>
              <span className="text-txt-1">{fmtUsd(estimate.margin)}</span>
            </div>
            <div className="flex justify-between text-txt-2">
              <Tooltip label="Taker fee 0.04% от нотионала">
                <span className="cursor-help underline decoration-dotted">{t("terminal.estFee")}</span>
              </Tooltip>
              <span className="text-txt-1">{fmtUsd(estimate.fee, 4)}</span>
            </div>
            {estimate.liqLong !== null && estimate.liqShort !== null && (
              <div className="flex justify-between text-txt-2">
                <Tooltip label={`Maintenance margin ${(MAINTENANCE_MARGIN_RATIO * 100).toFixed(1)}% — приблизительно, финальная цена считается сервером. Слева для Long, справа для Short.`}>
                  <span className="cursor-help underline decoration-dotted">{t("terminal.estLiqPrice")}</span>
                </Tooltip>
                <span>
                  <span className="text-buy">{fmtPrice(estimate.liqLong, inst?.priceDecimals ?? 2)}</span>
                  <span className="mx-1 text-txt-3">/</span>
                  <span className="text-sell">{fmtPrice(estimate.liqShort, inst?.priceDecimals ?? 2)}</span>
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-line-soft pt-1 font-medium text-txt-0">
              <span>{t("terminal.totalCost")}</span>
              <span>{fmtUsd(estimate.total)}</span>
            </div>
            <div className="flex justify-between text-txt-2">
              <span>{t("terminal.available")}</span>
              <span className={insufficientFunds ? "text-sell" : "text-txt-1"}>{fmtUsd(account?.cash ?? 0)}</span>
            </div>
          </div>
        )}

      </div>

      {/* Pinned below the scroll area, so the order can always be submitted
          without scrolling the form first. */}
      <div className={classNames("shrink-0 space-y-2 border-t border-line bg-bg-1 px-2.5", compact ? "py-1.5" : "py-2")}>
        {halted && (
          <div className="rounded border border-warn/40 bg-warn/10 px-2 py-1.5 text-2xs text-warn">
            Котировка устарела — торговля по {inst?.symbol} приостановлена до восстановления фида
          </div>
        )}
        {insufficientFunds && (
          <div className="rounded border border-sell/40 bg-sell-soft px-2 py-1.5 text-2xs text-sell">{t("terminal.insufficientFunds")}</div>
        )}

        {/* One pair of buttons that both *choose the direction and submit* —
            previously the same choice was made twice (a selector mid-form and
            a submit button here), which cost a row of space and added a step. */}
        <div className="grid grid-cols-2 gap-2">
          {(["BUY", "SELL"] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleSubmitClick(s)}
              disabled={!canSubmit}
              className={classNames(
                "btn-fx rounded-xl font-bold transition-[transform,background-color] disabled:cursor-not-allowed disabled:opacity-40",
                // Primary action, biggest depth in the form: shadow-lift (not
                // shadow-btn — see ChartToolbar.tsx's mobileCtrlCls doc for
                // why the smaller token barely reads on this dark a surface),
                // and a real tap-down squish since :active on a touchscreen
                // never fires a `.btn-fx` hover-lift to feel pressed against.
                compact ? "py-2.5 text-xs shadow-lift active:scale-[0.97]" : "py-3.5 text-sm shadow-btn",
                // -fill, not the plain buy/sell color: this is solid text
                // directly on the fill, which needs its own AA-verified
                // background — see globals.css's --c-buy-fill/--c-sell-fill.
                s === "BUY" ? "bg-buy-fill text-black hover:bg-buy-fill/90" : "bg-sell-fill text-white hover:bg-sell-fill/90"
              )}
            >
              {place.isPending && side === s
                ? "Отправка…"
                : armed === s
                  ? "Ещё раз"
                  : s === "BUY"
                    ? t("terminal.buyLong")
                    : t("terminal.sellShort")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
