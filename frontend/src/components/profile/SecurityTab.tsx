import { FormEvent, useState } from "react";
import { useAuthStore } from "../../store/auth";
import { useKyc } from "../../hooks/useKyc";
import { apiPost, ApiError } from "../../lib/api";
import { toast } from "../../store/toast";
import { classNames, fmtDateTime } from "../../lib/format";
import { IdentityForm } from "../auth/IdentityForm";
import { LoadingRow } from "../common/States";
import type { KycStatus, TotpSetup } from "../../lib/types";
import { IconCheck, IconLock, IconWarning } from "../icons/Icon";

const inputCls = "w-full rounded border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent";
const labelCls = "mb-1 block text-2xs text-txt-2";

function Panel({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-bg-1 p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xs font-semibold text-txt-0">{title}</h2>
        {badge}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={classNames(
        "rounded px-1.5 py-0.5 text-2xs font-medium",
        tone === "ok" ? "bg-buy-soft text-buy"
          : tone === "warn" ? "bg-warn/10 text-warn"
            : tone === "bad" ? "bg-sell-soft text-sell"
              : "bg-bg-3 text-txt-2"
      )}
    >
      {children}
    </span>
  );
}

/**
 * Backup codes are shown exactly once, at the moment they are generated — the
 * server only keeps their hashes, so there is no second chance to display
 * them. That is worth being emphatic about on screen, because a user who
 * clicks past this has silently lost their way back into the account.
 */
function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="rounded-lg border border-warn/40 bg-warn/10 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold text-warn">
        <IconWarning size={13} /> Сохраните резервные коды — они больше не будут показаны
      </div>
      <p className="mb-2 text-2xs text-txt-2">
        Каждый код срабатывает один раз и заменяет код из приложения, если телефон недоступен.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded border border-line bg-bg-2 p-2 sm:grid-cols-3">
        {codes.map((c) => <span key={c} className="mono text-2xs text-txt-0">{c}</span>)}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { void navigator.clipboard?.writeText(codes.join("\n")); toast.info("Коды скопированы"); }}
          className="tap-sm btn-fx rounded border border-line px-3 py-1.5 text-2xs text-txt-1 hover:border-accent hover:text-accent"
        >
          Скопировать
        </button>
        <button onClick={onDone} className="tap-sm btn-fx rounded bg-accent-fill px-3 py-1.5 text-2xs font-semibold text-white hover:brightness-110">
          Я сохранил коды
        </button>
      </div>
    </div>
  );
}

