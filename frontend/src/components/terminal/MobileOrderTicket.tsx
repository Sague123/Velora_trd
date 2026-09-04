import { useTranslation } from "react-i18next";
import { useOrderTicketStore } from "../../store/orderTicket";
import { useOrderTicket } from "../../hooks/useOrderTicket";
import { classNames, fmtPrice, fmtQty, fmtUsd } from "../../lib/format";
import { leverageTicks, MAINTENANCE_MARGIN_RATIO } from "../../lib/tradeMath";
import { RangeSlider } from "../common/RangeSlider";
import type { OrderType } from "../../lib/types";

const TYPES: OrderType[] = ["MARKET", "LIMIT", "STOP"];
const SIZE_STEPS = [0, 25, 50, 75, 100];

function InfoCell({ label, value, tone }: { label: string; value: string; tone?: "buy" | "sell" | "warn" }) {
  return (
    <div className="rounded-lg border border-line-soft bg-bg-2 px-2 py-1.5">
      <div className="text-[9px] text-txt-3">{label}</div>
      <div
        className={classNames(
          "tabular text-2xs font-semibold",
          tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : tone === "warn" ? "text-warn" : "text-txt-0"
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * The phone order ticket: fields only — no Buy/Sell buttons.
 *
 * Those live in the pinned bottom bar (MobileBottomStack) and are the single
 * place in the whole interface where a position is opened, so the same
 * decision is never presented twice. Everything here writes to the shared
 * ticket store, which is what the pinned bar reads when it submits.
 */
export function MobileOrderTicket() {
  const { t } = useTranslation();
  const {
    inst, baseAsset, effectivePrice, qty, estimate, availableCash,
    insufficientFunds, halted, side,
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
  const sizePct = useOrderTicketStore((s) => s.sizePct);
  const setSizePct = useOrderTicketStore((s) => s.setSizePct);

  // The slider spends a share of what's actually spendable. In BASE mode the
  // amount is a quantity, not money, so the percentage is converted through
  // the current price and leverage rather than written in as dollars.
  function applyPct(pct: number) {
    setSizePct(pct);
    const budget = (pct / 100) * availableCash;
    if (amountMode === "MARGIN") return setAmount(budget ? budget.toFixed(2) : "");
    if (amountMode === "QUOTE") return setAmount(budget ? (budget * Math.max(1, leverage)).toFixed(2) : "");
    const q = effectivePrice > 0 ? (budget * Math.max(1, leverage)) / effectivePrice : 0;
    setAmount(q ? q.toFixed(6) : "");
  }

  const amountLabel = amountMode === "BASE" ? baseAsset || t("terminal.base") : "$";

  return (
    <section className="border-t border-line bg-gradient-to-b from-bg-1 to-bg-0 px-3.5 pb-4 pt-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-2xs font-bold uppercase tracking-wide text-txt-2">{t("terminal.newOrder")}</span>
        {side && (
          <span
            className={classNames(
              "rounded px-2 py-1 text-[9px] font-extrabold",
              side === "BUY" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell"
            )}
          >
            {side === "BUY" ? "LONG" : "SHORT"}
          </span>
        )}
      </div>

      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-2xs text-txt-3">{t("terminal.amount")}</span>
        {/* A segmented control, not three words — matching the MARKET/LIMIT/
            STOP control beside it, which is the same kind of choice. No
            `tap-sm` here: this is a mode switch for the field next to it, not
            a primary action, so it trades the 38px touch floor (same call as
            ChartToolbar's `denseLiftedCls`) for a footprint proportional to
            what it does. What replaces size as the "selected" cue is a
            brighter, glowing fill instead of a merely-tinted one. */}
        <div className="flex gap-0.5 rounded-lg border border-line bg-bg-2 p-0.5">
          {(["BASE", "QUOTE", "MARGIN"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setAmountMode(m)}
              aria-pressed={amountMode === m}
              className={classNames(
                "rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-[background-color,box-shadow,color]",
                amountMode === m ? "glow-accent bg-accent-fill text-white" : "text-txt-3 hover:text-txt-1"
              )}
            >
              {m === "BASE" ? baseAsset || t("terminal.base") : m === "QUOTE" ? t("terminal.total") : t("terminal.margin")}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-stretch gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-bg-2 px-2.5">
          <span className="shrink-0 text-xs text-txt-3">{amountLabel}</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0.00"
            className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm font-semibold tabular text-txt-0 outline-none"
          />
        </div>
        {/* Same trade-off as the Amount switch above: no `tap-sm`, a
            proportionally small footprint, and the accent glow carrying the
            "selected" signal instead of size. */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-bg-2 p-1">
          {TYPES.map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => setType(ty)}
              className={classNames(
                "rounded px-1.5 py-0.5 text-[10px] font-bold transition-[background-color,box-shadow,color]",
                type === ty ? "glow-accent bg-accent-fill text-white" : "text-txt-3"
              )}
            >
              {ty}
            </button>
          ))}
        </div>
      </div>

      {type !== "MARKET" && (
        <label className="mt-2.5 block">
          <span className="mb-1 flex items-center justify-between text-2xs text-txt-3">
            <span>{t("terminal.orderPrice")}</span>
            <button type="button" onClick={() => setPrice(String(inst?.livePrice ?? ""))} className="tap-sm text-accent">
              mark {fmtPrice(inst?.livePrice, inst?.priceDecimals ?? 2)}
            </button>
          </span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder={fmtPrice(inst?.livePrice, inst?.priceDecimals ?? 2)}
            className="w-full rounded-lg border border-line bg-bg-2 px-2.5 py-2 text-xs font-semibold tabular text-txt-0 outline-none focus:border-accent"
          />
        </label>
      )}

      <div className="mt-3 border-t border-line-soft pt-2.5">
        <div className="mb-1 flex justify-between text-2xs">
          <span className="text-txt-3">{t("terminal.positionSize")}</span>
          <span className="tabular text-txt-2">{sizePct}%</span>
        </div>
        {/* Green: this is "how much capital to commit", not risk. step=1 lets
            the pointer land anywhere; snapPoints pulls it onto 0/25/50/75/100
            within 2 points instead of forcing an exact pixel, so a trader
            aiming for "quarter of my account" gets it without hunting. */}
        <RangeSlider
          value={sizePct}
          min={0}
          max={100}
          step={1}
          onChange={applyPct}
          tone="buy"
          ticks={SIZE_STEPS}
          snapPoints={SIZE_STEPS}
          snapTolerance={2}
          ariaLabel={t("terminal.positionSize")}
        />
        <div className="flex justify-between text-[9px] text-txt-3">
          {SIZE_STEPS.map((s) => <span key={s}>{s}%</span>)}
        </div>
      </div>

      <div className="mt-3 border-y border-line-soft py-2.5">
        <button
          type="button"
          onClick={() => setUseTpSl(!useTpSl)}
          aria-pressed={useTpSl}
          className="flex w-full items-center justify-between"
        >
          <span className="text-xs font-semibold text-txt-1">Take Profit / Stop Loss</span>
          <span
            className={classNames(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150",
              useTpSl ? "bg-accent-fill" : "bg-bg-3"
            )}
          >
            <span
              className={classNames(
                "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-150",
                useTpSl ? "translate-x-4" : "translate-x-0"
              )}
            />
          </span>
        </button>
        {useTpSl && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <input
              value={tp}
              onChange={(e) => setTp(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder={t("terminal.takeProfit")}
              className="w-full rounded-lg border border-line bg-bg-2 px-2 py-1.5 text-2xs tabular text-buy outline-none focus:border-buy"
            />
            <input
              value={sl}
              onChange={(e) => setSl(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder={t("terminal.stopLoss")}
              className="w-full rounded-lg border border-line bg-bg-2 px-2 py-1.5 text-2xs tabular text-sell outline-none focus:border-sell"
            />
          </div>
        )}
      </div>

      <div className="mt-2.5">
        <div className="mb-1 flex justify-between text-2xs">
          <span className="text-txt-3">{t("terminal.leverage")}</span>
          <strong className="tabular text-txt-0">{leverage}x</strong>
        </div>
        <RangeSlider
          value={leverage}
          min={1}
          max={inst?.maxLeverage ?? 1}
          step={1}
          onChange={setLeverage}
          tone="warn"
          ticks={leverageTicks(inst?.maxLeverage ?? 1)}
          tickLabel={(t) => `${t}x`}
          disabled={!inst || inst.maxLeverage <= 1}
          ariaLabel={t("terminal.leverage")}
        />
      </div>

      {/* Kept from the desktop ticket rather than dropped to match the
          reference: at up to {maxLeverage}x, a form that shows what the
          position costs but not the price it gets closed at is hiding the
          half that matters. */}
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <InfoCell label={t("terminal.price")} value={effectivePrice > 0 ? fmtPrice(effectivePrice, inst?.priceDecimals ?? 2) : "—"} />
        <InfoCell label={t("terminal.qty")} value={qty > 0 ? `${fmtQty(qty)} ${baseAsset}` : "—"} />
        <InfoCell label={t("terminal.totalCost")} value={fmtUsd(estimate.total)} tone={insufficientFunds ? "sell" : undefined} />
        <InfoCell label={t("terminal.available")} value={fmtUsd(availableCash)} />
        <InfoCell label={t("terminal.estFee")} value={fmtUsd(estimate.fee, 4)} />
        <InfoCell
          label={`${t("terminal.estLiqPrice")} · L/S`}
          value={
            estimate.liqLong !== null && estimate.liqShort !== null
              ? `${fmtPrice(estimate.liqLong, inst?.priceDecimals ?? 2)} / ${fmtPrice(estimate.liqShort, inst?.priceDecimals ?? 2)}`
              : "—"
          }
          tone={estimate.liqLong !== null ? "warn" : undefined}
        />
      </div>
      <p className="mt-1.5 text-[9px] leading-snug text-txt-3">
        Maintenance margin {(MAINTENANCE_MARGIN_RATIO * 100).toFixed(1)}% — оценка, финальная цена считается сервером.
      </p>

      {halted && (
        <div className="mt-2.5 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-2 text-2xs text-warn">
          Котировка устарела — торговля по {inst?.symbol} приостановлена до восстановления фида
        </div>
      )}
      {insufficientFunds && (
        <div className="mt-2.5 rounded-lg border border-sell/40 bg-sell-soft px-2.5 py-2 text-2xs text-sell">
          {t("terminal.insufficientFunds")}
        </div>
      )}
    </section>
  );
}
