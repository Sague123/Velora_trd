import { useTranslation } from "react-i18next";
import { useOrderTicketStore } from "../../store/orderTicket";
import { useOrderTicket } from "../../hooks/useOrderTicket";
import { classNames, fmtPrice, fmtQty, fmtUsd } from "../../lib/format";
import { estMargin, estNotional, MAINTENANCE_MARGIN_RATIO } from "../../lib/tradeMath";
import { Tooltip } from "../common/Tooltip";
import { IconBearMarket, IconBullMarket } from "../icons/Icon";
import type { OrderType } from "../../lib/types";

const TYPES: OrderType[] = ["MARKET", "LIMIT", "STOP"];

/**
 * The desktop order ticket — fields and the Buy/Sell buttons together, since
 * on a desktop layout the whole form is visible at once and there is no
 * pinned bar to move the buttons to. The phone's equivalent is split in two:
 * MobileOrderTicket for the fields, MobileBottomStack for the buttons.
 *
 * State lives in the shared ticket store so both layouts compose the same
 * order (see store/orderTicket.ts).
 */
export function OrderEntry() {
  const { t } = useTranslation();
  const {
    inst, account, baseAsset, effectivePrice, qty, estimate, insufficientFunds,
    halted, canSubmit, side, armed, isPending, handleSubmitClick,
  } = useOrderTicket();

  const type = useOrderTicketStore((s) => s.type);
  const setType = useOrderTicketStore((s) => s.setType);
  const amountMode = useOrderTicketStore((s) => s.amountMode);
  const setAmountMode = useOrderTicketStore((s) => s.setAmountMode);
  const amount = useOrderTicketStore((s) => s.amount);
  const setAmount = useOrderTicketStore((s) => s.setAmount);
  const price = useOrderTicketStore((s) => s.price);
  const setPrice = useOrderTicketStore((s) => s.setPrice);
  const leverage = useOrderTicketStore((s) => s.leverage);
  const setLeverage = useOrderTicketStore((s) => s.setLeverage);
  const useTpSl = useOrderTicketStore((s) => s.useTpSl);
  const setUseTpSl = useOrderTicketStore((s) => s.setUseTpSl);
  const tp = useOrderTicketStore((s) => s.tp);
  const setTp = useOrderTicketStore((s) => s.setTp);
  const sl = useOrderTicketStore((s) => s.sl);
  const setSl = useOrderTicketStore((s) => s.setSl);

  return (
    // The root no longer scrolls; only the field area between the type
    // selector and the pinned submit bar does, so Buy/Sell stay on screen.
    <div className="flex h-full flex-col overflow-hidden bg-bg-1">
      <div className="flex shrink-0 gap-0.5 border-b border-line p-1">
        {TYPES.map((ty) => (
          <button
            key={ty}
            onClick={() => setType(ty)}
            className={classNames(
              "btn-fx flex-1 rounded px-2 py-1.5 text-2xs font-medium transition-colors",
              type === ty ? "bg-bg-3 text-txt-0" : "text-txt-2 hover:text-txt-0"
            )}
          >
            {ty}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2.5 pb-2">
        {type !== "MARKET" && (
          <label className="block">
            <span className="mb-1 flex justify-between text-2xs text-txt-2">
              <span>{t("terminal.price")}</span>
              <button type="button" onClick={() => setPrice(String(inst?.livePrice ?? ""))} className="text-accent hover:underline">
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
            {/* Solid fill on the active segment, matching the MARKET/LIMIT/STOP
                row above: a tinted -soft background reads as "hovered", not as
                "chosen", when it sits next to a control that fills solid. */}
            <div className="flex gap-0.5 rounded border border-line bg-bg-2 p-0.5">
              <button
                type="button"
                onClick={() => setAmountMode("BASE")}
                aria-pressed={amountMode === "BASE"}
                className={classNames("rounded px-1.5 py-0.5 text-2xs font-semibold transition-colors", amountMode === "BASE" ? "bg-accent-fill text-white" : "text-txt-2 hover:text-txt-0")}
              >
                {baseAsset || t("terminal.base")}
              </button>
              <button
                type="button"
                onClick={() => setAmountMode("QUOTE")}
                aria-pressed={amountMode === "QUOTE"}
                className={classNames("rounded px-1.5 py-0.5 text-2xs font-semibold transition-colors", amountMode === "QUOTE" ? "bg-accent-fill text-white" : "text-txt-2 hover:text-txt-0")}
              >
                {t("terminal.total")}
              </button>
              <Tooltip label="Сумма — это ваш собственный капитал (маржа), которым вы рискуете; размер позиции = маржа × плечо, как в форме ордера на Binance/Bybit Futures">
                <button
                  type="button"
                  onClick={() => setAmountMode("MARGIN")}
                  aria-pressed={amountMode === "MARGIN"}
                  className={classNames("cursor-help rounded px-1.5 py-0.5 text-2xs font-semibold underline decoration-dotted transition-colors", amountMode === "MARGIN" ? "bg-accent-fill text-white" : "text-txt-2 hover:text-txt-0")}
                >
                  {t("terminal.margin")}
                </button>
              </Tooltip>
            </div>
          </span>
          <div className="flex items-stretch gap-1.5">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={amountMode === "BASE" ? "0.00" : "$ 0.00"}
              className="min-w-0 flex-1 rounded border border-line bg-bg-2 px-2 py-1.5 text-xs tabular outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setUseTpSl(!useTpSl)}
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
          </div>
          <div className="mt-1 text-2xs text-txt-3">
            {amountMode === "BASE" && qty > 0 && `≈ ${fmtUsd(estNotional(qty, effectivePrice))} total · ${fmtUsd(estMargin(estNotional(qty, effectivePrice), leverage))} margin`}
            {amountMode === "QUOTE" && qty > 0 && `≈ ${fmtQty(qty)} ${baseAsset} · ${fmtUsd(estMargin(estNotional(qty, effectivePrice), leverage))} margin`}
            {amountMode === "MARGIN" && qty > 0 && `≈ ${fmtQty(qty)} ${baseAsset} · ${fmtUsd(estNotional(qty, effectivePrice))} total`}
          </div>
        </label>

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
          <div className="mt-0.5 flex justify-between text-2xs text-txt-3">
            <span>1x</span>
            <span>{inst?.maxLeverage ?? 1}x</span>
          </div>
        </label>

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
      </div>

      {/* Pinned below the scroll area, so the order can always be submitted
          without scrolling the form first. */}
      <div className="shrink-0 space-y-2 border-t border-line bg-bg-1 px-2.5 py-2">
        {halted && (
          <div className="rounded border border-warn/40 bg-warn/10 px-2 py-1.5 text-2xs text-warn">
            Котировка устарела — торговля по {inst?.symbol} приостановлена до восстановления фида
          </div>
        )}
        {insufficientFunds && (
          <div className="rounded border border-sell/40 bg-sell-soft px-2 py-1.5 text-2xs text-sell">{t("terminal.insufficientFunds")}</div>
        )}

        {/* One pair of buttons that both choose the direction and submit —
            the same choice was previously made twice (a selector mid-form and
            a submit button here), costing a row and a step. */}
        <div className="grid grid-cols-2 gap-2">
          {(["BUY", "SELL"] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleSubmitClick(s)}
              disabled={!canSubmit}
              className={classNames(
                "btn-fx flex items-center justify-center gap-1.5 rounded-xl py-3.5 text-sm font-bold shadow-btn transition-[transform,background-color] disabled:cursor-not-allowed disabled:opacity-40",
                // -fill, not the plain buy/sell colour: this is solid text
                // directly on the fill, which needs its own AA-verified
                // background — see globals.css's --c-buy-fill/--c-sell-fill.
                s === "BUY" ? "bg-buy-fill text-black hover:bg-buy-fill/90" : "bg-sell-fill text-white hover:bg-sell-fill/90"
              )}
            >
              {s === "BUY" ? <IconBullMarket size={16} /> : <IconBearMarket size={16} />}
              {isPending && side === s
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
