import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBots, useCreateBot, useStartBot } from "../store/strategies";
import type { CreateBotInput, OrderSide, Timeframe } from "../lib/types";
import { useChartBars, useInstruments } from "../hooks/useMarket";
import { useLiveInstrument } from "../hooks/useLivePrices";
import { useAccount } from "../hooks/useTrading";
import { suggestGrid, estimateGridBacktest } from "../lib/gridSuggestion";
import { GridPreviewChart } from "../components/strategies/GridPreviewChart";
import { AssetSelect } from "../components/strategies/AssetSelect";
import { RiskProfileCards } from "../components/strategies/RiskProfileCards";
import { StrategyDashboard } from "../components/strategies/StrategyDashboard";
import { BotDetailModal } from "../components/strategies/BotDetailModal";
import {
  gridConfigFromDraft, gridDraftFromPreset, gridPreset,
  martingaleConfigFromDraft, martingaleDraftFromPreset, martingalePreset, martingaleWorstCase,
  type GridDraft, type MartingaleDraft, type RiskKey,
} from "../components/strategies/presets";
import { classNames, fmt, fmtUsd, n } from "../lib/format";
import { toast } from "../store/toast";
import {
  IconChevron, IconCollapse, IconExpand, IconFlask, IconGrid, IconServer,
  IconSliders, IconTarget, IconTrendDown, IconTrendUp, IconWarning,
} from "../components/icons/Icon";
import { ApiError } from "../lib/api";
import { SiteFooter } from "../components/layout/SiteFooter";

const inputCls = "w-full rounded border border-line bg-bg-2 px-2 py-1.5 text-xs tabular outline-none focus:border-accent transition-colors";
const labelCls = "mb-1 block text-2xs font-medium text-txt-2";
const PREVIEW_TFS: Timeframe[] = ["15m", "1H", "4H", "1D"];

/** "1 докупка / 3 докупки / 8 докупок" — Russian needs all three forms, and
 * the count here is user-chosen (1-10), so every one of them shows up. */
function safetyOrders(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} докупка`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} докупки`;
  return `${n} докупок`;
}

function SectionLabel({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-bg-3 text-[9px] text-txt-2">{step}</span>
      {children}
    </div>
  );
}

/**
 * Strategies: pick a bot type, an instrument and a risk profile, say how much
 * to put in, and start — with the full technical form still there behind
 * "Настроить вручную" for anyone who wants to set every field themselves.
 *
 * The preset cards and the manual form are the same state: choosing a profile
 * seeds the draft, and every field stays editable afterwards. The draft is
 * what the preview chart draws and what gets sent to the server, so what you
 * see on the chart is what the bot will actually place.
 */
