import { useState } from "react";
import { StatsCards } from "../components/admin/StatsCards";
import { UsersTab } from "../components/admin/UsersTab";
import { AuditTab } from "../components/admin/AuditTab";
import { InstrumentsTab } from "../components/admin/InstrumentsTab";
import { classNames } from "../lib/format";

type Tab = "team" | "audit" | "instruments";

/**
 * What's left of the admin console after the CRM merge: staff accounts,
 * the platform-wide action log, and market instruments. Client management —
 * the desk's day-to-day work, and identity verification with it — moved to
 * /crm entirely, which is now the one place every customer (self-registered
 * or brought in by the desk) shows up. Keeping a second "Users" tab here
 * pointed at the same people would be exactly the drift this merge removed.
 */
export function AdminPage() {
  const [tab, setTab] = useState<Tab>("team");

  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <div className="anim-rise relative mb-3 shrink-0 overflow-hidden rounded-xl border border-line bg-bg-1 px-4 py-3">
        <div className="section-glow" aria-hidden />
        <div className="neon-strip" aria-hidden />
        <div className="relative flex items-center gap-2">
          <h1 className="text-sm font-semibold text-txt-0">Admin Console</h1>
          <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-2xs text-warn">restricted</span>
        </div>
      </div>

      <div className="mb-3 shrink-0">
        <StatsCards />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-line bg-bg-1">
        <div className="flex shrink-0 gap-0.5 border-b border-line px-1">
          {(
            [
              ["team", "Команда"],
              ["audit", "Audit Log"],
              ["instruments", "Instruments"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={classNames(
                "border-b-2 px-3 py-2 text-2xs font-medium",
                tab === id ? "border-accent text-txt-0" : "border-transparent text-txt-2 hover:text-txt-0"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {tab === "team" && <UsersTab />}
          {tab === "audit" && <AuditTab />}
          {tab === "instruments" && <InstrumentsTab />}
        </div>
      </div>
    </div>
  );
}
