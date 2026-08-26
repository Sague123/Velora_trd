import { useBot } from "../../store/strategies";
import { useOrders, usePositions } from "../../hooks/useTrading";
import { classNames, fmtDateTime, fmtPrice, fmtSigned, fmtUsd } from "../../lib/format";
import { LoadingRow } from "../common/States";
import { IconClose, IconGrid, IconTrendDown } from "../icons/Icon";

/**
 * Everything shown here comes from the server: the bot's own row, its
 * engine-written journal, and the live orders/positions it currently holds.
 * Nothing is reconstructed from local state, so this is what the bot is
 * actually doing, not what this browser last saw it doing.
 */
export function BotDetailModal({ botId, onClose }: { botId: string; onClose: () => void }) {
  const detail = useBot(botId);
  const bot = detail.data?.bot;
  const logs = detail.data?.logs ?? [];

  const orders = useOrders("NEW", bot?.type === "GRID");
  const positions = usePositions(bot?.type === "MARTINGALE");

  const gridRows = bot?.type === "GRID"
    ? (bot.state.gridOrders ?? []).map((g) => ({ ...g, live: orders.data?.orders.find((o) => o.id === g.orderId) }))
    : [];

  const posRows = bot?.type === "MARTINGALE"
    ? (bot.state.positionIds ?? [])
        .map((id) => positions.data?.positions.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p)
    : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="anim-rise flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-bg-2/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={bot?.type === "GRID" ? "text-accent" : "text-warn"}>
              {bot?.type === "GRID" ? <IconGrid size={16} /> : <IconTrendDown size={16} />}
            </span>
            <span className="text-sm font-semibold text-txt-0">{bot?.symbol ?? "…"}</span>
            {bot && (
              <span className={classNames(
                "rounded px-1.5 py-0.5 text-2xs font-medium",
                bot.status === "RUNNING" ? "bg-buy-soft text-buy" : bot.status === "ERROR" ? "bg-sell-soft text-sell" : "bg-bg-3 text-txt-2"
              )}>
                {bot.status}
              </span>
            )}
          </div>
          <button onClick={onClose} className="btn-fx flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-txt-2 hover:text-txt-0">
            <IconClose size={12} /> Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!bot ? (
            <LoadingRow />
          ) : bot.status === "ERROR" && bot.lastError ? (
            <div className="mb-3 rounded border border-sell/40 bg-sell-soft px-3 py-2 text-2xs text-sell">
              Последняя ошибка: {bot.lastError}
            </div>
          ) : null}

          {bot?.type === "GRID" && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2 text-2xs sm:grid-cols-4">
                <div><span className="text-txt-2">Range</span><div className="tabular text-txt-0">{fmtPrice(bot.config.lower, 4)} – {fmtPrice(bot.config.upper, 4)}</div></div>
                <div><span className="text-txt-2">Levels</span><div className="tabular text-txt-0">{bot.config.levels}</div></div>
                <div><span className="text-txt-2">Qty/level</span><div className="tabular text-txt-0">{bot.config.qtyPerLevel}</div></div>
                <div><span className="text-txt-2">Leverage</span><div className="tabular text-txt-0">{bot.config.leverage}x</div></div>
              </div>
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">
                Grid Orders ({gridRows.length})
              </div>
              {orders.isLoading && <LoadingRow />}
              {gridRows.length === 0 ? (
                <div className="py-4 text-center text-2xs text-txt-3">Сетка ещё не выставлена — запустите бота.</div>
              ) : (
                <table className="w-full text-2xs">
                  <thead>
                    <tr className="border-b border-line-soft text-left text-txt-3">
                      <th className="px-2 py-1.5">Level</th>
                      <th className="px-2 py-1.5">Side</th>
                      <th className="px-2 py-1.5 text-right">Price</th>
                      <th className="px-2 py-1.5">Order Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gridRows.map((g) => (
                      <tr key={g.orderId} className="border-b border-line-soft/60 tabular">
                        <td className="px-2 py-1.5">{g.level}</td>
                        <td className="px-2 py-1.5">
                          <span className={classNames("rounded px-1 py-0.5 font-medium", g.side === "BUY" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>{g.side}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right">{fmtPrice(g.price, 4)}</td>
                        <td className="px-2 py-1.5">
                          {g.live ? (
                            <span className="rounded bg-accent-soft px-1 py-0.5 text-accent">resting</span>
                          ) : (
                            <span className="rounded bg-buy-soft px-1 py-0.5 text-buy">filled/gone</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {bot?.type === "MARTINGALE" && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2 text-2xs sm:grid-cols-4">
                <div><span className="text-txt-2">Direction</span><div className={bot.config.side === "BUY" ? "text-buy" : "text-sell"}>{bot.config.side === "BUY" ? "Long" : "Short"}</div></div>
                <div><span className="text-txt-2">Base × Mult</span><div className="tabular text-txt-0">{bot.config.baseQty} × {bot.config.multiplier}</div></div>
                <div><span className="text-txt-2">Step</span><div className="tabular text-txt-0">{bot.state.step ?? 0} / {bot.config.maxSteps}</div></div>
                <div><span className="text-txt-2">TP / DD</span><div className="tabular text-txt-0">{bot.config.takeProfitPct}% / -{bot.config.addOnDrawdownPct}%</div></div>
              </div>
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">
                Group Positions ({bot.state.positionIds?.length ?? 0})
              </div>
              {positions.isLoading && <LoadingRow />}
              {posRows.length === 0 ? (
                <div className="py-4 text-center text-2xs text-txt-3">Нет открытых позиций в этой группе.</div>
              ) : (
                <table className="w-full text-2xs">
                  <thead>
                    <tr className="border-b border-line-soft text-left text-txt-3">
                      <th className="px-2 py-1.5">Entry</th>
                      <th className="px-2 py-1.5 text-right">Mark</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5 text-right">Margin</th>
                      <th className="px-2 py-1.5 text-right">uPnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posRows.map((p) => (
                      <tr key={p.id} className="border-b border-line-soft/60 tabular">
                        <td className="px-2 py-1.5">{fmtPrice(p.entryPrice, 4)}</td>
                        <td className="px-2 py-1.5 text-right">{fmtPrice(p.markPrice, 4)}</td>
                        <td className="px-2 py-1.5 text-right">{p.qty}</td>
                        <td className="px-2 py-1.5 text-right">{fmtUsd(p.margin)}</td>
                        <td className={classNames("px-2 py-1.5 text-right font-medium", Number(p.unrealisedPnl) >= 0 ? "text-buy" : "text-sell")}>{fmtSigned(p.unrealisedPnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          <div className="mt-4 mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">
            Activity Log ({logs.length})
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded border border-line-soft bg-bg-2/30 p-2">
            {logs.length === 0 && <div className="text-2xs text-txt-3">Журнал пуст.</div>}
            {logs.map((l, i) => (
              <div key={`${l.ts}-${i}`} className="text-2xs text-txt-2">
                <span className="tabular text-txt-3">{fmtDateTime(l.ts)}</span> — {l.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
