import { useState } from "react";
import { StatsCards } from "../components/admin/StatsCards";
import { UsersTab } from "../components/admin/UsersTab";
import { AuditTab } from "../components/admin/AuditTab";
import { InstrumentsTab } from "../components/admin/InstrumentsTab";
import { classNames } from "../lib/format";

type Tab = "users" | "audit" | "instruments";

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <h1 className="text-sm font-semibold text-txt-0">Admin Console</h1>
        <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-2xs text-warn">restricted</span>
      </div>

      <div className="mb-3 shrink-0">
        <StatsCards />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded border border-line bg-bg-1">
        <div className="flex shrink-0 gap-0.5 border-b border-line px-1">
          {(
            [
              ["users", "Users"],
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
          {tab === "users" && <UsersTab />}
          {tab === "audit" && <AuditTab />}
          {tab === "instruments" && <InstrumentsTab />}
        </div>
      </div>
    </div>
  );
}
