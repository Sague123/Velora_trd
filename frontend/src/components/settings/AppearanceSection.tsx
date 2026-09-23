import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../../i18n";
import { ApiError } from "../../lib/api";
import { toast } from "../../store/toast";
import { applyAppearance, useUserSettings, type Appearance } from "../../store/userSettings";
import { SaveBar, SectionHeader, Segmented, Select, SettingsGroup, SettingsRow, Switch, useDraft } from "./ui";

/**
 * Everything here previews live — the app changes the moment a control
 * does — and Save changes makes it stick. Discarding, or leaving the page
 * without saving, puts the saved look back.
 */
export function AppearanceSection() {
  const { t } = useTranslation();
  const saved = useUserSettings((s) => s.settings.appearance);
  const save = useUserSettings((s) => s.save);
  const { draft, setDraft, dirty, discard } = useDraft<Appearance>(saved);
  const [saving, setSaving] = useState(false);

  // Preview every edit.
  useEffect(() => {
    applyAppearance(draft);
  }, [draft]);

  // Leaving with unsaved edits restores the saved look.
  useEffect(() => () => applyAppearance(useUserSettings.getState().settings.appearance), []);

  const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function onSave() {
    setSaving(true);
    try {
      await save({ appearance: draft });
      toast.success(t("settings.saved"));
    } catch (e) {
      toast.error(t("settings.saveFailed"), e instanceof ApiError ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const a = "settings.appearance";
  return (
    <div>
      <SectionHeader title={t("settings.sections.appearance")} description={t(`${a}.description`)} />

      <SettingsGroup title={t(`${a}.display`)}>
        <SettingsRow label={t(`${a}.theme`)} hint={t(`${a}.themeHint`)} stack>
          <Segmented
            label={t(`${a}.theme`)}
            value={draft.theme}
            onChange={(v) => set("theme", v)}
            options={[
              { value: "dark", label: t(`${a}.dark`) },
              { value: "light", label: t(`${a}.light`) },
              { value: "system", label: t(`${a}.system`) },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t(`${a}.density`)} hint={t(`${a}.densityHint`)} stack>
          <Segmented
            label={t(`${a}.density`)}
            value={draft.density}
            onChange={(v) => set("density", v)}
            options={[
              { value: "compact", label: t(`${a}.compact`) },
              { value: "comfortable", label: t(`${a}.comfortable`) },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t(`${a}.language`)} htmlFor="set-ui-lang">
          <Select
            id="set-ui-lang"
            value={draft.language}
            onChange={(v) => set("language", v)}
            options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t(`${a}.behaviour`)}>
        <SettingsRow label={t(`${a}.animations`)} hint={t(`${a}.animationsHint`)}>
          <Switch checked={draft.animations} onChange={(v) => set("animations", v)} label={t(`${a}.animations`)} />
        </SettingsRow>
        <SettingsRow label={t(`${a}.tooltips`)} hint={t(`${a}.tooltipsHint`)}>
          <Switch checked={draft.tooltips} onChange={(v) => set("tooltips", v)} label={t(`${a}.tooltips`)} />
        </SettingsRow>
        <SettingsRow label={t(`${a}.nav`)} hint={t(`${a}.navHint`)} stack>
          <Segmented
            label={t(`${a}.nav`)}
            value={draft.navStyle}
            onChange={(v) => set("navStyle", v)}
            options={[
              { value: "text", label: t(`${a}.navText`) },
              { value: "both", label: t(`${a}.navBoth`) },
              { value: "icons", label: t(`${a}.navIcons`) },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>

      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onDiscard={discard} />
    </div>
  );
}
