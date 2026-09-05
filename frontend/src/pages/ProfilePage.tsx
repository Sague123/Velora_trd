import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { useSettingsStore } from "../store/settings";
import { useThemeStore } from "../store/theme";
import { useLedger, useOrders, usePositions, useTrades } from "../hooks/useTrading";
import { useUpdateProfile } from "../hooks/useProfile";
import { AccountOverview } from "../components/profile/AccountOverview";
import { SpotHoldingsPanel } from "../components/profile/SpotHoldingsPanel";
import { TradeHistoryTab } from "../components/profile/TradeHistoryTab";
import { AvatarUpload } from "../components/profile/AvatarUpload";
import { SecurityTab } from "../components/profile/SecurityTab";
import { PositionsTable } from "../components/terminal/PositionsTable";
import { OrdersTable } from "../components/terminal/OrdersTable";
import { TradesTable } from "../components/terminal/TradesTable";
import { LedgerTable } from "../components/terminal/LedgerTable";
import { LoadingRow, ErrorRow, EmptyState } from "../components/common/States";
import { Checkbox } from "../components/common/Checkbox";
import { classNames, fmtDateTime } from "../lib/format";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";
import { IconCoin, IconListView, IconMoon, IconOrderHistory, IconSun, IconTrade } from "../components/icons/Icon";
import type { OrderStatus, Timeframe } from "../lib/types";

/** Wallet and Balance were two tabs describing one thing — what's in the
 * account — split by whether you wanted to act on it or read it. They're one
 * `account` tab now; the rest keep their meaning. */
type Tab = "account" | "portfolio" | "history" | "security" | "settings";

