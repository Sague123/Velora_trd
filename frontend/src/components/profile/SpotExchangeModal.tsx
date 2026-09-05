import { FormEvent, useMemo, useState } from "react";
import { useSpotAssets, useSpotConvert, useSpotQuote, useSpotTrade, useSpotWallet } from "../../hooks/useSpot";
import { useModalExit } from "../../hooks/useModalExit";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { classNames, fmtPrice, fmtUsd, n } from "../../lib/format";
import { IconSwap } from "../icons/Icon";

const inputCls =
  "w-full rounded-lg border border-line bg-bg-2 px-2.5 py-2 text-sm font-semibold tabular text-txt-0 outline-none focus:border-accent";
const selectCls =
  "w-full rounded-lg border border-line bg-bg-2 px-2 py-2 text-xs font-semibold text-txt-0 outline-none focus:border-accent";

export type ExchangeMode = "buy" | "sell" | "convert";

const MODE_TITLE: Record<ExchangeMode, string> = {
  buy: "Купить актив",
  sell: "Продать актив",
  convert: "Конвертация",
};

/**
 * Buying an asset for dollars, selling it back and swapping one asset for
 * another are one operation with different ends fixed — which is exactly how
 * the server implements them (lib/spot.ts's spotExchange) — so they are one
 * form here too. `mode` only decides which side starts pinned; everything
 * below it is the same code path, which is why the three cannot drift apart.
 *
 * Every figure shown before the button is pressed comes from the server's own
 * /api/spot/quote, computed by the same function that will execute the fill.
 * Nothing here re-derives a rate or a fee locally, so the preview and the
 * receipt agree unless the market itself moved in between.
 */
