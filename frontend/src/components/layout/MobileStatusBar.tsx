import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../store/auth";
import { useBots, useStopBot } from "../../store/strategies";
import { apiPost, ApiError } from "../../lib/api";
import { toast } from "../../store/toast";
import { classNames } from "../../lib/format";
import { Popover } from "../common/Popover";
import { IconBot, IconShield } from "../icons/Icon";

/**
 * Mobile's replacement for EmailVerificationBanner + ActiveBotsBanner: the
 * same two pieces of real state (a running/errored bot, an unverified
 * address), as two small icon buttons sitting right in TopBar's own top row
 * (next to language/theme) rather than a full-width text banner permanently
 * eating a row of its own above the chart. Detail and actions open on tap,
 * in place. Renders nothing when there is nothing to report. Desktop keeps
 * the original full banners (see App.tsx) since it has the width to spare.
 */
export function MobileStatusBar() {
  const user = useAuthStore((s) => s.user);
  const { data } = useBots(!!user);
  const stop = useStopBot();
  const [stopping, setStopping] = useState(false);
  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const running = (data?.bots ?? []).filter((b) => b.status === "RUNNING");
  const errored = (data?.bots ?? []).filter((b) => b.status === "ERROR");
  const hasBots = running.length > 0 || errored.length > 0;
  const unverified = !!user && user.emailVerified === false && !verifyDismissed;

  if (!hasBots && !unverified) return null;

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

  async function resendVerification() {
    setBusy(true);
    try {
      const res = await apiPost<{ alreadyVerified: boolean }>("/api/auth/resend-verification");
      toast.info(
        res.alreadyVerified ? "Адрес уже подтверждён" : "Письмо отправлено",
        res.alreadyVerified ? undefined : user?.email
      );
      if (res.alreadyVerified) setVerifyDismissed(true);
    } catch (e) {
      toast.error("Не удалось отправить письмо", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const iconBtnCls =
    "tap-sm relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-lift " +
    "transition-transform duration-100 active:scale-95";

  return (
    <>
      {hasBots && (
        <Popover
          align="right"
          trigger={(open, toggle) => (
            <button
              onClick={toggle}
              className={classNames(
                iconBtnCls,
                errored.length > 0
                  ? "border-sell/50 bg-sell-soft text-sell"
                  : open
                    ? "border-warn/60 bg-warn/20 text-warn"
                    : "border-warn/40 bg-warn/10 text-warn"
              )}
            >
              <IconBot size={17} />
              <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-current px-0.5 text-[9px] font-bold text-bg-0">
                {errored.length > 0 ? errored.length : running.length}
              </span>
            </button>
          )}
        >
          {(close) => (
            <div className="w-64 p-2.5 text-xs">
              {errored.length > 0 && (
                <div className="mb-2">
                  <div className="mb-1 font-medium text-sell">
                    {errored.length === 1 ? "Бот остановлен из-за ошибки" : `Ботов с ошибкой: ${errored.length}`}
                  </div>
                  <div className="text-2xs text-txt-2">{errored.map((b) => b.symbol).join(", ")}</div>
                </div>
              )}
              {running.length > 0 && (
                <div>
                  <div className="mb-1 font-medium text-warn">
                    {running.length === 1 ? "Активен 1 бот" : `Активно ботов: ${running.length}`}
                  </div>
                  <div className="text-2xs text-txt-2">
                    {running.map((b) => b.symbol).join(", ")} — торгует на сервере, даже если закрыть вкладку.
                  </div>
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <Link to="/strategies" onClick={close} className="btn-fx tap-sm flex-1 rounded-lg border border-line text-center text-2xs font-medium text-txt-1 hover:border-accent hover:text-accent">
                  Открыть
                </Link>
                {running.length > 0 && (
                  <button
                    onClick={stopAll}
                    disabled={stopping}
                    className="btn-fx tap-sm flex-1 rounded-lg border border-warn/50 text-2xs font-medium text-warn hover:bg-warn/20 disabled:opacity-50"
                  >
                    {stopping ? "…" : "Остановить все"}
                  </button>
                )}
              </div>
            </div>
          )}
        </Popover>
      )}

      {unverified && (
        <Popover
          align="right"
          trigger={(open, toggle) => (
            <button
              onClick={toggle}
              className={classNames(iconBtnCls, open ? "border-accent/70 bg-accent-soft text-accent" : "border-accent/40 bg-accent-soft/70 text-accent")}
            >
              <IconShield size={17} />
            </button>
          )}
        >
          {(close) => (
            <div className="w-64 p-2.5 text-xs">
              <div className="mb-1.5 font-medium text-txt-0">Email не подтверждён</div>
              <p className="mb-2 text-2xs text-txt-2">
                Адрес {user?.email} не подтверждён — без этого не получится восстановить доступ по ссылке из почты.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={resendVerification}
                  disabled={busy}
                  className="btn-fx tap-sm flex-1 rounded-lg border border-accent/40 text-2xs font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
                >
                  {busy ? "…" : "Отправить письмо"}
                </button>
                <button
                  onClick={() => { setVerifyDismissed(true); close(); }}
                  className="btn-fx tap-sm rounded-lg border border-line px-2.5 text-2xs text-txt-2 hover:text-txt-0"
                >
                  Скрыть
                </button>
              </div>
            </div>
          )}
        </Popover>
      )}
    </>
  );
}