function InfoForm() {
  const user = useAuthStore((s) => s.user);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState(user?.name ?? "");
  const [dob, setDob] = useState(user?.dateOfBirth ?? "");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const patch: { name?: string; dateOfBirth?: string | null } = {};
    if (name.trim() && name.trim() !== user?.name) patch.name = name.trim();
    if (dob !== (user?.dateOfBirth ?? "")) patch.dateOfBirth = dob || null;
    if (Object.keys(patch).length === 0) return;
    try {
      await updateProfile.mutateAsync(patch);
      await refreshMe();
      toast.success("Профиль обновлён");
    } catch (e) {
      toast.error("Не удалось сохранить профиль", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-line bg-bg-1 p-4">
      <h2 className="mb-1 text-xs font-semibold text-txt-0">Basic Info</h2>
      <p className="mb-3 text-2xs text-txt-3">
        Самостоятельно указанные данные — Velora не проверяет их по документам и не проводит настоящую KYC-верификацию.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-2xs text-txt-2">Full Name (ФИО)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
            className="w-full rounded border border-line bg-bg-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs text-txt-2">Date of Birth</span>
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
            className="w-full rounded border border-line bg-bg-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-2xs text-txt-2">Email</span>
          <input value={user?.email ?? ""} disabled
            className="w-full cursor-not-allowed rounded border border-line bg-bg-2/50 px-2.5 py-1.5 text-xs text-txt-2" />
        </label>
      </div>
      <button type="submit" disabled={updateProfile.isPending} className="btn-fx tap-sm mt-3 rounded-lg bg-accent-fill px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        {updateProfile.isPending ? "Сохранение…" : "Save"}
      </button>
    </form>
  );
}

function SettingsTab() {
  const user = useAuthStore((s) => s.user);
  const s = useSettingsStore();
  const theme = useThemeStore((t) => t.theme);
  const setTheme = useThemeStore((t) => t.setTheme);
  const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

  return (
    <div className="flex flex-col gap-3">
      <InfoForm />
      {/* Account number dropped from here — it's on the Account tab, next to
          the balance it belongs to. Changing the password moved to Security,
          with 2FA and identity. What's left is what describes the person,
          not what protects the account. */}
      {user && (
        <div className="rounded border border-line-soft bg-bg-2/40 px-3 py-2 text-2xs text-txt-3">
          Registered {fmtDateTime(user.createdAt)}
        </div>
      )}

      <div className="rounded-lg border border-line bg-bg-1 p-4">
        <h2 className="mb-3 text-xs font-semibold text-txt-0">Appearance</h2>
        <div className="flex gap-1">
          {(["dark", "light"] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)}
              className={classNames("btn-fx tap-sm flex items-center gap-1.5 rounded border px-3 py-1.5 text-2xs font-medium capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", theme === t ? "border-accent bg-accent-soft text-accent" : "border-line text-txt-2")}>
              {t === "dark" ? <IconMoon size={13} /> : <IconSun size={13} />} {t}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-bg-1 p-4">
        <h2 className="mb-3 text-xs font-semibold text-txt-0">Trading Defaults</h2>
        <p className="mb-3 text-2xs text-txt-3">Хранится локально, на сервер не отправляется.</p>

        <label className="mb-3 block">
          <span className="mb-1 flex justify-between text-2xs text-txt-2"><span>Default Leverage</span><span className="tabular text-txt-0">{s.defaultLeverage}x</span></span>
          <input type="range" min={1} max={50} value={s.defaultLeverage} onChange={(e) => s.setDefaultLeverage(Number(e.target.value))} className="w-full accent-accent" />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-2xs text-txt-2">Default Amount Mode</span>
          <div className="flex flex-wrap gap-1">
            {(["BASE", "QUOTE", "MARGIN"] as const).map((m) => (
              <button key={m} onClick={() => s.setDefaultAmountMode(m)} className={classNames("btn-fx tap-sm rounded border px-3 py-1.5 text-2xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", s.defaultAmountMode === m ? "border-accent bg-accent-soft text-accent" : "border-line text-txt-2")}>
                {m === "BASE" ? "Base asset" : m === "QUOTE" ? "Total (USD)" : "Margin (USD)"}
              </button>
            ))}
          </div>
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-2xs text-txt-2">Default Chart Timeframe</span>
          <div className="flex flex-wrap gap-1">
            {TIMEFRAMES.map((tf) => (
              <button key={tf} onClick={() => s.setDefaultTimeframe(tf)} className={classNames("btn-fx tap-sm rounded border px-3 py-1.5 text-2xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", s.defaultTimeframe === tf ? "border-accent bg-accent-soft text-accent" : "border-line text-txt-2")}>
                {tf}
              </button>
            ))}
          </div>
        </label>

        <Checkbox checked={s.confirmOnOrder} onChange={s.setConfirmOnOrder} className="text-2xs text-txt-2">
          Требовать повторное нажатие Buy/Sell для подтверждения
        </Checkbox>
      </div>

      <div className="rounded-lg border border-line bg-bg-1 p-4">
        <button onClick={() => { s.reset(); toast.info("Настройки сброшены"); }} className="btn-fx tap-sm rounded border border-line px-3 py-1.5 text-2xs text-txt-2 hover:border-sell hover:text-sell focus-visible:outline focus-visible:outline-2 focus-visible:outline-sell">
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}

function PortfolioTab({ onGoTrade }: { onGoTrade: () => void }) {
  const [sub, setSub] = useState<"positions" | "spot" | "orders" | "history" | "ledger">("positions");
  const [orderStatus, setOrderStatus] = useState<OrderStatus | "ALL">("NEW");
  const positions = usePositions(sub === "positions");
  const orders = useOrders(orderStatus, sub === "orders");
  const trades = useTrades(sub === "history");
  const ledger = useLedger(sub === "ledger");

  // Height follows the rows. This used to be `flex-1` with an inner scroll
  // area, which reserved a full screen of panel whether it held twelve
  // positions or one — so a single open position sat at the top of a mostly
  // empty box.
  return (
    <div className="flex flex-col rounded-lg border border-line bg-bg-1">
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-line px-1">
        {(
          [
            // Positions are the futures/perp side — leveraged contracts that
            // track a price. Spot Holdings are the assets themselves. They sit
            // side by side rather than merged because they are not the same
            // kind of thing: one has leverage and a liquidation price, the
            // other cannot be liquidated at all.
            ["positions", "Positions"],
            ["spot", "Spot Holdings"],
            ["orders", "Orders"],
            ["history", "Trade History"],
            ["ledger", "Ledger"],
          ] as [typeof sub, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} className={classNames("btn-fx tap-sm border-b-2 px-3 py-2 text-2xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", sub === id ? "border-accent text-txt-0" : "border-transparent text-txt-2 hover:text-txt-0")}>
            {label}
          </button>
        ))}
        {sub === "orders" && (
          <div className="ml-auto flex gap-0.5 py-1 pr-2">
            {(["NEW", "FILLED", "CANCELLED", "ALL"] as const).map((s) => (
              <button key={s} onClick={() => setOrderStatus(s)} className={classNames("btn-fx tap-sm rounded px-2 py-1 text-2xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", orderStatus === s ? "bg-accent-soft text-accent" : "text-txt-2")}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        {sub === "positions" && (
          <>
            {positions.isLoading && <LoadingRow />}
            {positions.isError && <ErrorRow label="Ошибка загрузки" onRetry={() => positions.refetch()} />}
            {positions.data && (
              positions.data.positions.length === 0 ? (
                <EmptyState
                  icon={<IconTrade size={26} />}
                  label="Нет открытых позиций"
                  hint="Позиции появятся здесь, как только вы откроете первую сделку."
                  action={{ label: "Перейти к торговле", onClick: onGoTrade }}
                />
              ) : (
                <PositionsTable positions={positions.data.positions} />
              )
            )}
          </>
        )}
        {sub === "spot" && <SpotHoldingsPanel onGoTrade={onGoTrade} />}
        {sub === "orders" && (
          <>
            {orders.isLoading && <LoadingRow />}
            {orders.isError && <ErrorRow label="Ошибка загрузки" onRetry={() => orders.refetch()} />}
            {orders.data && (
              orders.data.orders.length === 0 ? (
                <EmptyState
                  icon={<IconListView size={24} />}
                  label="Нет ордеров"
                  hint={orderStatus === "NEW" ? "Активных ордеров нет — выставленные лимитные и стоп-ордера появятся здесь." : undefined}
                  action={{ label: "Перейти к торговле", onClick: onGoTrade }}
                />
              ) : (
                <OrdersTable orders={orders.data.orders} showStatus={orderStatus === "ALL"} />
              )
            )}
          </>
        )}
        {sub === "history" && (
          <>
            {trades.isLoading && <LoadingRow />}
            {trades.isError && <ErrorRow label="Ошибка загрузки" onRetry={() => trades.refetch()} />}
            {trades.data && (
              trades.data.trades.length === 0 ? (
                <EmptyState icon={<IconOrderHistory size={24} />} label="История сделок пуста" hint="Здесь появятся закрытые сделки с их результатом." />
              ) : (
                <TradesTable trades={trades.data.trades} />
              )
            )}
          </>
        )}
        {sub === "ledger" && (
          <>
            {ledger.isLoading && <LoadingRow />}
            {ledger.isError && <ErrorRow label="Ошибка загрузки" onRetry={() => ledger.refetch()} />}
            {ledger.data && (
              ledger.data.entries.length === 0 ? (
                <EmptyState icon={<IconCoin size={24} />} label="Леджер пуст" hint="Каждое движение по счёту — пополнение, комиссия, PnL — попадёт сюда." />
              ) : (
                <LedgerTable entries={ledger.data.entries} />
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("account");

  if (!user) return null;

  async function handleLogout() {
    await logout();
    toast.info("Вы вышли из системы");
    navigate("/login");
  }

  return (
    // The identity card and the tab strip are the profile's own layout, not
    // part of any tab: they render once and hold their position while the
    // content below them changes, the same way TopBar does for the terminal's
    // views. Only the tab content scrolls, so switching tabs never scrolls
    // the header away or re-runs its entrance animation.
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col p-3">
      <div className="anim-rise relative flex shrink-0 items-center gap-3 overflow-hidden rounded-xl border border-line bg-bg-1 p-3">
        <div className="hero-glow" aria-hidden />
        <div className="relative"><AvatarUpload size={44} /></div>
        <div className="relative min-w-0">
          <div className="truncate text-sm font-semibold text-txt-0">{user.name}</div>
          <div className="truncate text-2xs text-txt-2">{user.email}</div>
        </div>
        <span className={classNames("relative ml-1 shrink-0 rounded px-2 py-0.5 text-2xs font-medium", user.role === "ADMIN" ? "bg-warn/10 text-warn" : "bg-accent-soft text-accent")}>
          {user.role}
        </span>
        <button onClick={handleLogout} className="btn-fx tap-sm relative ml-auto shrink-0 rounded border border-line px-3 py-1.5 text-xs text-txt-2 hover:border-sell hover:text-sell focus-visible:outline focus-visible:outline-sell focus-visible:outline-2">
          {t("common.logout")}
        </button>
      </div>

      {/* Scrolls rather than wraps: five tabs don't fit one line on a 375px
          phone, and wrapping them cost the persistent header a second row of
          height on exactly the screens with least of it to give. No popovers
          live in here, so the overflow-x doesn't clip anything vertically. */}
      <div
        className="no-scrollbar mt-3 flex shrink-0 gap-0.5 overflow-x-auto rounded border border-line bg-bg-1 p-0.5"
        style={{ width: "fit-content", maxWidth: "100%" }}
      >
        {(
          [
            ["account", t("profileTabs.account")],
            ["portfolio", t("profileTabs.portfolio")],
            ["history", t("profileTabs.history")],
            ["security", t("profileTabs.security")],
            ["settings", t("profileTabs.settings")],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={classNames("btn-fx tap-sm shrink-0 whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", tab === id ? "bg-accent-soft text-accent" : "text-txt-2")}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-1">
        {/* Balance and actions in one place: the deposit/withdraw controls and
            the account number on top, then what the account is worth, then
            the last few movements — the sequence someone actually reads,
            instead of two tabs each holding half of it. */}
        {tab === "account" && (
          <AccountOverview onSeeAllHistory={() => setTab("history")} />
        )}

        {tab === "portfolio" && <PortfolioTab onGoTrade={() => navigate("/terminal")} />}

        {tab === "history" && <TradeHistoryTab />}

        {tab === "security" && <SecurityTab />}

        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