function TwoFactorPanel() {
  const user = useAuthStore((s) => s.user);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = user?.totpEnabled === true;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Не удалось выполнить операцию"); }
    finally { setBusy(false); }
  }

  const start = () => run(async () => setSetup(await apiPost<TotpSetup>("/api/auth/2fa/setup")));

  const enable = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const res = await apiPost<{ backupCodes: string[] }>("/api/auth/2fa/enable", { code: code.trim() });
      setCodes(res.backupCodes);
      setSetup(null);
      setCode("");
      await refreshMe();
      toast.success("Двухфакторная аутентификация включена");
    });
  };

  const disable = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await apiPost("/api/auth/2fa/disable", { password, code: code.trim() });
      setPassword("");
      setCode("");
      await refreshMe();
      toast.info("Двухфакторная аутентификация выключена");
    });
  };

  const regenerate = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const res = await apiPost<{ backupCodes: string[] }>("/api/auth/2fa/backup-codes", { password });
      setCodes(res.backupCodes);
      setPassword("");
      toast.success("Резервные коды перевыпущены");
    });
  };

  const errorBlock = error && (
    <div className="mb-3 rounded border border-sell/40 bg-sell-soft px-2.5 py-1.5 text-2xs text-sell">{error}</div>
  );

  return (
    <Panel
      title="Двухфакторная аутентификация"
      badge={enabled ? <StatusBadge tone="ok">включена</StatusBadge> : <StatusBadge tone="muted">выключена</StatusBadge>}
    >
      {codes ? (
        <BackupCodes codes={codes} onDone={() => setCodes(null)} />
      ) : setup ? (
        <form onSubmit={enable}>
          <p className="mb-3 text-2xs text-txt-2">
            Отсканируйте код в Google Authenticator, 1Password, Aegis или другом приложении, затем введите
            шестизначный код, который оно покажет.
          </p>
          <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row">
            <img src={setup.qr} alt="QR-код для приложения-аутентификатора" className="rounded-lg border border-line bg-white p-1" width={160} height={160} />
            <div className="min-w-0 flex-1">
              <span className={labelCls}>Или введите ключ вручную</span>
              <code className="block break-all rounded border border-line bg-bg-2 px-2 py-1.5 mono text-2xs text-txt-0">
                {setup.secret}
              </code>
              <p className="mt-2 text-2xs text-txt-3">
                Ключ показывается один раз. После включения его нельзя будет посмотреть снова.
              </p>
            </div>
          </div>

          <label className="mb-3 block">
            <span className={labelCls}>Код из приложения</span>
            <input
              required value={code} onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code" inputMode="numeric"
              className={`${inputCls} tabular tracking-[0.3em]`} placeholder="000000"
            />
          </label>

          {errorBlock}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="tap-sm btn-fx rounded bg-accent-fill px-3 py-1.5 text-2xs font-semibold text-white hover:brightness-110 disabled:opacity-50">
              {busy ? "Проверка…" : "Включить"}
            </button>
            <button type="button" onClick={() => { setSetup(null); setError(null); }} className="tap-sm btn-fx rounded border border-line px-3 py-1.5 text-2xs text-txt-2 hover:text-txt-0">
              Отмена
            </button>
          </div>
        </form>
      ) : enabled ? (
        <div className="space-y-3">
          <p className="text-2xs text-txt-2">
            При входе после пароля запрашивается код из приложения. Осталось резервных кодов:{" "}
            <span className="tabular font-medium text-txt-0">{user?.backupCodesRemaining ?? "—"}</span>.
          </p>

          <form onSubmit={regenerate} className="rounded border border-line-soft bg-bg-2/40 p-3">
            <span className={labelCls}>Перевыпустить резервные коды</span>
            <p className="mb-2 text-2xs text-txt-3">Старые коды перестанут работать.</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" className={`${inputCls} min-w-[160px] flex-1`} placeholder="Пароль"
              />
              <button type="submit" disabled={busy} className="tap-sm btn-fx rounded border border-line px-3 py-1.5 text-2xs text-txt-1 hover:border-accent hover:text-accent disabled:opacity-50">
                Перевыпустить
              </button>
            </div>
          </form>

          <form onSubmit={disable} className="rounded border border-line-soft bg-bg-2/40 p-3">
            <span className={labelCls}>Выключить 2FA</span>
            <p className="mb-2 text-2xs text-txt-3">
              Нужны пароль и текущий код — это защищает от отключения с украденной сессии.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" className={`${inputCls} min-w-[140px] flex-1`} placeholder="Пароль"
              />
              <input
                required value={code} onChange={(e) => setCode(e.target.value)}
                className={`${inputCls} min-w-[120px] flex-1 tabular`} placeholder="Код или резервный код"
              />
              <button type="submit" disabled={busy} className="tap-sm btn-fx rounded border border-line px-3 py-1.5 text-2xs text-txt-2 hover:border-sell hover:text-sell disabled:opacity-50">
                Выключить
              </button>
            </div>
          </form>

          {errorBlock}
        </div>
      ) : (
        <div>
          <p className="mb-3 text-2xs text-txt-2">
            Второй фактор означает, что одного украденного пароля недостаточно, чтобы войти в аккаунт и вывести
            средства.
          </p>
          {errorBlock}
          <button onClick={start} disabled={busy} className="tap-sm btn-fx rounded bg-accent-fill px-3 py-1.5 text-2xs font-semibold text-white hover:brightness-110 disabled:opacity-50">
            {busy ? "…" : "Настроить"}
          </button>
        </div>
      )}
    </Panel>
  );
}

