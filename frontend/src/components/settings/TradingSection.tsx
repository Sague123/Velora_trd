import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../lib/api";
import { fieldCls } from "../../lib/ui";
import { toast } from "../../store/toast";
import { useUserSettings, type UserSettings } from "../../store/userSettings";
import { RowValue, SaveBar, SectionHeader, Segmented, Select, SettingsGroup, SettingsRow, Switch, useDraft } from "./ui";

type Trading = UserSettings["trading"];
/** Numeric fields are edited as text and parsed on save. */
type Draft = Omit<Trading, "defaultAmount" | "leverage" | "stopLossPct" | "takeProfitPct" | "riskPerTradePct"> & {
  defaultAmount: string;
  leverage: string;
  stopLossPct: string;
  takeProfitPct: string;
  riskPerTradePct: string;
};

const toDraft = (t: Trading): Draft => ({
  ...t,
  defaultAmount: t.defaultAmount ?? "",
  leverage: String(t.leverage),
  stopLossPct: t.stopLossPct == null ? "" : String(t.stopLossPct),
  takeProfitPct: t.takeProfitPct == null ? "" : String(t.takeProfitPct),
  riskPerTradePct: t.riskPerTradePct == null ? "" : String(t.riskPerTradePct),
});

const NUM = fieldCls("md", "tap-sm w-28 text-right tabular");
const decimal = (v: string) => v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

/** Blank → null; otherwise a number in (0, 100]. */
function parsePct(v: string): number | null | "invalid" {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : "invalid";
}

function Suffixed({ children, unit }: { children: React.ReactNode; unit: string }) {
  return (
    <span className="flex items-center gap-2">
      {children}
      <span className="w-10 text-xs text-txt-3">{unit}</span>
    </span>
  );
}