export function StrategiesPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useBots();
  const create = useCreateBot();
  const start = useStartBot();
  const { data: account } = useAccount(true);
  const { data: instrumentsData } = useInstruments();

  const [botType, setBotType] = useState<"GRID" | "MARTINGALE">("GRID");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [risk, setRisk] = useState<RiskKey>("balanced");
  const [capital, setCapital] = useState("1000");
  const [side, setSide] = useState<OrderSide>("BUY");
  const [chartOpen, setChartOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("1H");
  const [openBotId, setOpenBotId] = useState<string | null>(null);

  const bots = data?.bots ?? [];
  const inst = useLiveInstrument(symbol);
  const price = n(inst?.livePrice ?? 0);
  const capitalNum = Number(capital) || 0;
  const maxLeverage = instrumentsData?.instruments.find((i) => i.symbol === symbol)?.maxLeverage ?? 1;

  const [gridDraft, setGridDraft] = useState<GridDraft>(() => gridDraftFromPreset(gridPreset("balanced"), 0, 0));
  const [martDraft, setMartDraft] = useState<MartingaleDraft>(() => martingaleDraftFromPreset(martingalePreset("balanced"), 0, 0, "BUY"));

  // Seed the form from the chosen profile once per (type, profile, symbol,
  // amount, direction) — deliberately *not* on every price tick, which would
  // rewrite fields under the trader's cursor several times a second. A ref
  // keyed on that combination lets the first tick with a real price seed the
  // draft, and leaves every later tick alone.
  const seedKey = `${botType}:${risk}:${symbol}:${capitalNum}:${side}`;
  const seededRef = useRef("");
  useEffect(() => {
    if (!(price > 0) || seededRef.current === seedKey) return;
    seededRef.current = seedKey;
    setGridDraft(gridDraftFromPreset(gridPreset(risk), price, capitalNum));
    setMartDraft(martingaleDraftFromPreset(martingalePreset(risk), price, capitalNum, side));
  }, [seedKey, price, risk, capitalNum, side, botType]);

  const gridConfig = useMemo(() => gridConfigFromDraft(gridDraft), [gridDraft]);
  const martConfig = useMemo(() => martingaleConfigFromDraft(martDraft), [martDraft]);
  const worstCase = useMemo(() => martingaleWorstCase(martDraft, price), [martDraft, price]);

  // ---- Grid extras that already existed and stay: ATR suggestion + backtest
  const { data: chartData } = useChartBars(symbol, inst?.category, timeframe);
  const suggestion = useMemo(() => (chartData?.bars.length ? suggestGrid(chartData.bars) : null), [chartData]);
  const backtest = useMemo(() => {
    const lo = Number(gridDraft.lower), hi = Number(gridDraft.upper);
    const lv = Math.max(1, Math.trunc(Number(gridDraft.levels)) || 1), qty = Number(gridDraft.qtyPerLevel);
    if (botType !== "GRID" || !chartData?.bars.length || !(hi > lo) || !(qty > 0)) return null;
    return estimateGridBacktest(chartData.bars, lo, hi, lv, qty);
  }, [botType, chartData, gridDraft]);

  function applySuggestion() {
    if (!suggestion) return toast.warning("Недостаточно свечей для расчёта — попробуйте другой символ");
    setGridDraft((d) => ({ ...d, lower: suggestion.lower.toFixed(8), upper: suggestion.upper.toFixed(8), levels: String(suggestion.levels) }));
    toast.info("Диапазон предложен по ATR(14)", `±2.5×ATR вокруг текущей цены ${suggestion.price.toFixed(inst?.priceDecimals ?? 2)}`);
  }

  const leverageNum = Math.max(1, Math.trunc(Number(botType === "GRID" ? gridDraft.leverage : martDraft.leverage)) || 1);
  const leverageTooHigh = leverageNum > maxLeverage;
  const config = botType === "GRID" ? gridConfig : martConfig;
  const canStart = !!config && capitalNum > 0 && !leverageTooHigh && !create.isPending && !start.isPending;

  async function handleStart(e: FormEvent) {
    e.preventDefault();
    if (!config) return toast.warning("Проверьте параметры стратегии — не все значения заполнены");
    const input = { type: botType, symbol, config } as CreateBotInput;
    try {
      const { bot } = await create.mutateAsync(input);
      // "Start Auto Trading" says it starts trading, so it does both steps —
      // the bot is created stopped and then started, rather than leaving the
      // trader to find a second button for the half the label promised.
      try {
        await start.mutateAsync(bot.id);
        toast.success("Стратегия запущена", `${botType === "GRID" ? "Grid" : "Martingale"} ${symbol} — торгует на сервере`);
      } catch (e) {
        toast.warning("Стратегия создана, но не запустилась", e instanceof ApiError ? e.message : "Запустите её вручную из списка выше");
      }
    } catch (e) {
      toast.error("Не удалось создать стратегию", e instanceof ApiError ? e.message : undefined);
    }
  }

  const activeGrid = gridPreset(risk);
  const activeMart = martingalePreset(risk);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1700px] flex-col overflow-y-auto p-3">
      {openBotId && <BotDetailModal botId={openBotId} onClose={() => setOpenBotId(null)} />}

      {/* One centred column at every width. The old three-pane desktop layout
          (coin list | chart | form) can't express "these steps happen in this
          order", which is the whole point of the new structure — so the flow
          reads the same on a phone and on a monitor, just wider. */}
      <div className="mx-auto w-full max-w-[780px] lg:max-w-[880px]">
        <div className="anim-rise mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-sm font-semibold text-txt-0">{t("strategies.title")}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-2xs font-medium text-accent">
              <IconServer size={12} /> Работают на сервере
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-2xs font-medium text-warn">
              <IconFlask size={12} /> Тестовый режим
            </span>
          </div>
        </div>

        {/* ---- 8. Running strategies, above the form that creates new ones ---- */}
        {isLoading && bots.length === 0 && (
          <div className="mb-4 rounded-lg border border-line bg-bg-1 px-3 py-6 text-center text-2xs text-txt-3">Загрузка стратегий…</div>
        )}
        <StrategyDashboard bots={bots} onOpen={setOpenBotId} />

        <form onSubmit={handleStart} className="anim-rise-2 rounded-lg border border-line bg-bg-1 p-3.5">
          <h2 className="mb-3 text-xs font-semibold text-txt-0">Новая стратегия</h2>

          {/* ---- 1. Bot type — two tabs of equal weight ---- */}
          <SectionLabel step={1}>Тип бота</SectionLabel>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {([
              { key: "GRID" as const, label: "Grid Bot", Icon: IconGrid, hint: "Заработок на колебаниях в диапазоне" },
              { key: "MARTINGALE" as const, label: "Martingale Bot", Icon: IconTrendDown, hint: "Усреднение против движения" },
            ]).map(({ key, label, Icon, hint }) => (
              <button
                key={key}
                type="button"
                onClick={() => setBotType(key)}
                aria-pressed={botType === key}
                className={classNames(
                  "btn-fx tap flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                  botType === key ? "glow-accent border-accent bg-accent-fill text-white" : "border-line bg-bg-2/40 text-txt-2 hover:border-accent/40 hover:text-txt-0"
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-bold"><Icon size={14} /> {label}</span>
                <span className={classNames("text-[9px] leading-tight", botType === key ? "text-white/75" : "text-txt-3")}>{hint}</span>
              </button>
            ))}
          </div>

          {/* ---- 2. Instrument ---- */}
          <SectionLabel step={2}>Инструмент</SectionLabel>
          <div className="mb-3">
            <AssetSelect value={symbol} onChange={setSymbol} />
          </div>

          {/* ---- 3. Grid preview, expandable ---- */}
          {botType === "GRID" && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setChartOpen((v) => !v)}
                aria-expanded={chartOpen}
                className="btn-fx tap-sm flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-bg-2/40 px-3 py-2 text-2xs font-medium text-txt-2 hover:text-txt-0"
              >
                {chartOpen ? <IconCollapse size={12} /> : <IconExpand size={12} />}
                {chartOpen ? "Свернуть график сетки" : "Развернуть график — посмотреть, как расставится сетка"}
              </button>

              {chartOpen && (
                <div className="mt-2">
                  <div className="mb-1.5 flex items-center justify-between">
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
                  {/* Lines come from the live draft, so they move with the
                      chosen profile and with any manual edit to the range. */}
                  <div className="h-64">
                    <GridPreviewChart
                      symbol={symbol}
                      timeframe={timeframe}
                      lower={Number(gridDraft.lower) || 0}
                      upper={Number(gridDraft.upper) || 0}
                      levels={Math.max(1, Math.trunc(Number(gridDraft.levels)) || 1)}
                    />
                  </div>
                  <div className="mt-1 text-[9px] text-txt-3">
                    {gridConfig
                      ? `${Number(gridDraft.levels) + 1} ордеров между ${fmt(Number(gridDraft.lower), 2)} и ${fmt(Number(gridDraft.upper), 2)} — равномерный шаг`
                      : "Заполните диапазон, чтобы увидеть сетку"}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---- 4. Risk profiles with their real numbers ---- */}
          <SectionLabel step={3}>
            Профиль риска — {botType === "GRID" ? "Grid Bot" : "Martingale Bot"}
          </SectionLabel>
          <div className="mb-3">
            <RiskProfileCards botType={botType} value={risk} onChange={setRisk} />
          </div>

          {botType === "MARTINGALE" && (
            <div className="mb-3">
              <span className={labelCls}>Направление</span>
              <div className="flex gap-1 rounded-lg border border-line bg-bg-2/40 p-0.5">
                {([["BUY", "Long"], ["SELL", "Short"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSide(v)}
                    aria-pressed={side === v}
                    className={classNames(
                      "btn-fx tap-sm flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors",
                      side === v ? (v === "BUY" ? "bg-buy-fill text-black" : "bg-sell-fill text-white") : "text-txt-2 hover:text-txt-0"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ---- 5. Amount — the headline field ---- */}
          <SectionLabel step={4}>Сколько вложить</SectionLabel>
          <div className="mb-1 flex items-center gap-2 rounded-xl border border-line bg-bg-2 px-3 py-2.5 focus-within:border-accent">
            <span className="text-base text-txt-3">$</span>
            <input
              value={capital}
              onChange={(e) => setCapital(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              aria-label="Сколько вложить"
              className="min-w-0 flex-1 border-0 bg-transparent text-xl font-bold tabular text-txt-0 outline-none"
            />
            {account && (
              <button
                type="button"
                onClick={() => setCapital(String(Math.floor(n(account.cash))))}
                className="btn-fx shrink-0 rounded-lg border border-line px-2 py-1 text-2xs text-txt-2 hover:text-txt-0"
              >
                Max
              </button>
            )}
          </div>
          <div className="mb-3 flex flex-wrap justify-between gap-x-3 text-2xs text-txt-3">
            <span>Доступно: <span className="tabular text-txt-1">{account ? fmtUsd(account.cash) : "—"}</span></span>
            {botType === "GRID" && gridConfig && (
              <span>Плечо {gridDraft.leverage}x · {Number(gridDraft.levels) + 1} ордеров</span>
            )}
            {botType === "MARTINGALE" && worstCase && (
              <span>Если сработают все {safetyOrders(worstCase.steps)}: <span className="tabular text-warn">{fmtUsd(worstCase.margin)}</span></span>
            )}
          </div>

          {/* The real bound on a martingale's downside: the series is finite
              because maxSteps is. Spelled out in money, because "8 safety
              orders at 2x" is not a number anyone can feel. */}
          {botType === "MARTINGALE" && worstCase && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-2 text-2xs text-warn">
              <IconWarning size={13} className="mt-0.5 shrink-0" />
              <span>
                Полная серия — {safetyOrders(worstCase.steps)}, вместе {fmt(worstCase.totalQty, 6)} {symbol.replace(/USDT|USDC|-PERP/g, "")} на{" "}
                {fmtUsd(worstCase.notional)} (маржа {fmtUsd(worstCase.margin)}). Это и есть предел: стоп-лосса у бота нет, серию
                ограничивает только число докупок.
                {worstCase.margin > n(account?.cash ?? 0) && " Полная серия не поместится в текущий баланс — часть докупок не пройдёт."}
              </span>
            </div>
          )}

          {backtest && (
            <div className="mb-3 rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-2 text-2xs">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-accent"><IconTrendUp size={13} /> Бэктест на истории ({fmt(backtest.days, 0)}д свечей {timeframe})</div>
              <div className="flex justify-between text-txt-2"><span>Пересечений уровней</span><span className="tabular text-txt-1">{backtest.cycles}</span></div>
              <div className="flex justify-between text-txt-2"><span>Валовая прибыль за период</span><span className={classNames("tabular font-medium", backtest.grossProfit >= 0 ? "text-buy" : "text-sell")}>{fmtUsd(backtest.grossProfit)}</span></div>
              <div className="mt-1 text-2xs text-txt-3">По факту пересечений уровней в реальных свечах, без комиссий — не гарантия будущей доходности.</div>
            </div>
          )}

          {leverageTooHigh && (
            <div className="mb-3 rounded-lg border border-sell/40 bg-sell-soft px-2.5 py-2 text-2xs text-sell">
              Плечо {leverageNum}x выше максимального для {symbol} ({maxLeverage}x) — уменьшите его в ручных настройках.
            </div>
          )}

          {/* ---- 6. The one primary action ---- */}
          <button
            type="submit"
            disabled={!canStart}
            className="btn-fx tap mb-2 w-full rounded-xl bg-accent-fill py-3 text-sm font-bold text-white shadow-btn transition-[background-color,box-shadow] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {create.isPending || start.isPending ? "Запуск…" : "Start Auto Trading"}
          </button>

          {/* ---- 7. Manual settings — same fields as before, prefilled ---- */}
          <button
            type="button"
            onClick={() => setManualOpen((v) => !v)}
            aria-expanded={manualOpen}
            className="btn-fx tap flex w-full items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-txt-2 hover:text-txt-0"
          >
            <IconSliders size={13} />
            Настроить вручную — все параметры {botType === "GRID" ? "Grid Bot" : "Martingale Bot"}
            <IconChevron size={12} direction={manualOpen ? "up" : "down"} />
          </button>

          {manualOpen && (
            <div className="mt-2 rounded-lg border border-line-soft bg-bg-2/30 p-3">
              <p className="mb-2.5 text-2xs text-txt-3">
                Предзаполнено пресетом «{botType === "GRID" ? activeGrid.label : activeMart.label}» и суммой {fmtUsd(capitalNum)} — меняйте что угодно.
                Смена профиля или суммы перезаполнит поля заново.
              </p>

              {botType === "GRID" ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={applySuggestion}
                    disabled={!suggestion}
                    className="btn-fx flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-semibold text-accent hover:brightness-110 disabled:opacity-40"
                  >
                    <IconTarget size={14} /> Suggest Range (ATR volatility)
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className={labelCls}>Lower Price</span>
                      <input value={gridDraft.lower} onChange={(e) => setGridDraft((d) => ({ ...d, lower: e.target.value }))} inputMode="decimal" className={inputCls} /></label>
                    <label className="block"><span className={labelCls}>Upper Price</span>
                      <input value={gridDraft.upper} onChange={(e) => setGridDraft((d) => ({ ...d, upper: e.target.value }))} inputMode="decimal" className={inputCls} /></label>
                    <label className="block"><span className={labelCls}>Grid Levels</span>
                      <input value={gridDraft.levels} onChange={(e) => setGridDraft((d) => ({ ...d, levels: e.target.value }))} inputMode="numeric" className={inputCls} /></label>
                    <label className="block"><span className={labelCls}>Qty per Level</span>
                      <input value={gridDraft.qtyPerLevel} onChange={(e) => setGridDraft((d) => ({ ...d, qtyPerLevel: e.target.value }))} inputMode="decimal" className={inputCls} /></label>
                    <label className="block"><span className={labelCls}>Leverage</span>
                      <input value={gridDraft.leverage} onChange={(e) => setGridDraft((d) => ({ ...d, leverage: e.target.value }))} inputMode="numeric" className={inputCls} /></label>
                  </div>
                  {!gridConfig && <div className="text-2xs text-sell">Нужны положительный диапазон (верх выше низа), минимум 2 уровня и объём на уровень.</div>}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className={labelCls}>Base Order Size</span>
                      <input value={martDraft.baseQty} onChange={(e) => setMartDraft((d) => ({ ...d, baseQty: e.target.value }))} inputMode="decimal" className={inputCls} /></label>
                    <label className="block"><span className={labelCls}>Safety Order Multiplier</span>
                      <input value={martDraft.multiplier} onChange={(e) => setMartDraft((d) => ({ ...d, multiplier: e.target.value }))} inputMode="decimal" className={inputCls} /></label>
                    {/* Required, and enforced by the server too (1-10): this is
                        the only thing that actually bounds the series. */}
                    <label className="block">
                      <span className={labelCls}>Max Safety Orders <span className="text-sell">*</span></span>
                      <input
                        value={martDraft.maxSteps}
                        onChange={(e) => setMartDraft((d) => ({ ...d, maxSteps: e.target.value.replace(/[^0-9]/g, "") }))}
                        inputMode="numeric"
                        required
                        className={classNames(inputCls, !(Math.trunc(Number(martDraft.maxSteps)) >= 1) && "border-sell")}
                      />
                    </label>
                    <label className="block"><span className={labelCls}>Price Deviation % (ROE)</span>
                      <input value={martDraft.addOnDrawdownPct} onChange={(e) => setMartDraft((d) => ({ ...d, addOnDrawdownPct: e.target.value }))} inputMode="decimal" className={inputCls} /></label>
                    <label className="block"><span className={labelCls}>Take Profit % (ROE)</span>
                      <input value={martDraft.takeProfitPct} onChange={(e) => setMartDraft((d) => ({ ...d, takeProfitPct: e.target.value }))} inputMode="decimal" className={inputCls} /></label>
                    <label className="block"><span className={labelCls}>Leverage</span>
                      <input value={martDraft.leverage} onChange={(e) => setMartDraft((d) => ({ ...d, leverage: e.target.value }))} inputMode="numeric" className={inputCls} /></label>
                  </div>
                  <div className="rounded border border-line-soft bg-bg-3/40 px-2.5 py-2 text-[9px] leading-snug text-txt-3">
                    Take Profit и Price Deviation движок считает в ROE, поэтому пресеты идут на 1x — там ROE совпадает с движением цены.
                    На большем плече те же проценты сработают при меньшем движении.
                    <br />
                    Stop-Loss в форме нет: движок ботов его не исполняет, и поле, которое ни на что не влияет, было бы хуже его отсутствия.
                    Ограничение серии — Max Safety Orders выше.
                  </div>
                  {!martConfig && <div className="text-2xs text-sell">Нужны объём базового ордера, множитель больше 1, минимум одна докупка и положительные TP/Deviation.</div>}
                </div>
              )}
            </div>
          )}
        </form>

        <SiteFooter compact />
      </div>
    </div>
  );
}
