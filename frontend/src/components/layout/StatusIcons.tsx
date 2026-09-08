import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../store/auth";
import { useBots, useStopBot } from "../../store/strategies";
import { apiPost, ApiError } from "../../lib/api";
import { toast } from "../../store/toast";
import { classNames } from "../../lib/format";
import { Popover } from "../common/Popover";
import { IconBot, IconShield } from "../icons/Icon";
import { buttonCls } from "../../lib/ui";

/**
 * Two pieces of real account state — a running/errored bot, an unverified
 * address — as small icon buttons in the header, with the detail and the
 * actions opening in place on tap. Renders nothing when there is nothing to
 * report.
 *
 * This was mobile-only, with desktop showing the same two facts as
 * full-width EmailVerificationBanner/ActiveBotsBanner rows above the page.
 * Two presentations of one state is precisely the header drift this layout
 * pass exists to remove, so the icons are what both platforms get now and
 * the banner components are gone.
 */
export function StatusIcons() {
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
              <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-current px-0.5 text-3xs font-bold text-bg-0">
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
                  className={buttonCls("secondary", "sm")}
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