function EmailPanel() {
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const verified = user?.emailVerified === true;

  async function resend() {
    setBusy(true);
    try {
      const res = await apiPost<{ alreadyVerified: boolean }>("/api/auth/resend-verification");
      toast.info(res.alreadyVerified ? "Адрес уже подтверждён" : "Письмо отправлено", user?.email);
    } catch (e) {
      toast.error("Не удалось отправить письмо", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Электронная почта"
      badge={verified ? <StatusBadge tone="ok">подтверждена</StatusBadge> : <StatusBadge tone="warn">не подтверждена</StatusBadge>}
    >
      <p className="mb-3 text-2xs text-txt-2">
        {user?.email} — {verified
          ? "адрес подтверждён, восстановление доступа по ссылке из письма работает."
          : "пока адрес не подтверждён, восстановить пароль по ссылке из письма не получится."}
      </p>
      {!verified && (
        <button onClick={resend} disabled={busy} className="tap-sm btn-fx rounded border border-line px-3 py-1.5 text-2xs text-txt-1 hover:border-accent hover:text-accent disabled:opacity-50">
          {busy ? "…" : "Отправить письмо ещё раз"}
        </button>
      )}
    </Panel>
  );
}

const KYC_BADGE: Record<KycStatus, { tone: "ok" | "warn" | "bad" | "muted"; label: string }> = {
  NONE: { tone: "muted", label: "не подтверждена" },
  PENDING: { tone: "warn", label: "на проверке" },
  APPROVED: { tone: "ok", label: "подтверждена" },
  REJECTED: { tone: "bad", label: "отклонена" },
};

function KycPanel() {
  const kyc = useKyc();
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const [submitting, setSubmitting] = useState(false);
  const status = (kyc.data?.status ?? "NONE") as KycStatus;
  const badge = KYC_BADGE[status];

  return (
    <Panel title="Подтверждение личности" badge={<StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}>
      {kyc.isLoading ? (
        <LoadingRow />
      ) : status === "APPROVED" ? (
        <div className="flex items-start gap-2 text-2xs text-buy">
          <IconCheck size={13} className="mt-0.5 shrink-0" />
          <span className="text-txt-2">
            Личность подтверждена — вывод средств и накопительные счета доступны.
          </span>
        </div>
      ) : status === "PENDING" ? (
        <p className="text-2xs text-txt-2">
          Заявка отправлена {kyc.data?.current ? fmtDateTime(kyc.data.current.createdAt) : ""} и ждёт проверки.
          Торговля работает как обычно; вывод средств и накопительные счета откроются после одобрения.
        </p>
      ) : submitting ? (
        <IdentityForm
          onCancel={() => setSubmitting(false)}
          onSubmitted={async () => {
            setSubmitting(false);
            await kyc.refetch();
            await refreshMe().catch(() => {});
            toast.success("Заявка отправлена", "Обычно проверка занимает несколько часов");
          }}
        />
      ) : (
        <div>
          {status === "REJECTED" && kyc.data?.current?.rejectionReason && (
            <div className="mb-3 rounded border border-sell/40 bg-sell-soft px-2.5 py-1.5 text-2xs text-sell">
              Заявка отклонена: {kyc.data.current.rejectionReason}
            </div>
          )}
          <p className="mb-3 flex items-start gap-1.5 text-2xs text-txt-2">
            <IconLock size={13} className="mt-0.5 shrink-0 text-txt-3" />
            <span>
              Нужно только для вывода средств и накопительных счетов. Торговать можно и без подтверждения.
              Документы хранятся в закрытом хранилище и доступны только проверяющему.
            </span>
          </p>
          <button
            onClick={() => setSubmitting(true)}
            disabled={kyc.data?.uploadAvailable === false}
            title={kyc.data?.uploadAvailable === false ? "Загрузка документов сейчас недоступна" : undefined}
            className="tap-sm btn-fx rounded bg-accent-fill px-3 py-1.5 text-2xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            {status === "REJECTED" ? "Подать заявку заново" : "Подтвердить личность"}
          </button>
        </div>
      )}

      {(kyc.data?.history?.length ?? 0) > 1 && (
        <div className="mt-3 border-t border-line-soft pt-2">
          <div className="mb-1 text-2xs font-medium text-txt-3">История заявок</div>
          {kyc.data!.history.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-2 py-0.5 text-2xs text-txt-2">
              <span className="tabular text-txt-3">{fmtDateTime(h.createdAt)}</span>
              <StatusBadge tone={KYC_BADGE[h.status].tone}>{KYC_BADGE[h.status].label}</StatusBadge>
              {h.rejectionReason && <span className="text-txt-3">{h.rejectionReason}</span>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Everything about who can get into this account and what they can do once
 * they are in — kept together, because that is how someone thinks about it
 * when they come looking. */
export function SecurityTab() {
  return (
    <div className="flex flex-col gap-3">
      <TwoFactorPanel />
      <EmailPanel />
      <KycPanel />
    </div>
  );
}
