import { FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBots, useCreateBot, useDeleteBot, useStartBot, useStopBot } from "../store/strategies";
import type { Bot, CreateBotInput } from "../lib/types";
import { useChartBars, useInstruments } from "../hooks/useMarket";
import { suggestGrid, estimateGridBacktest } from "../lib/gridSuggestion";
import { GridPreviewChart } from "../components/strategies/GridPreviewChart";
import { CoinPicker } from "../components/strategies/CoinPicker";
import { BotDetailModal } from "../components/strategies/BotDetailModal";
import { classNames, fmt, fmtPrice, fmtUsd } from "../lib/format";
import { toast } from "../store/toast";
import { IconFlask, IconGrid, IconServer, IconTarget, IconTrendDown, IconTrendUp } from "../components/icons/Icon";
import type { Timeframe } from "../lib/types";
import { ApiError } from "../lib/api";
import { SiteFooter } from "../components/layout/SiteFooter";

const inputCls = "w-full rounded border border-line bg-bg-2 px-2 py-1.5 text-xs tabular outline-none focus:border-accent transition-colors";
const labelCls = "mb-1 block text-2xs font-medium text-txt-2";
const PREVIEW_TFS: Timeframe[] = ["15m", "1H", "4H", "1D"];

function GridBotForm({ onCreate }: { onCreate: (input: CreateBotInput) => void }) {
  const { data } = useInstruments();
  const cryptoInstruments = data?.instruments ?? [];
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState<Timeframe>("1H");
  const [lower, setLower] = useState("");
  const [upper, setUpper] = useState("");
  const [levels, setLevels] = useState("6");
  const [qtyPerLevel, setQtyPerLevel] = useState("");
  const [leverage, setLeverage] = useState("1");

  const symbolCategory = cryptoInstruments.find((i) => i.symbol === symbol)?.category;
  const { data: chartData } = useChartBars(symbol, symbolCategory, timeframe);
  const suggestion = useMemo(() => (chartData?.bars.length ? suggestGrid(chartData.bars) : null), [chartData]);
  const decimals = cryptoInstruments.find((i) => i.symbol === symbol)?.priceDecimals ?? 2;

  const backtest = useMemo(() => {
    const lo = Number(lower), hi = Number(upper), lv = Math.max(1, Math.trunc(Number(levels)) || 1), qty = Number(qtyPerLevel);
    if (!chartData?.bars.length || !(hi > lo) || !(qty > 0)) return null;
    return estimateGridBacktest(chartData.bars, lo, hi, lv, qty);
  }, [chartData, lower, upper, levels, qtyPerLevel]);

  function applySuggestion() {
    if (!suggestion) return toast.warning("Недостаточно свечей для расчёта — попробуйте другой символ");
    setLower(suggestion.lower.toFixed(8));
    setUpper(suggestion.upper.toFixed(8));
    setLevels(String(suggestion.levels));
    toast.info("Диапазон предложен по ATR(14)", `±2.5×ATR вокруг текущей цены ${suggestion.price.toFixed(decimals)}`);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const lo = Number(lower), hi = Number(upper), lv = Math.max(2, Math.trunc(Number(levels))), qty = Number(qtyPerLevel), lev = Math.max(1, Math.trunc(Number(leverage)));
    if (!(lo > 0) || !(hi > lo) || !(qty > 0)) return toast.warning("Проверьте диапазон цен и объём на уровень");
    // Money-shaped fields go over the wire as fixed-precision decimal strings:
    // the server keeps every price and quantity as a scaled integer, and a
    // JS float would be the one place precision could be lost on the way in.
    onCreate({
      type: "GRID", symbol,
      config: { lower: lo.toFixed(8), upper: hi.toFixed(8), levels: lv, qtyPerLevel: qty.toFixed(8), leverage: lev },
    });
    setLower(""); setUpper(""); setQtyPerLevel("");
  }

  const estMargin = (Number(qtyPerLevel) || 0) * (Number(upper) || suggestion?.price || 0) / Math.max(1, Number(leverage) || 1);
  const estTotal = estMargin * Math.max(1, Math.trunc(Number(levels)) || 1);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[200px_minmax(0,1fr)_320px]">
      <div className="h-64 lg:h-auto">
        <CoinPicker value={symbol} onChange={setSymbol} />
      </div>

      <div className="flex h-72 flex-col lg:h-auto">
        <div className="mb-1.5 flex shrink-0 items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-wide text-txt-2">Live Preview — {symbol}</span>
          <div className="flex gap-0.5 rounded border border-line p-0.5">
            {PREVIEW_TFS.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={classNames("rounded px-1.5 py-0.5 text-2xs font-medium", timeframe === tf ? "bg-accent-fill text-white" : "text-txt-2 hover:text-txt-0")}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <GridPreviewChart symbol={symbol} timeframe={timeframe} lower={Number(lower) || 0} upper={Number(upper) || 0} levels={Math.max(1, Math.trunc(Number(levels)) || 1)} />
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line-soft bg-bg-2/30 p-3.5">
        <button
          type="button"
          onClick={applySuggestion}
          disabled={!suggestion}
          className="btn-fx flex items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-gradient-to-r from-accent-soft to-accent-soft px-3 py-2 text-xs font-semibold text-accent hover:brightness-110 disabled:opacity-40"
        >
          <IconTarget size={14} /> Suggest Range (ATR volatility)
        </button>

        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={labelCls}>Lower Price</span>
            <input value={lower} onChange={(e) => setLower(e.target.value)} inputMode="decimal" className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Upper Price</span>
            <input value={upper} onChange={(e) => setUpper(e.target.value)} inputMode="decimal" className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Grid Levels</span>
            <input value={levels} onChange={(e) => setLevels(e.target.value)} inputMode="numeric" className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Qty per Level</span>
            <input value={qtyPerLevel} onChange={(e) => setQtyPerLevel(e.target.value)} inputMode="decimal" className={inputCls} /></label>
        </div>
        <label className="block"><span className={labelCls}>Leverage</span>
          <input value={leverage} onChange={(e) => setLeverage(e.target.value)} inputMode="numeric" className={inputCls} /></label>

        {estTotal > 0 && (
          <div className="rounded-lg border border-line-soft bg-bg-3/40 px-3 py-2 text-2xs">
            <div className="flex justify-between text-txt-2"><span>Est. margin per level</span><span className="tabular text-txt-1">{fmtUsd(estMargin)}</span></div>
            <div className="flex justify-between font-medium text-txt-0"><span>Est. total capital</span><span className="tabular">{fmtUsd(estTotal)}</span></div>
          </div>
        )}

        {backtest && (
          <div className="rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-2 text-2xs">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-accent"><IconTrendUp size={13} /> Historical backtest ({fmt(backtest.days, 0)}д свечей {timeframe})</div>
            <div className="flex justify-between text-txt-2"><span>Пересечений уровней</span><span className="tabular text-txt-1">{backtest.cycles}</span></div>
            <div className="flex justify-between text-txt-2"><span>Валовая прибыль за период</span><span className={classNames("tabular font-medium", backtest.grossProfit >= 0 ? "text-buy" : "text-sell")}>{fmtUsd(backtest.grossProfit)}</span></div>
            <div className="flex justify-between text-txt-2"><span>В среднем в день</span><span className="tabular text-txt-1">{fmtUsd(backtest.perDay)}</span></div>
            <div className="mt-1 text-2xs text-txt-3">По факту пересечений уровней в реальных свечах, без комиссий — не гарантия будущей доходности.</div>
          </div>
        )}

        <button type="submit" className="btn-fx mt-1 rounded-lg bg-gradient-to-r from-accent to-[#7c3aed] px-4 py-2.5 text-xs font-bold text-white hover:brightness-110">
          Create Grid Bot
        </button>
      </form>
    </div>
  );
}

