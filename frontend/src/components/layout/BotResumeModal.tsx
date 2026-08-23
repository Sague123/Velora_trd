import { useState } from "react";
import type { Bot } from "../../store/strategies";
import { stopBot } from "../../lib/strategyEngine";
import { toast } from "../../store/toast";
import { IconBot, IconWarning } from "../icons/Icon";

/**
 * A GRID/MARTINGALE bot's "RUNNING" flag lives in this browser's
 * localStorage and, until now, silently resumed placing real orders the
 * instant the app loaded with no way for the user to notice beforehand —
 * the exact mechanism behind repeated "why did a trade open on its own"
 * reports. This is a blocking, undismissable gate: on every fresh app load
 * (not persisted — reappears every time on purpose) it stops the strategy
 * engine from ticking at all until the user explicitly picks Resume or
 * Stop for each bot still marked RUNNING from a previous session.
 */
export function BotResumeModal({
  bots,
  onResume,
  onStopAll,
}: {
  bots: Bot[];
  onResume: () => void;
  onStopAll: () => void;
}) {
  const [busy, setBusy] = useState<"resume" | "stop" | null>(null);

  async function handleStopAll() {
    setBusy("stop");
    try {
      for (const bot of bots) await stopBot(bot);
      toast.info(`Остановлено ботов: ${bots.length}`);
      onStopAll();
    } finally {
      setBusy(null);
    }
  }

  function handleResume() {
    setBusy("resume");
    onResume();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="anim-rise w-full max-w-md rounded-xl border border-warn/50 bg-bg-1 p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-2 text-warn">
          <IconWarning size={18} />
          <h2 className="text-sm font-semibold">
            {bots.length === 1 ? "Бот всё ещё был запущен" : `Ещё запущено ботов: ${bots.length}`}
          </h2>
        </div>
        <p className="mb-3 text-xs text-txt-2">
          При прошлом посещении {bots.length === 1 ? "этот бот" : "эти боты"} остал{bots.length === 1 ? "ся" : "ись"} в
          статусе «Запущен». Он будет и дальше автоматически выставлять реальные ордера, если вы продолжите — выберите,
          что делать.
        </p>
        <div className="mb-4 max-h-40 overflow-y-auto rounded border border-line bg-bg-2 divide-y divide-line-soft">
          {bots.map((b) => (
            <div key={b.id} className="flex items-center gap-2 px-3 py-1.5 text-2xs">
              <IconBot size={13} className="text-txt-2" />
              <span className="font-medium text-txt-0">{b.symbol}</span>
              <span className="text-txt-3">{b.type === "GRID" ? "Grid" : "Martingale"}</span>
              <span className="ml-auto text-txt-3">{b.leverage}x</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleStopAll}
            disabled={busy !== null}
            className="btn-fx flex-1 rounded border border-sell/50 bg-sell-soft py-2 text-xs font-semibold text-sell hover:bg-sell/20 disabled:opacity-50"
          >
            {busy === "stop" ? "Останавливаю…" : "Остановить всё"}
          </button>
          <button
            onClick={handleResume}
            disabled={busy !== null}
            className="btn-fx flex-1 rounded border border-line bg-bg-3 py-2 text-xs font-semibold text-txt-1 hover:bg-bg-2 disabled:opacity-50"
          >
            Продолжить работу бота
          </button>
        </div>
      </div>
    </div>
  );
}
