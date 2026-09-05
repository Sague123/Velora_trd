import { useState } from "react";
import { useDeleteBot, useStartBot, useStopBot } from "../../store/strategies";
import { usePositions } from "../../hooks/useTrading";
import { classNames, fmtPrice, fmtSigned, fmtUsd } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { Tooltip } from "../common/Tooltip";
import { IconGear, IconGrid, IconPause, IconPlay, IconStop, IconTrendDown } from "../icons/Icon";
import type { Bot, Position } from "../../lib/types";

const actionCls =
  "btn-fx tap-sm flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-semibold transition-colors disabled:opacity-40";

/**
 * P&L for a martingale bot is the sum over the positions it actually holds —
 * the bot's own `state.positionIds`, not "everything open on this symbol",
 * which would sweep in the trader's manual positions too.
 *
 * A grid bot has no equivalent: its state tracks resting orders, and nothing
 * in the API attributes a filled order or a closed trade back to the bot that
 * placed it. So grid P&L is reported as unknown rather than guessed at from
 * whatever else is open on the same symbol.
 */
function botPnl(bot: Bot, positions: Position[]): number | null {
  if (bot.type !== "MARTINGALE") return null;
  const ids = new Set(bot.state.positionIds ?? []);
  if (ids.size === 0) return 0;
  return positions.filter((p) => ids.has(p.id)).reduce((sum, p) => sum + Number(p.unrealisedPnl), 0);
}

