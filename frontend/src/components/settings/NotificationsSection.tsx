import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../lib/api";
import { classNames } from "../../lib/format";
import { toast } from "../../store/toast";
import { useUserSettings, type Channels, type NotificationEvent, type UserSettings } from "../../store/userSettings";
import { IconCheck } from "../icons/Icon";
import { SaveBar, SectionHeader, useDraft } from "./ui";

type Channel = keyof Channels;
type Notifications = UserSettings["notifications"];

/**
 * What can actually be delivered where. A cell that isn't here is shown as
 * unavailable rather than offered as a switch that does nothing.
 * `locked` is on and can't be turned off.
 */
const MATRIX: { group: "trading" | "account" | "platform"; events: { id: NotificationEvent; channels: Partial<Record<Channel, "on" | "locked">> }[] }[] = [
  {
    group: "trading",
    events: [
      { id: "orderFilled", channels: { inApp: "on", email: "on" } },
      { id: "slTpTriggered", channels: { inApp: "on", email: "on" } },
      { id: "marginWarning", channels: { inApp: "on", email: "on" } },
    ],
  },
  {
    group: "account",
    events: [
      { id: "newLogin", channels: { email: "on" } },
      { id: "securityChanges", channels: { email: "locked" } },
    ],
  },
  {
    group: "platform",
    events: [
      { id: "maintenance", channels: { inApp: "on", email: "on" } },
      { id: "news", channels: { inApp: "on", email: "on" } },
    ],
  },
];

const CHANNELS: Channel[] = ["inApp", "email", "push"];

function Tick({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="tap-sm flex h-9 w-12 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed"
    >
      <span
        aria-hidden
        className={classNames(
          "flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors",
          checked ? "border-accent bg-accent-fill text-white" : "border-line bg-bg-2",
          disabled && "opacity-50",
        )}
      >
        {checked && <IconCheck size={12} strokeWidth={3} />}
      </span>
    </button>
  );
}

export function NotificationsSection() {
  const { t } = useTranslation();
  const saved = useUserSettings((s) => s.settings.notifications);
  const save = useUserSettings((s) => s.save);
  const { draft, setDraft, dirty, discard } = useDraft<Notifications>(saved);
  const [saving, setSaving] = useState(false);
  const k = "settings.notifications";

  const toggle = (ev: NotificationEvent, ch: Channel) =>
    setDraft((d) => ({ ...d, [ev]: { ...d[ev], [ch]: !d[ev][ch] } }));

  async function onSave() {
    setSaving(true);
    try {
      await save({ notifications: draft });
      toast.success(t("settings.saved"));
    } catch (e) {
      toast.error(t("settings.saveFailed"), e instanceof ApiError ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SectionHeader title={t("settings.sections.notifications")} description={t(`${k}.description`)} />

      {MATRIX.map(({ group, events }) => (
        <section key={group} className="mt-10 first:mt-0">
          <div className="flex items-end gap-4 pb-2">
            <h2 className="flex-1 text-2xs font-semibold uppercase tracking-wider text-txt-3">{t(`${k}.groups.${group}`)}</h2>
            {CHANNELS.map((ch) => (
              <span key={ch} className="w-12 text-center text-2xs font-medium text-txt-3">{t(`${k}.channels.${ch}`)}</span>
            ))}
          </div>
          <div className="divide-y divide-line-soft border-y border-line-soft">
            {events.map(({ id, channels }) => (
              <div key={id} className="flex min-h-[56px] items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <span className="block text-sm text-txt-0">{t(`${k}.events.${id}`)}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-txt-3">{t(`${k}.hints.${id}`)}</span>
                </div>
                {CHANNELS.map((ch) => {
                  const avail = channels[ch];
                  const label = `${t(`${k}.events.${id}`)} — ${t(`${k}.channels.${ch}`)}`;
                  if (!avail) {
                    return (
                      <span key={ch} className="flex h-9 w-12 items-center justify-center text-xs text-txt-3" title={t(`${k}.unavailable`)} aria-label={`${label}: ${t(`${k}.unavailable`)}`}>
                        —
                      </span>
                    );
                  }
                  return (
                    <Tick
                      key={ch}
                      label={label}
                      checked={avail === "locked" ? true : draft[id][ch]}
                      disabled={avail === "locked"}
                      onChange={() => toggle(id, ch)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-3 text-2xs leading-relaxed text-txt-3">{t(`${k}.note`)}</p>

      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onDiscard={discard} />
    </div>
  );
}