export function TradingSection() {
  const { t } = useTranslation();
  const saved = useUserSettings((s) => s.settings.trading);
  const save = useUserSettings((s) => s.save);
  const { draft, set, dirty, discard } = useDraft<Draft>(toDraft(saved));
  const [saving, setSaving] = useState(false);
  const k = "settings.trading";

  async function onSave() {
    const leverage = Number(draft.leverage);
    if (!Number.isInteger(leverage) || leverage < 1 || leverage > 125) return toast.warning(t(`${k}.invalidLeverage`));
    if (draft.defaultAmount && !(Number(draft.defaultAmount) > 0)) return toast.warning(t(`${k}.invalidAmount`));
    const sl = parsePct(draft.stopLossPct);
    const tp = parsePct(draft.takeProfitPct);
    const risk = parsePct(draft.riskPerTradePct);
    if (sl === "invalid" || tp === "invalid" || risk === "invalid") return toast.warning(t(`${k}.invalidPct`));

    setSaving(true);
    try {
      await save({
        trading: {
          ...draft,
          leverage,
          defaultAmount: draft.defaultAmount.replace(/\.$/, "") || null,
          stopLossPct: sl,
          takeProfitPct: tp,
          riskPerTradePct: risk,
        },
      });
      toast.success(t("settings.saved"));
    } catch (e) {
      toast.error(t("settings.saveFailed"), e instanceof ApiError ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const amountUnit = draft.amountMode === "BASE" ? t(`${k}.unitBase`) : "USD";

  return (
    <div>
      <SectionHeader title={t("settings.sections.trading")} description={t(`${k}.description`)} />

      <SettingsGroup title={t(`${k}.orderDefaults`)}>
        <SettingsRow label={t(`${k}.amountMode`)} hint={t(`${k}.amountModeHint`)} htmlFor="set-amode">
          <Select
            id="set-amode"
            value={draft.amountMode}
            onChange={(v) => set("amountMode", v)}
            options={[
              { value: "BASE", label: t(`${k}.modeBase`) },
              { value: "QUOTE", label: t(`${k}.modeQuote`) },
              { value: "MARGIN", label: t(`${k}.modeMargin`) },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t(`${k}.amount`)} hint={t(`${k}.amountHint`)} htmlFor="set-amount">
          <Suffixed unit={amountUnit}>
            <input id="set-amount" inputMode="decimal" value={draft.defaultAmount} placeholder="—"
              onChange={(e) => set("defaultAmount", decimal(e.target.value))} className={NUM} />
          </Suffixed>
        </SettingsRow>
        <SettingsRow label={t(`${k}.leverage`)} hint={t(`${k}.leverageHint`)} htmlFor="set-lev">
          <Suffixed unit="x">
            <input id="set-lev" inputMode="numeric" value={draft.leverage}
              onChange={(e) => set("leverage", e.target.value.replace(/\D/g, "").slice(0, 3))} className={NUM} />
          </Suffixed>
        </SettingsRow>
        <SettingsRow label={t(`${k}.orderType`)} stack>
          <Segmented
            label={t(`${k}.orderType`)}
            value={draft.orderType}
            onChange={(v) => set("orderType", v)}
            options={[
              { value: "MARKET", label: t(`${k}.market`) },
              { value: "LIMIT", label: t(`${k}.limit`) },
              { value: "STOP", label: t(`${k}.stop`) },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t(`${k}.tif`)} hint={t(`${k}.tifHint`)}>
          <RowValue>GTC</RowValue>
        </SettingsRow>
        <SettingsRow label={t(`${k}.confirmOrders`)} hint={t(`${k}.confirmOrdersHint`)}>
          <Switch checked={draft.confirmOrders} onChange={(v) => set("confirmOrders", v)} label={t(`${k}.confirmOrders`)} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t(`${k}.risk`)} note={t(`${k}.riskNote`)}>
        <SettingsRow label={t(`${k}.stopLoss`)} hint={t(`${k}.stopLossHint`)} htmlFor="set-sl">
          <Suffixed unit="%">
            <input id="set-sl" inputMode="decimal" value={draft.stopLossPct} placeholder={t(`${k}.off`)}
              onChange={(e) => set("stopLossPct", decimal(e.target.value))} className={NUM} />
          </Suffixed>
        </SettingsRow>
        <SettingsRow label={t(`${k}.takeProfit`)} hint={t(`${k}.takeProfitHint`)} htmlFor="set-tp">
          <Suffixed unit="%">
            <input id="set-tp" inputMode="decimal" value={draft.takeProfitPct} placeholder={t(`${k}.off`)}
              onChange={(e) => set("takeProfitPct", decimal(e.target.value))} className={NUM} />
          </Suffixed>
        </SettingsRow>
        <SettingsRow label={t(`${k}.riskPerTrade`)} hint={t(`${k}.riskPerTradeHint`)} htmlFor="set-risk">
          <Suffixed unit="%">
            <input id="set-risk" inputMode="decimal" value={draft.riskPerTradePct} placeholder={t(`${k}.off`)}
              onChange={(e) => set("riskPerTradePct", decimal(e.target.value))} className={NUM} />
          </Suffixed>
        </SettingsRow>
        <SettingsRow label={t(`${k}.marginMode`)} hint={t(`${k}.marginModeHint`)}>
          <RowValue>{t(`${k}.isolated`)}</RowValue>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t(`${k}.interface`)}>
        <SettingsRow label={t(`${k}.showFees`)} hint={t(`${k}.showFeesHint`)}>
          <Switch checked={draft.showFees} onChange={(v) => set("showFees", v)} label={t(`${k}.showFees`)} />
        </SettingsRow>
        <SettingsRow label={t(`${k}.showLiq`)} hint={t(`${k}.showLiqHint`)}>
          <Switch checked={draft.showLiquidation} onChange={(v) => set("showLiquidation", v)} label={t(`${k}.showLiq`)} />
        </SettingsRow>
        <SettingsRow label={t(`${k}.showAvail`)} hint={t(`${k}.showAvailHint`)}>
          <Switch checked={draft.showAvailableMargin} onChange={(v) => set("showAvailableMargin", v)} label={t(`${k}.showAvail`)} />
        </SettingsRow>
        <SettingsRow label={t(`${k}.pnl`)} hint={t(`${k}.pnlHint`)} stack>
          <Segmented
            label={t(`${k}.pnl`)}
            value={draft.pnlDisplay}
            onChange={(v) => set("pnlDisplay", v)}
            options={[
              { value: "CURRENCY", label: "USD" },
              { value: "PERCENT", label: "%" },
              { value: "BOTH", label: t(`${k}.both`) },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t(`${k}.confirmClose`)} hint={t(`${k}.confirmCloseHint`)}>
          <Switch checked={draft.confirmClose} onChange={(v) => set("confirmClose", v)} label={t(`${k}.confirmClose`)} />
        </SettingsRow>
      </SettingsGroup>

      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onDiscard={discard} />
    </div>
  );
}
