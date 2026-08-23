import { useState } from "react";
import { Link } from "react-router-dom";
import { useStrategiesStore } from "../../store/strategies";
import { stopBot } from "../../lib/strategyEngine";
import { toast } from "../../store/toast";
import { IconBot } from "../icons/Icon";

/**
 * A bot only trades while its tab is open — which means it's easy to leave
 * one running in a background tab and forget about it entirely, only to see
 * mystery positions appear later. This banner is visible on every page,
 * everywhere in the app, whenever this browser has a bot RUNNING, precisely
 * so that can't happen silently again.
 */
export function ActiveBotsBanner() {
  const bots = useStrategiesStore((s) => s.bots);
  const [stopping, setStopping] = useState(false);
  const running = Object.values(bots).filter((b) => b.status === "RUNNING");

  if (running.length === 0) return null;

  async function stopAll() {
    setStopping(true);
    try {
      for (const bot of running) await stopBot(bot);
      toast.info(`Остановлено ботов: ${running.length}`);
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-1.5 text-2xs text-warn">
      <IconBot size={13} />
      <span className="font-medium">
        {running.length === 1 ? "Активен 1 бот" : `Активно ботов: ${running.length}`} ({running.map((b) => b.symbol).join(", ")}) — торгует прямо сейчас, пока открыта эта вкладка.
      </span>
      <Link to="/strategies" className="ml-auto underline decoration-dotted hover:text-txt-0">
        Открыть
      </Link>
      <button
        onClick={stopAll}
        disabled={stopping}
        className="btn-fx rounded border border-warn/50 px-2 py-0.5 font-medium hover:bg-warn/20 disabled:opacity-50"
      >
        {stopping ? "…" : "Остановить все"}
      </button>
    </div>
  );
}