export function SpotExchangeModal({
  mode, initialAsset, onClose,
}: {
  mode: ExchangeMode;
  initialAsset?: string;
  onClose: () => void;
}) {
  const { closing, requestClose } = useModalExit(onClose);
  const { data: catalog } = useSpotAssets();
  const { data: wallet } = useSpotWallet();
  const trade = useSpotTrade();
  const convert = useSpotConvert();

  const assets = catalog?.assets ?? [];
  const quoteAsset = catalog?.quoteAsset ?? "USD";
  const tradeable = assets.filter((a) => a.symbol !== null);

  const [fromAsset, setFromAsset] = useState(
    mode === "sell" ? initialAsset ?? tradeable[0]?.asset ?? "BTC" : quoteAsset
  );
  const [toAsset, setToAsset] = useState(
    mode === "sell" ? quoteAsset : initialAsset ?? tradeable[0]?.asset ?? "BTC"
  );
  const [amount, setAmount] = useState("");

  const quote = useSpotQuote(fromAsset, toAsset, amount.trim());
  const pending = trade.isPending || convert.isPending;

  const held = useMemo(() => {
    const row = wallet?.holdings.find((h) => h.asset === fromAsset);
    return row?.qty ?? "0";
  }, [wallet, fromAsset]);

  const toInfo = assets.find((a) => a.asset === toAsset);
  const fromInfo = assets.find((a) => a.asset === fromAsset);
  const overBalance = Number(amount) > n(held);

  function swapSides() {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setAmount("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = amount.trim();
    if (!value || Number(value) <= 0) return toast.warning("Укажите сумму");
    if (fromAsset === toAsset) return toast.warning("Выберите разные активы");
    if (overBalance) return toast.warning(`Недостаточно ${fromAsset}`, `Доступно: ${held}`);

    try {
      // Buy and sell go through /trade so they're journalled as BUY/SELL and
      // read as trades in the history, not as an anonymous conversion; a swap
      // between two non-USD assets is genuinely neither, and goes to /convert.
      if (fromAsset === quoteAsset && toAsset !== quoteAsset) {
        const res = await trade.mutateAsync({ asset: toAsset, side: "BUY", amount: value });
        toast.success(`Куплено ${res.trade.toQty} ${toAsset}`, `Комиссия ${fmtUsd(res.trade.feeUsd, 4)}`);
      } else if (toAsset === quoteAsset && fromAsset !== quoteAsset) {
        const res = await trade.mutateAsync({ asset: fromAsset, side: "SELL", amount: value });
        toast.success(`Продано ${res.trade.fromQty} ${fromAsset}`, `Получено ${fmtUsd(res.trade.toQty)} · комиссия ${fmtUsd(res.trade.feeUsd, 4)}`);
      } else {
        const res = await convert.mutateAsync({ fromAsset, toAsset, amount: value });
        toast.success(`${res.conversion.fromQty} ${fromAsset} → ${res.conversion.toQty} ${toAsset}`, `Комиссия ${fmtUsd(res.conversion.feeUsd, 4)}`);
      }
      requestClose();
    } catch (err) {
      toast.error("Обмен отклонён", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={requestClose}>
      <div
        className={`${closing ? "anim-rise-out" : "anim-rise"} w-full max-w-sm rounded-xl border border-accent/40 bg-bg-1 p-5 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-txt-0">
          <IconSwap size={18} /> {MODE_TITLE[mode]}
        </div>
        <div className="mb-4 text-2xs text-txt-3">
          Спот — актив зачисляется в кошелёк целиком, без плеча и без ликвидации.
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-2xs text-txt-2">Отдаёте</span>
              <button
                type="button"
                onClick={() => setAmount(held)}
                className="btn-fx text-2xs text-accent hover:underline"
              >
                Доступно: <span className="tabular">{held}</span> {fromAsset}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="0.00"
                autoFocus
                className={classNames(inputCls, "flex-1", overBalance && "border-sell")}
              />
              <select value={fromAsset} onChange={(e) => setFromAsset(e.target.value)} className={classNames(selectCls, "w-28 shrink-0")}>
                {assets.map((a) => <option key={a.asset} value={a.asset}>{a.asset}</option>)}
              </select>
            </div>
            {overBalance && <div className="mt-1 text-2xs text-sell">Больше, чем есть в кошельке</div>}
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={swapSides}
              aria-label="Поменять активы местами"
              className="btn-fx tap-sm rounded-full border border-line bg-bg-2 p-1.5 text-txt-2 hover:text-accent"
            >
              <IconSwap size={14} />
            </button>
          </div>

          <div>
            <span className="mb-1 block text-2xs text-txt-2">Получаете</span>
            <div className="flex gap-2">
              <div className={classNames(inputCls, "flex flex-1 items-center text-txt-1")}>
                {quote.data ? quote.data.receive : quote.isFetching ? "…" : "—"}
              </div>
              <select value={toAsset} onChange={(e) => setToAsset(e.target.value)} className={classNames(selectCls, "w-28 shrink-0")}>
                {assets.map((a) => <option key={a.asset} value={a.asset}>{a.asset}</option>)}
              </select>
            </div>
          </div>

          {/* Straight from /api/spot/quote — the same numbers the fill will
              use, not a second calculation that could round differently. */}
          <div className="space-y-1 rounded-lg border border-line-soft bg-bg-2/40 px-2.5 py-2 text-2xs">
            <div className="flex justify-between text-txt-2">
              <span>Курс</span>
              <span className="tabular text-txt-1">
                {quote.data ? `1 ${fromAsset} ≈ ${quote.data.rate} ${toAsset}` : "—"}
              </span>
            </div>
            <div className="flex justify-between text-txt-2">
              <span>Оборот</span>
              <span className="tabular text-txt-1">{quote.data ? fmtUsd(quote.data.grossUsd) : "—"}</span>
            </div>
            <div className="flex justify-between text-txt-2">
              <span>Комиссия 0.04%</span>
              <span className="tabular text-warn">{quote.data ? fmtUsd(quote.data.feeUsd, 4) : "—"}</span>
            </div>
            {toInfo?.price && (
              <div className="flex justify-between text-txt-3">
                <span>Цена {toAsset}</span>
                <span className="tabular">{fmtPrice(toInfo.price, toInfo.priceDecimals)}</span>
              </div>
            )}
            {fromInfo?.price && fromAsset !== quoteAsset && (
              <div className="flex justify-between text-txt-3">
                <span>Цена {fromAsset}</span>
                <span className="tabular">{fmtPrice(fromInfo.price, fromInfo.priceDecimals)}</span>
              </div>
            )}
          </div>

          {quote.isError && (
            <div className="rounded-lg border border-sell/40 bg-sell-soft px-2.5 py-2 text-2xs text-sell">
              {quote.error instanceof ApiError ? quote.error.message : "Не удалось получить курс — возможно, котировка устарела"}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || !quote.data || overBalance}
              className="btn-fx tap flex-1 rounded-lg bg-accent-fill py-2.5 text-xs font-bold text-white hover:brightness-110 disabled:opacity-40"
            >
              {pending ? "Выполняем…" : "Обменять"}
            </button>
            <button
              type="button"
              onClick={requestClose}
              className="btn-fx tap rounded-lg border border-line px-4 text-xs text-txt-2 hover:text-txt-0"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