function StrategyCard({ bot, positions, onOpen }: { bot: Bot; positions: Position[]; onOpen: () => void }) {
  const start = useStartBot();
  const stop = useStopBot();
  const remove = useDeleteBot();
  const [armDelete, setArmDelete] = useState(false);
  const busy = start.isPending || stop.isPending || remove.isPending;
  const running = bot.status === "RUNNING";
  const pnl = botPnl(bot, positions);

  async function handleStart() {
    try {
      await start.mutateAsync(bot.id);
      toast.success("Стратегия запущена", `${bot.symbol} — торгует на сервере`);
    } catch (e) {
      toast.error("Не удалось запустить", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function handlePause() {
    try {
      await stop.mutateAsync(bot.id);
      toast.info("Стратегия на паузе", `${bot.symbol} — можно запустить снова`);
    } catch (e) {
      toast.error("Не удалось поставить на паузу", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function handleDelete() {
    if (bot.status === "RUNNING") return toast.warning("Сначала поставьте стратегию на паузу");
    if (!armDelete) {
      setArmDelete(true);
      window.setTimeout(() => setArmDelete(false), 4000);
      return;
    }
    setArmDelete(false);
    try {
      const res = await remove.mutateAsync(bot.id);
      // Martingale positions outlive their bot on purpose — the server never
      // closes a live position unasked — so say so rather than let the trader
      // find them later and wonder where they came from.
      if (res.openPositions > 0) {
        toast.warning("Стратегия удалена", `Открытых позиций осталось: ${res.openPositions} — закройте их вручную при необходимости`);
      } else {
        toast.info("Стратегия удалена", bot.symbol);
      }
    } catch (e) {
      toast.error("Не удалось удалить", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-bg-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line-soft px-3 py-2">
        <span className={bot.type === "GRID" ? "text-accent" : "text-warn"}>
          {bot.type === "GRID" ? <IconGrid size={15} /> : <IconTrendDown size={15} />}
        </span>
        <span className="text-xs font-bold text-txt-0">{bot.symbol}</span>
        <span className={classNames("rounded px-1.5 py-0.5 text-[9px] font-semibold", bot.type === "GRID" ? "bg-accent-soft text-accent" : "bg-warn/10 text-warn")}>
          {bot.type === "GRID" ? "GRID" : "MARTINGALE"}
        </span>
        <span
          className={classNames(
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold",
            running ? "bg-buy-soft text-buy" : bot.status === "ERROR" ? "bg-sell-soft text-sell" : "bg-bg-3 text-txt-2"
          )}
        >
          {running && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-buy" />}
          {running ? "Запущена" : bot.status === "ERROR" ? "Ошибка" : "На паузе"}
        </span>

        <span className="ml-auto text-right">
          <span className="block text-[9px] uppercase tracking-wide text-txt-3">P&amp;L</span>
          {pnl === null ? (
            <Tooltip label="API не связывает исполненные ордера сетки с ботом, который их выставил, поэтому P&L сетки здесь не посчитать — он виден в общем списке сделок на вкладке History.">
              <span className="block cursor-help tabular text-xs font-semibold text-txt-3">—</span>
            </Tooltip>
          ) : (
            <span className={classNames("block tabular text-xs font-semibold", pnl > 0 ? "text-buy" : pnl < 0 ? "text-sell" : "text-txt-1")}>
              {fmtSigned(pnl)}
            </span>
          )}
        </span>
      </div>

      {bot.status === "ERROR" && bot.lastError && (
        <div className="border-b border-line-soft bg-sell-soft px-3 py-1.5 text-2xs text-sell">{bot.lastError}</div>
      )}

      <div className="grid grid-cols-2 gap-2 px-3 py-2 text-2xs sm:grid-cols-4">
        {bot.type === "GRID" ? (
          <>
            <div><span className="text-txt-3">Диапазон </span><span className="tabular text-txt-1">{fmtPrice(bot.config.lower, 2)} – {fmtPrice(bot.config.upper, 2)}</span></div>
            <div><span className="text-txt-3">Levels </span><span className="tabular text-txt-1">{bot.config.levels}</span></div>
            <div><span className="text-txt-3">Ордеров в сетке </span><span className="tabular text-txt-1">{bot.state.gridOrders?.length ?? 0}</span></div>
            <div><span className="text-txt-3">Капитал </span><span className="tabular text-txt-1">{bot.estimatedCapital ? fmtUsd(bot.estimatedCapital) : "—"}</span></div>
          </>
        ) : (
          <>
            <div><span className="text-txt-3">Направление </span><span className={bot.config.side === "BUY" ? "text-buy" : "text-sell"}>{bot.config.side === "BUY" ? "Long" : "Short"}</span></div>
            <div><span className="text-txt-3">Шаг серии </span><span className="tabular text-txt-1">{bot.state.step ?? 0} / {bot.config.maxSteps}</span></div>
            <div><span className="text-txt-3">Позиций </span><span className="tabular text-txt-1">{bot.state.positionIds?.length ?? 0}</span></div>
            <div><span className="text-txt-3">TP / Докупка </span><span className="tabular text-txt-1">{bot.config.takeProfitPct}% / −{bot.config.addOnDrawdownPct}%</span></div>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-line-soft px-3 py-2">
        {running ? (
          <button onClick={handlePause} disabled={busy} className={classNames(actionCls, "border-warn/50 text-warn hover:bg-warn/10")}>
            <IconPause size={11} /> Пауза
          </button>
        ) : (
          <button onClick={handleStart} disabled={busy} className={classNames(actionCls, "border-buy/50 text-buy hover:bg-buy-soft")}>
            <IconPlay size={11} /> Запустить
          </button>
        )}
        <button onClick={onOpen} className={classNames(actionCls, "border-line text-txt-2 hover:text-txt-0")}>
          <IconGear size={11} /> Настройки
        </button>
        {/* "Стоп" removes the strategy — the engine only knows running and
            stopped, so pause above is the reversible one and this is the
            terminal action. Named plainly and armed twice for that reason. */}
        <button onClick={handleDelete} disabled={busy} className={classNames(actionCls, "ml-auto border-line text-txt-3 hover:border-sell/50 hover:text-sell")}>
          <IconStop size={11} /> {armDelete ? "Точно удалить?" : "Стоп и удалить"}
        </button>
      </div>
    </div>
  );
}

/**
 * "My Strategies" — what's already running, above the form for starting
 * something new. Renders nothing at all when the trader has no bots yet:
 * an empty box saying "no bots" directly above the thing that creates one
 * is a row of chrome telling you what you can already see.
 */
export function StrategyDashboard({ bots, onOpen }: { bots: Bot[]; onOpen: (id: string) => void }) {
  const hasMartingale = bots.some((b) => b.type === "MARTINGALE");
  const { data } = usePositions(hasMartingale);
  const positions = data?.positions ?? [];

  if (bots.length === 0) return null;

  const running = bots.filter((b) => b.status === "RUNNING").length;

  return (
    <section className="anim-rise mb-4">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h2 className="text-2xs font-semibold uppercase tracking-wide text-txt-2">Мои стратегии</h2>
        <span className="text-2xs text-txt-3">
          {running > 0 ? `${running} из ${bots.length} запущено` : `${bots.length} на паузе`}
        </span>
      </div>
      <div className="space-y-2">
        {bots.map((bot) => (
          <StrategyCard key={bot.id} bot={bot} positions={positions} onOpen={() => onOpen(bot.id)} />
        ))}
      </div>
    </section>
  );
}
