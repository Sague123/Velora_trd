import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../store/auth";
import { useBots, useStopBot } from "../../store/strategies";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { IconBot } from "../icons/Icon";

/**
 * A running bot places real orders on the trader's account on the server's
 * schedule — now genuinely around the clock, not just while a tab happens to
 * be open. That makes it easier, not harder, to forget one is running, so this
 * banner sits on every page for as long as the account has a bot RUNNING, with
 * a one-click way to stop them all.
 */
export function ActiveBotsBanner() {
  const user = useAuthStore((s) => s.user);
  const { data } = useBots(!!user);
  const stop = useStopBot();
  const [stopping, setStopping] = useState(false);

  const running = (data?.bots ?? []).filter((b) => b.status === "RUNNING");
  const errored = (data?.bots ?? []).filter((b) => b.status === "ERROR");

  if (running.length === 0 && errored.length === 0) return null;

  async function stopAll() {
    setStopping(true);
    try {
      for (const bot of running) await stop.mutateAsync(bot.id);
      toast.info(`Остановлено ботов: ${running.length}`);
    } catch (e) {
      toast.error("Не удалось остановить ботов", e instanceof ApiError ? e.message : undefined);
    } finally {
      setStopping(false);
    }
  }

  if (running.length === 0) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-sell/40 bg-sell-soft px-3 py-1.5 text-2xs text-sell">
        <IconBot size={13} />
        <span className="font-medium">
          {errored.length === 1 ? "Бот остановлен из-за ошибки" : `Ботов с ошибкой: ${errored.length}`}{" "}
          ({errored.map((b) => b.symbol).join(", ")})
        </span>
        <Link to="/strategies" className="ml-auto underline decoration-dotted hover:text-txt-0">
          Разобраться
        </Link>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-1.5 text-2xs text-warn">
      <IconBot size={13} />
      <span className="font-medium">
        {running.length === 1 ? "Активен 1 бот" : `Активно ботов: ${running.length}`}{" "}
        ({running.map((b) => b.symbol).join(", ")}) — торгует на сервере, даже если закрыть вкладку.
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
