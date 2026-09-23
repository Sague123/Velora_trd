import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { useUpdateProfile } from "../../hooks/useProfile";
import { LANGUAGES } from "../../i18n";
import { ApiError } from "../../lib/api";
import { fieldCls, buttonCls } from "../../lib/ui";
import { regionOptions, timeZoneOptions, utcOffset } from "../../lib/regions";
import { toast } from "../../store/toast";
import { AvatarUpload } from "../profile/AvatarUpload";
import { RowValue, SaveBar, SectionHeader, Select, SettingsGroup, SettingsRow, useDraft } from "./ui";

type Draft = {
  name: string;
  dateOfBirth: string;
  phone: string;
  country: string;
  timezone: string;
  preferredLanguage: string;
};

const INPUT = fieldCls("md", "tap-sm w-full sm:w-64");

export function ProfileSection() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const updateProfile = useUpdateProfile();
  const [removing, setRemoving] = useState(false);

  // The session user from login carries only the core fields; /me has the
  // contact details this section edits.
  useEffect(() => {
    void refreshMe().catch(() => undefined);
  }, [refreshMe]);

  const saved: Draft = {
    name: user?.name ?? "",
    dateOfBirth: user?.dateOfBirth ?? "",
    phone: user?.phone ?? "",
    country: user?.country ?? "",
    timezone: user?.timezone ?? "",
    preferredLanguage: user?.preferredLanguage ?? "",
  };
  const { draft, set, dirty, discard } = useDraft(saved);

  const regions = useMemo(() => regionOptions(i18n.language), [i18n.language]);
  const zones = useMemo(() => timeZoneOptions().map((z) => ({ value: z, label: `${z.replace(/_/g, " ")} · ${utcOffset(z)}` })), []);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Date().toISOString().slice(0, 10);

  if (!user) return null;

  async function save() {
    if (!draft.name.trim()) {
      toast.warning(t("settings.profile.nameRequired"));
      return;
    }
    // Only what changed; "" clears an optional field on the server.
    const patch: Record<string, string | null> = {};
    (Object.keys(draft) as (keyof Draft)[]).forEach((k) => {
      if (draft[k] !== saved[k]) patch[k] = k === "dateOfBirth" ? draft[k] || null : k === "name" ? draft[k].trim() : draft[k];
    });
    try {
      await updateProfile.mutateAsync(patch);
      await refreshMe();
      toast.success(t("settings.saved"));
    } catch (e) {
      toast.error(t("settings.saveFailed"), e instanceof ApiError ? e.message : undefined);
    }
  }

  async function removePhoto() {
    setRemoving(true);
    try {
      await updateProfile.mutateAsync({ avatar: null });
      await refreshMe();
    } catch (e) {
      toast.error(t("settings.saveFailed"), e instanceof ApiError ? e.message : undefined);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <SectionHeader title={t("settings.sections.profile")} description={t("settings.profile.description")} />

      <SettingsGroup title={t("settings.profile.personal")}>
        <SettingsRow label={t("settings.profile.photo")} hint={t("settings.profile.photoHint")}>
          <div className="flex items-center gap-3">
            {user.avatar && (
              <button type="button" onClick={removePhoto} disabled={removing} className={buttonCls("ghost", "sm")}>
                {t("settings.profile.removePhoto")}
              </button>
            )}
            <AvatarUpload size={48} />
          </div>
        </SettingsRow>
        <SettingsRow label={t("settings.profile.name")} htmlFor="set-name" stack>
          <input id="set-name" value={draft.name} maxLength={80} autoComplete="name"
            onChange={(e) => set("name", e.target.value)} className={INPUT} />
        </SettingsRow>
        <SettingsRow label={t("settings.profile.dob")} htmlFor="set-dob" stack>
          <input id="set-dob" type="date" value={draft.dateOfBirth} max={today} autoComplete="bday"
            onChange={(e) => set("dateOfBirth", e.target.value)} className={INPUT} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.profile.contact")}>
        <SettingsRow
          label={t("settings.profile.email")}
          hint={
            user.emailVerified ? t("settings.profile.emailVerified") : (
              <>
                {t("settings.profile.emailUnverified")}{" "}
                <Link to="/settings/security" className="text-accent hover:underline">{t("settings.profile.verify")}</Link>
              </>
            )
          }
        >
          <RowValue>{user.email}</RowValue>
        </SettingsRow>
        <SettingsRow label={t("settings.profile.phone")} htmlFor="set-phone" stack>
          <input id="set-phone" type="tel" inputMode="tel" value={draft.phone} maxLength={32} autoComplete="tel"
            placeholder="+420 000 000 000" onChange={(e) => set("phone", e.target.value)} className={INPUT} />
        </SettingsRow>
        <SettingsRow label={t("settings.profile.country")} htmlFor="set-country" stack>
          <Select className="w-full sm:w-64" id="set-country" value={draft.country} onChange={(v) => set("country", v)}
            options={[{ value: "", label: t("settings.profile.notSet") }, ...regions]} />
        </SettingsRow>
        <SettingsRow label={t("settings.profile.timezone")} hint={t("settings.profile.timezoneHint")} htmlFor="set-tz" stack>
          <Select className="w-full sm:w-64" id="set-tz" value={draft.timezone} onChange={(v) => set("timezone", v)}
            options={[{ value: "", label: t("settings.profile.timezoneAuto", { zone: browserZone }) }, ...zones]} />
        </SettingsRow>
        <SettingsRow label={t("settings.profile.language")} hint={t("settings.profile.languageHint")} htmlFor="set-lang" stack>
          <Select className="w-full sm:w-64" id="set-lang" value={draft.preferredLanguage} onChange={(v) => set("preferredLanguage", v)}
            options={[{ value: "", label: t("settings.profile.sameAsInterface") }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.label }))]} />
        </SettingsRow>
      </SettingsGroup>

      <p className="mt-3 text-2xs leading-relaxed text-txt-3">{t("settings.profile.selfReported")}</p>

      <SaveBar dirty={dirty} saving={updateProfile.isPending} onSave={save} onDiscard={discard} />
    </div>
  );
}
