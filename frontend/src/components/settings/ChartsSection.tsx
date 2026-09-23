import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../lib/api";
import { buttonCls } from "../../lib/ui";
import { toast } from "../../store/toast";
import { DEFAULT_SETTINGS, useUserSettings, type UserSettings } from "../../store/userSettings";
import { forgetChartLayout } from "../../hooks/useChartLayout";
import { SaveBar, SectionHeader, Segmented, Select, SettingsGroup, SettingsRow, Switch, useDraft } from "./ui";

type Charts = UserSettings["charts"];
const TIMEFRAMES: Charts["timeframe"][] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

export function ChartsSection() {
  const { t } = useTranslation();
  const saved = useUserSettings((s) => s.settings.charts);
  const save = useUserSettings((s) => s.save);
  const { draft, set, dirty, discard } = useDraft<Charts>(saved);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const k = "settings.charts";

  async function persist(charts: Charts, done: string) {
    await save({ charts });
    toast.success(done);
  }

  async function onSave() {
    setSaving(true);
    try {
      // New defaults are an explicit choice: they win over a layout the
      // chart remembered from before.
      if (draft.timeframe !== saved.timeframe || draft.chartType !== saved.chartType) forgetChartLayout();
      await persist(draft, t("settings.saved"));
    } catch (e) {
      toast.error(t("settings.saveFailed"), e instanceof ApiError ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    setResetting(true);
    try {
      forgetChartLayout();
      await persist(DEFAULT_SETTINGS.charts, t(`${k}.resetDone`));
    } catch (e) {
      toast.error(t("settings.saveFailed"), e instanceof ApiError ? e.message : undefined);
    } finally {
      setResetting(false);
    }
  }

  const sw = (key: keyof Charts, label: string) => (
    <Switch checked={draft[key] as boolean} onChange={(v) => set(key, v as never)} label={label} />
  );

  return (
    <div>
      <SectionHeader title={t("settings.sections.charts")} description={t(`${k}.description`)} />

      <SettingsGroup title={t(`${k}.defaults`)}>
        <SettingsRow label={t(`${k}.timeframe`)} hint={t(`${k}.timeframeHint`)} htmlFor="set-tf">
          <Select id="set-tf" value={draft.timeframe} onChange={(v) => set("timeframe", v)}
            options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))} className="w-28" />
        </SettingsRow>
        <SettingsRow label={t(`${k}.type`)} stack>
          <Segmented
            label={t(`${k}.type`)}
            value={draft.chartType}
            onChange={(v) => set("chartType", v)}
            options={[
              { value: "CANDLES", label: t(`${k}.candles`) },
              { value: "LINE", label: t(`${k}.line`) },
              { value: "AREA", label: t(`${k}.area`) },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t(`${k}.display`)}>
        <SettingsRow label={t(`${k}.volume`)} hint={t(`${k}.volumeHint`)}>{sw("showVolume", t(`${k}.volume`))}</SettingsRow>
        <SettingsRow label={t(`${k}.grid`)}>{sw("showGrid", t(`${k}.grid`))}</SettingsRow>
        <SettingsRow label={t(`${k}.crosshair`)} hint={t(`${k}.crosshairHint`)} stack>
          <Segmented
            label={t(`${k}.crosshair`)}
            value={draft.crosshair}
            onChange={(v) => set("crosshair", v)}
            options={[
              { value: "NORMAL", label: t(`${k}.free`) },
              { value: "MAGNET", label: t(`${k}.magnet`) },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t(`${k}.autoScale`)} hint={t(`${k}.autoScaleHint`)}>{sw("autoScale", t(`${k}.autoScale`))}</SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t(`${k}.onChart`)}>
        <SettingsRow label={t(`${k}.positions`)} hint={t(`${k}.positionsHint`)}>{sw("showPositions", t(`${k}.positions`))}</SettingsRow>
        <SettingsRow label={t(`${k}.orders`)} hint={t(`${k}.ordersHint`)}>{sw("showOrders", t(`${k}.orders`))}</SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t(`${k}.layout`)}>
        <SettingsRow label={t(`${k}.remember`)} hint={t(`${k}.rememberHint`)}>{sw("rememberLayout", t(`${k}.remember`))}</SettingsRow>
        <SettingsRow label={t(`${k}.reset`)} hint={t(`${k}.resetHint`)}>
          <button type="button" onClick={onReset} disabled={resetting} className={buttonCls("danger", "md")}>
            {t(`${k}.resetButton`)}
          </button>
        </SettingsRow>
      </SettingsGroup>

      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onDiscard={discard} />
    </div>
  );
}