function MartingaleBotForm({ onCreate }: { onCreate: (input: CreateBotInput) => void }) {
  const [symbol, setSymbol] = useState("BTC-PERP");
  const [timeframe, setTimeframe] = useState<Timeframe>("1H");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [baseQty, setBaseQty] = useState("");
  const [multiplier, setMultiplier] = useState("2");
  const [maxSteps, setMaxSteps] = useState("3");
  const [takeProfitPct, setTakeProfitPct] = useState("5");
  const [addOnDrawdownPct, setAddOnDrawdownPct] = useState("10");
  const [leverage, setLeverage] = useState("2");

  function submit(e: FormEvent) {
    e.preventDefault();
    const qty = Number(baseQty), mult = Number(multiplier), steps = Math.max(1, Math.trunc(Number(maxSteps)));
    if (!(qty > 0) || !(mult > 1)) return toast.warning("Проверьте базовый объём и множитель (> 1)");
    onCreate({
      type: "MARTINGALE", symbol,
      config: {
        side, baseQty: qty.toFixed(8), multiplier: mult, maxSteps: steps,
        takeProfitPct: Number(takeProfitPct) || 5,
        addOnDrawdownPct: Number(addOnDrawdownPct) || 10,
        leverage: Math.max(1, Math.trunc(Number(leverage))),
      },
    });
    setBaseQty("");
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[200px_minmax(0,1fr)_320px]">
      <div className="h-64 lg:h-auto">
        <CoinPicker value={symbol} onChange={setSymbol} />
      </div>

      <div className="flex h-72 flex-col lg:h-auto">
        <div className="mb-1.5 flex shrink-0 items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-wide text-txt-2">Live Preview — {symbol}</span>
          <div className="flex gap-0.5 rounded border border-line p-0.5">
            {PREVIEW_TFS.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={classNames("rounded px-1.5 py-0.5 text-2xs font-medium", timeframe === tf ? "bg-accent-fill text-white" : "text-txt-2 hover:text-txt-0")}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <GridPreviewChart symbol={symbol} timeframe={timeframe} lower={0} upper={0} levels={0} />
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line-soft bg-bg-2/30 p-3.5">
        <label className="block">
          <span className={labelCls}>Direction</span>
          <div className="flex gap-1 rounded border border-line p-0.5">
            <button type="button" onClick={() => setSide("BUY")} className={classNames("btn-fx flex-1 rounded px-2 py-1.5 text-xs font-semibold", side === "BUY" ? "bg-buy-soft text-buy" : "text-txt-2")}>Long</button>
            <button type="button" onClick={() => setSide("SELL")} className={classNames("btn-fx flex-1 rounded px-2 py-1.5 text-xs font-semibold", side === "SELL" ? "bg-sell-soft text-sell" : "text-txt-2")}>Short</button>
          </div>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={labelCls}>Base Qty</span>
            <input value={baseQty} onChange={(e) => setBaseQty(e.target.value)} inputMode="decimal" className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Multiplier</span>
            <input value={multiplier} onChange={(e) => setMultiplier(e.target.value)} inputMode="decimal" className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Max Steps</span>
            <input value={maxSteps} onChange={(e) => setMaxSteps(e.target.value)} inputMode="numeric" className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Leverage</span>
            <input value={leverage} onChange={(e) => setLeverage(e.target.value)} inputMode="numeric" className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Take Profit % ROE</span>
            <input value={takeProfitPct} onChange={(e) => setTakeProfitPct(e.target.value)} inputMode="decimal" className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Add on Drawdown % ROE</span>
            <input value={addOnDrawdownPct} onChange={(e) => setAddOnDrawdownPct(e.target.value)} inputMode="decimal" className={inputCls} /></label>
        </div>
        <button type="submit" className="btn-fx mt-1 rounded-lg bg-gradient-to-r from-warn to-sell px-4 py-2.5 text-xs font-bold text-white hover:brightness-110">
          Create Martingale Bot
        </button>
      </form>
    </div>
  );
}

function BotCard({ bot, onOpen }: { bot: Bot; onOpen: () => void }) {
  const start = useStartBot();
  const stop = useStopBot();
  const remove = useDeleteBot();
  const [armStop, setArmStop] = useState(false);
  const busy = start.isPending || stop.isPending || remove.isPending;

  async function handleStart() {
    try {
      await start.mutateAsync(bot.id);
      toast.success(`${bot.type === "GRID" ? "Grid" : "Martingale"} bot started`, `${bot.symbol} — торгует на сервере`);
    } catch (e) {
      toast.error("Не удалось запустить бота", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function handleStop() {
    if (!armStop) { setArmStop(true); setTimeout(() => setArmStop(false), 4000); return; }
    setArmStop(false);
    try {
      await stop.mutateAsync(bot.id);
      toast.info("Бот остановлен", bot.symbol);
    } catch (e) {
      toast.error("Не удалось остановить бота", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function handleDelete() {
    if (bot.status === "RUNNING") return toast.warning("Сначала остановите бота");
    try {
      const res = await remove.mutateAsync(bot.id);
      // Martingale positions survive their bot on purpose — the server never
      // closes a live position unasked — so say so rather than let the trader
      // find them later and wonder where they came from.
      if (res.openPositions > 0) {
        toast.warning("Бот удалён", `Открытых позиций осталось: ${res.openPositions} — закройте их вручную при необходимости`);
      }
    } catch (e) {
      toast.error("Не удалось удалить бота", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="btn-fx overflow-hidden rounded-lg border border-line bg-bg-1">
      <div onClick={onOpen} className="flex cursor-pointer items-center justify-between border-b border-line-soft bg-bg-2/40 px-3 py-2 hover:bg-bg-3/40">
        <div className="flex items-center gap-2">
          <span className={bot.type === "GRID" ? "text-accent" : "text-warn"}>{bot.type === "GRID" ? <IconGrid size={15} /> : <IconTrendDown size={15} />}</span>
          <span className={classNames("rounded px-1.5 py-0.5 text-2xs font-medium", bot.type === "GRID" ? "bg-accent-soft text-accent" : "bg-warn/10 text-warn")}>
            {bot.type}
          </span>
          <span className="text-xs font-semibold text-txt-0">{bot.symbol}</span>
          <span
            className={classNames(
              "rounded px-1.5 py-0.5 text-2xs font-medium",
              bot.status === "RUNNING" ? "bg-buy-soft text-buy" : bot.status === "ERROR" ? "bg-sell-soft text-sell" : "bg-bg-3 text-txt-2"
            )}
          >
            {bot.status === "RUNNING" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-buy" />}
            {bot.status}
          </span>
        </div>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {bot.status !== "RUNNING" ? (
            <button onClick={handleStart} disabled={busy} className="btn-fx rounded border border-buy/40 px-2 py-1 text-2xs font-medium text-buy hover:bg-buy-soft disabled:opacity-40">Start</button>
          ) : (
            <button onClick={handleStop} disabled={busy} className="btn-fx rounded border border-sell/40 px-2 py-1 text-2xs font-medium text-sell hover:bg-sell-soft disabled:opacity-40">
              {armStop ? "Confirm Stop?" : "Stop"}
            </button>
          )}
          <button onClick={handleDelete} disabled={busy} className="btn-fx rounded border border-line px-2 py-1 text-2xs text-txt-2 hover:text-sell disabled:opacity-40">Delete</button>
        </div>
      </div>

      {bot.status === "ERROR" && bot.lastError && (
        <div className="border-b border-line-soft bg-sell-soft px-3 py-1.5 text-2xs text-sell">{bot.lastError}</div>
      )}

      <div className="grid grid-cols-2 gap-2 px-3 py-2 text-2xs sm:grid-cols-4">
        {bot.type === "GRID" ? (
          <>
            <div><span className="text-txt-2">Range: </span><span className="tabular text-txt-1">{fmtPrice(bot.config.lower, 4)} – {fmtPrice(bot.config.upper, 4)}</span></div>
            <div><span className="text-txt-2">Levels: </span><span className="tabular text-txt-1">{bot.config.levels}</span></div>
            <div><span className="text-txt-2">Qty/level: </span><span className="tabular text-txt-1">{bot.config.qtyPerLevel}</span></div>
            <div><span className="text-txt-2">Open grid orders: </span><span className="tabular text-txt-1">{bot.state.gridOrders?.length ?? 0}</span></div>
          </>
        ) : (
          <>
            <div><span className="text-txt-2">Direction: </span><span className={bot.config.side === "BUY" ? "text-buy" : "text-sell"}>{bot.config.side === "BUY" ? "Long" : "Short"}</span></div>
            <div><span className="text-txt-2">Base qty × mult: </span><span className="tabular text-txt-1">{bot.config.baseQty} × {bot.config.multiplier}</span></div>
            <div><span className="text-txt-2">Step: </span><span className="tabular text-txt-1">{bot.state.step ?? 0} / {bot.config.maxSteps}</span></div>
            <div><span className="text-txt-2">TP / DD: </span><span className="tabular text-txt-1">{bot.config.takeProfitPct}% / -{bot.config.addOnDrawdownPct}%</span></div>
          </>
        )}
      </div>

      <button onClick={onOpen} className="btn-fx block w-full border-t border-line-soft px-3 py-1.5 text-left text-2xs text-accent hover:bg-bg-2/40">
        Открыть детали бота: ордера, позиции, журнал →
      </button>
    </div>
  );
}

export function StrategiesPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useBots();
  const create = useCreateBot();
  const [tab, setTab] = useState<"grid" | "martingale">("grid");
  const [openBotId, setOpenBotId] = useState<string | null>(null);
  const list = data?.bots ?? [];

  async function handleCreate(input: CreateBotInput) {
    try {
      await create.mutateAsync(input);
      toast.success("Бот создан", `${input.type} ${input.symbol} — нажмите Start, чтобы запустить`);
    } catch (e) {
      toast.error("Не удалось создать бота", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1700px] flex-col overflow-y-auto p-3">
      {openBotId && <BotDetailModal botId={openBotId} onClose={() => setOpenBotId(null)} />}

      <div className="anim-rise mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-sm font-semibold text-txt-0">{t("strategies.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-2xs font-medium text-accent">
            <IconServer size={12} /> Работают на сервере — вкладку можно закрыть
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-2xs font-medium text-warn">
            <IconFlask size={12} /> Боты в тестовом режиме
          </span>
        </div>
      </div>

      <div className="anim-rise-2 mb-3 rounded-lg border border-line bg-bg-1 p-3.5">
        <div className="mb-3 flex gap-1 rounded-lg border border-line bg-bg-2/40 p-0.5" style={{ width: "fit-content" }}>
          <button onClick={() => setTab("grid")} className={classNames("btn-fx flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold", tab === "grid" ? "bg-accent-fill text-white" : "text-txt-2")}><IconGrid size={14} /> Grid Bot</button>
          <button onClick={() => setTab("martingale")} className={classNames("btn-fx flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold", tab === "martingale" ? "bg-gradient-to-r from-warn to-sell text-white" : "text-txt-2")}><IconTrendDown size={14} /> Martingale Bot</button>
        </div>
        {tab === "grid" ? <GridBotForm onCreate={handleCreate} /> : <MartingaleBotForm onCreate={handleCreate} />}
      </div>

      <div className="anim-rise-3 space-y-2">
        {isLoading && <div className="rounded-lg border border-line bg-bg-1 px-3 py-8 text-center text-2xs text-txt-3">Загрузка ботов…</div>}
        {!isLoading && list.length === 0 && <div className="rounded-lg border border-dashed border-line bg-bg-1 px-3 py-8 text-center text-2xs text-txt-3">Нет созданных ботов — настройте один выше.</div>}
        {list.map((bot) => <BotCard key={bot.id} bot={bot} onOpen={() => setOpenBotId(bot.id)} />)}
      </div>

      <SiteFooter compact />
    </div>
  );
}
