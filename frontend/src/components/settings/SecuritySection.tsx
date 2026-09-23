import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, ApiError } from "../../lib/api";
import { classNames, fmtDateTime } from "../../lib/format";
import { buttonCls } from "../../lib/ui";
import { useAuthStore } from "../../store/auth";
import { toast } from "../../store/toast";
import { useKyc } from "../../hooks/useKyc";
import { IconShield, IconWarning } from "../icons/Icon";
import { LoadingRow } from "../common/States";
import { SectionHeader, SettingsGroup } from "./ui";
import { EmailPanel, KycPanel, PasswordPanel, StatusBadge, TwoFactorPanel } from "./securityPanels";

interface Session { id: string; userAgent: string | null; ip: string | null; lastActiveAt: string; current: boolean }
interface LoginEntry { at: string; ip: string | null; userAgent: string | null; result: "SUCCESS" | "FAILED" | "MFA_FAILED" }

/** "Chrome · macOS" from a user-agent string — enough to recognise a device. */
function describeDevice(ua: string | null, unknown: string): string {
  if (!ua) return unknown;
  const browser =
    /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
      : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  const os =
    /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS"
      : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  if (browser || os) return [browser, os].filter(Boolean).join(" · ");
  return ua.split(/[\s(]/)[0] || unknown;
}

/**
 * Account protection in one place: the overall state first, then the
 * credentials (password, second factor, email, identity), then who is
 * signed in right now and who tried to.
 */
export function SecuritySection() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const kyc = useKyc();
  const qc = useQueryClient();
  const k = "settings.security";

  useEffect(() => {
    void refreshMe().catch(() => undefined);
  }, [refreshMe]);

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiGet<{ sessions: Session[] }>("/api/auth/sessions"),
  });
  const history = useQuery({
    queryKey: ["login-history"],
    queryFn: () => apiGet<{ entries: LoginEntry[] }>("/api/auth/login-history"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/auth/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
    onError: (e) => toast.error(t(`${k}.revokeFailed`), e instanceof ApiError ? e.message : undefined),
  });
  const revokeOthers = useMutation({
    mutationFn: () => apiPost("/api/auth/sessions/revoke-others"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success(t(`${k}.signedOutOthers`));
    },
    onError: (e) => toast.error(t(`${k}.revokeFailed`), e instanceof ApiError ? e.message : undefined),
  });

  // "Sign out everywhere else" takes two presses — it ends sessions on
  // devices the person may be actively using.
  const [armed, setArmed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);
  function onRevokeOthers() {
    if (!armed) {
      setArmed(true);
      armTimer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    revokeOthers.mutate();
  }

  if (!user) return null;

  const checks = [
    { ok: user.emailVerified === true, label: t(`${k}.checkEmail`) },
    { ok: user.totpEnabled === true, label: t(`${k}.check2fa`) },
    { ok: kyc.data?.status === "APPROVED", label: t(`${k}.checkKyc`), optional: true },
  ];
  const isProtected = checks.filter((c) => !c.optional).every((c) => c.ok);
  const allSessions = sessions.data?.sessions ?? [];
  const others = allSessions.filter((s) => !s.current);
  // Current device first, then most recent; long lists fold after ten.
  const ordered = [...allSessions.filter((s) => s.current), ...others];
  const visible = showAll ? ordered : ordered.slice(0, 10);

  return (
    <div>
      <SectionHeader title={t("settings.sections.security")} description={t(`${k}.description`)} />

      {/* overall state */}
      <div className="flex items-start gap-3 border-y border-line-soft py-4">
        <span className={classNames("mt-0.5", isProtected ? "text-buy" : "text-warn")}>
          {isProtected ? <IconShield size={20} /> : <IconWarning size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-txt-0">
            {isProtected ? t(`${k}.protected`) : t(`${k}.attention`)}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {checks.map((c) => (
              <li key={c.label} className={classNames("text-xs", c.ok ? "text-txt-2" : "text-txt-3")}>
                <span aria-hidden className={c.ok ? "text-buy" : "text-txt-3"}>{c.ok ? "✓" : "○"}</span> {c.label}
                {c.optional && !c.ok && <span className="text-txt-3"> · {t(`${k}.optional`)}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <SettingsGroup title={t(`${k}.signIn`)}>
        <PasswordPanel />
        <TwoFactorPanel />
        <EmailPanel />
      </SettingsGroup>

      <SettingsGroup title={t(`${k}.identity`)}>
        <KycPanel />
      </SettingsGroup>

      <SettingsGroup
        title={t(`${k}.sessions`)}
        note={t(`${k}.sessionsNote`)}
        action={others.length > 0 ? (
          <button type="button" onClick={onRevokeOthers} disabled={revokeOthers.isPending} className={buttonCls("danger", "sm")}>
            {armed ? t(`${k}.confirmSignOut`) : t(`${k}.signOutOthers`)}
          </button>
        ) : undefined}
      >
        {sessions.isLoading && <LoadingRow />}
        {visible.map((s) => (
          <div key={s.id} className="flex min-h-[56px] items-center gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm text-txt-0">
                {describeDevice(s.userAgent, t(`${k}.unknownDevice`))}
                {s.current && <StatusBadge tone="ok">{t(`${k}.thisDevice`)}</StatusBadge>}
              </p>
              <p className="mt-0.5 text-xs text-txt-3 tabular">
                {s.ip ?? "—"} · {t(`${k}.lastActive`)} {fmtDateTime(s.lastActiveAt)}
              </p>
            </div>
            {!s.current && (
              <button type="button" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending} className={buttonCls("ghost", "sm")}>
                {t(`${k}.revoke`)}
              </button>
            )}
          </div>
        ))}
      </SettingsGroup>

      {ordered.length > visible.length && (
        <button type="button" onClick={() => setShowAll(true)} className={buttonCls("ghost", "sm", "mt-2")}>
          {t(`${k}.showAll`, { count: ordered.length })}
        </button>
      )}

      <SettingsGroup title={t(`${k}.history`)}>
        {history.isLoading && <LoadingRow />}
        {history.data?.entries.length === 0 && <p className="py-4 text-xs text-txt-3">{t(`${k}.noHistory`)}</p>}
        {(history.data?.entries ?? []).map((e, i) => (
          <div key={`${e.at}-${i}`} className="flex min-h-[48px] items-center gap-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-txt-1">{describeDevice(e.userAgent, t(`${k}.unknownDevice`))}</p>
              <p className="mt-0.5 text-xs text-txt-3 tabular">{fmtDateTime(e.at)} · {e.ip ?? "—"}</p>
            </div>
            <StatusBadge tone={e.result === "SUCCESS" ? "ok" : "bad"}>
              {t(`${k}.result.${e.result}`)}
            </StatusBadge>
          </div>
        ))}
      </SettingsGroup>
    </div>
  );
}
