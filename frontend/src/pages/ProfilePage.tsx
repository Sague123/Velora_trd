import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { useSettingsStore } from "../store/settings";
import { useThemeStore } from "../store/theme";
import { useLedger, useOrders, usePositions, useTrades } from "../hooks/useTrading";
import { useChangePassword, useUpdateProfile } from "../hooks/useProfile";
import { BalanceChart } from "../components/profile/BalanceChart";
import { BalanceStats } from "../components/profile/BalanceStats";
import { WalletActions } from "../components/profile/WalletActions";
import { AvatarUpload } from "../components/profile/AvatarUpload";
import { PositionsTable } from "../components/terminal/PositionsTable";
import { OrdersTable } from "../components/terminal/OrdersTable";
import { TradesTable } from "../components/terminal/TradesTable";
import { LedgerTable } from "../components/terminal/LedgerTable";
import { LoadingRow, ErrorRow } from "../components/common/States";
import { classNames, fmtDateTime } from "../lib/format";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";
import { IconMoon, IconSun } from "../components/icons/Icon";
import type { OrderStatus, Timeframe } from "../lib/types";

type Tab = "wallet" | "balance" | "portfolio" | "settings";

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
    <form onSubmit={onSubmit} className="rounded border border-line bg-bg-1 p-4">
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
      <button type="submit" disabled={updateProfile.isPending} className="btn-fx mt-3 rounded bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim disabled:opacity-50">
        {updateProfile.isPending ? "Сохранение…" : "Save"}
      </button>
    </form>
  );
}

function PasswordForm() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const changePassword = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError("Новые пароли не совпадают");
    if (next.length < 10) return setError("Пароль должен быть не короче 10 символов");
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      toast.success("Пароль изменён", "Войдите заново с новым паролем");
      await logout();
      navigate("/login");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось изменить пароль");
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded border border-line bg-bg-1 p-4">
      <h2 className="mb-3 text-xs font-semibold text-txt-0">Change Password</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-2xs text-txt-2">Current Password</span>
          <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)}
            className="w-full rounded border border-line bg-bg-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs text-txt-2">New Password</span>
          <input type="password" required value={next} onChange={(e) => setNext(e.target.value)} placeholder="Мин. 10, буквы и цифры"
            className="w-full rounded border border-line bg-bg-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs text-txt-2">Confirm Password</span>
          <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded border border-line bg-bg-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent" />
        </label>
      </div>
      {error && <div className="mt-3 rounded border border-sell/40 bg-sell-soft px-2.5 py-1.5 text-2xs text-sell">{error}</div>}
      <button type="submit" disabled={changePassword.isPending} className="btn-fx mt-3 rounded bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim disabled:opacity-50">
        {changePassword.isPending ? "Сохранение…" : "Update Password"}
      </button>
      <span className="ml-2 text-2xs text-txt-3">Смена пароля завершит все ваши сессии.</span>
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
      {user && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-line-soft bg-bg-2/40 px-3 py-2 text-2xs text-txt-3">
          {user.accountNumber && (
            <span>Номер счёта (для переводов): <span className="mono font-semibold text-txt-0">{user.accountNumber}</span></span>
          )}
          <span>Registered {fmtDateTime(user.createdAt)}</span>
        </div>
      )}
      <PasswordForm />

      <div className="rounded border border-line bg-bg-1 p-4">
        <h2 className="mb-3 text-xs font-semibold text-txt-0">Appearance</h2>
        <div className="flex gap-1">
          {(["dark", "light"] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)}
              className={classNames("btn-fx flex items-center gap-1.5 rounded border px-3 py-1.5 text-2xs font-medium capitalize", theme === t ? "border-accent bg-accent-soft text-accent" : "border-line text-txt-2")}>
              {t === "dark" ? <IconMoon size={13} /> : <IconSun size={13} />} {t}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded border border-line bg-bg-1 p-4">
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
              <button key={m} onClick={() => s.setDefaultAmountMode(m)} className={classNames("btn-fx rounded border px-3 py-1.5 text-2xs font-medium", s.defaultAmountMode === m ? "border-accent bg-accent-soft text-accent" : "border-line text-txt-2")}>
                {m === "BASE" ? "Base asset" : m === "QUOTE" ? "Total (USD)" : "Margin (USD)"}
              </button>
            ))}
          </div>
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-2xs text-txt-2">Default Chart Timeframe</span>
          <div className="flex flex-wrap gap-1">
            {TIMEFRAMES.map((tf) => (
              <button key={tf} onClick={() => s.setDefaultTimeframe(tf)} className={classNames("btn-fx rounded border px-3 py-1.5 text-2xs font-medium", s.defaultTimeframe === tf ? "border-accent bg-accent-soft text-accent" : "border-line text-txt-2")}>
                {tf}
              </button>
            ))}
          </div>
        </label>

        <label className="flex items-center gap-2 text-2xs text-txt-2">
          <input type="checkbox" checked={s.confirmOnOrder} onChange={(e) => s.setConfirmOnOrder(e.target.checked)} className="accent-accent" />
          Требовать повторное нажатие Buy/Sell для подтверждения
        </label>
      </div>

      <div className="rounded border border-line bg-bg-1 p-4">
        <button onClick={() => { s.reset(); toast.info("Настройки сброшены"); }} className="btn-fx rounded border border-line px-3 py-1.5 text-2xs text-txt-2 hover:border-sell hover:text-sell">
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}

function PortfolioTab() {
  const [sub, setSub] = useState<"positions" | "orders" | "history" | "ledger">("positions");
  const [orderStatus, setOrderStatus] = useState<OrderStatus | "ALL">("NEW");
  const positions = usePositions(sub === "positions");
  const orders = useOrders(orderStatus, sub === "orders");
  const trades = useTrades(sub === "history");
  const ledger = useLedger(sub === "ledger");

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded border border-line bg-bg-1">
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-line px-1">
        {(
          [
            ["positions", "Positions"],
            ["orders", "Orders"],
            ["history", "Trade History"],
            ["ledger", "Ledger"],
          ] as [typeof sub, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} className={classNames("btn-fx border-b-2 px-3 py-2 text-2xs font-medium", sub === id ? "border-accent text-txt-0" : "border-transparent text-txt-2 hover:text-txt-0")}>
            {label}
          </button>
        ))}
        {sub === "orders" && (
          <div className="ml-auto flex gap-0.5 py-1 pr-2">
            {(["NEW", "FILLED", "CANCELLED", "ALL"] as const).map((s) => (
              <button key={s} onClick={() => setOrderStatus(s)} className={classNames("btn-fx rounded px-2 py-1 text-2xs font-medium", orderStatus === s ? "bg-accent-soft text-accent" : "text-txt-2")}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sub === "positions" && (
          <>
            {positions.isLoading && <LoadingRow />}
            {positions.isError && <ErrorRow label="Ошибка загрузки" onRetry={() => positions.refetch()} />}
            {positions.data && <PositionsTable positions={positions.data.positions} />}
          </>
        )}
        {sub === "orders" && (
          <>
            {orders.isLoading && <LoadingRow />}
            {orders.isError && <ErrorRow label="Ошибка загрузки" onRetry={() => orders.refetch()} />}
            {orders.data && <OrdersTable orders={orders.data.orders} showStatus={orderStatus === "ALL"} />}
          </>
        )}
        {sub === "history" && (
          <>
            {trades.isLoading && <LoadingRow />}
            {trades.isError && <ErrorRow label="Ошибка загрузки" onRetry={() => trades.refetch()} />}
            {trades.data && <TradesTable trades={trades.data.trades} />}
          </>
        )}
        {sub === "ledger" && (
          <>
            {ledger.isLoading && <LoadingRow />}
            {ledger.isError && <ErrorRow label="Ошибка загрузки" onRetry={() => ledger.refetch()} />}
            {ledger.data && <LedgerTable entries={ledger.data.entries} />}
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
  const [tab, setTab] = useState<Tab>("wallet");

  if (!user) return null;

  async function handleLogout() {
    await logout();
    toast.info("Вы вышли из системы");
    navigate("/login");
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-3 overflow-y-auto p-3">
      {/* shrink-0: a flex item with overflow-hidden gets an automatic
          min-height of 0 instead of its content height, so inside this
          flex-col scroll container it could get crushed by flex-shrink
          once page content grows past viewport height — the same bug
          class that hid the Overview hero's buttons on mobile. */}
      <div className="anim-rise relative flex shrink-0 items-center gap-3 overflow-hidden rounded-xl border border-line bg-bg-1 p-4">
        <div className="hero-glow" aria-hidden />
        <div className="relative"><AvatarUpload size={56} /></div>
        <div className="relative">
          <div className="text-sm font-semibold text-txt-0">{user.name}</div>
          <div className="text-2xs text-txt-2">{user.email}</div>
        </div>
        <span className={classNames("relative ml-2 rounded px-2 py-0.5 text-2xs font-medium", user.role === "ADMIN" ? "bg-warn/10 text-warn" : "bg-accent-soft text-accent")}>
          {user.role}
        </span>
        <button onClick={handleLogout} className="btn-fx relative ml-auto rounded border border-line px-3 py-1.5 text-xs text-txt-2 hover:border-sell hover:text-sell">
          {t("common.logout")}
        </button>
      </div>

      <div className="flex flex-wrap gap-0.5 rounded border border-line bg-bg-1 p-0.5" style={{ width: "fit-content" }}>
        {(
          [
            ["wallet", t("profileTabs.wallet")],
            ["balance", t("profileTabs.balance")],
            ["portfolio", t("profileTabs.portfolio")],
            ["settings", t("profileTabs.settings")],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={classNames("btn-fx rounded px-3 py-1.5 text-xs font-medium", tab === id ? "bg-accent-soft text-accent" : "text-txt-2")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "wallet" && <WalletActions />}

      {tab === "balance" && (
        <div className="flex flex-col gap-3">
          <BalanceStats />
          <BalanceChart />
        </div>
      )}

      {tab === "portfolio" && <PortfolioTab />}

      {tab === "settings" && <SettingsTab />}
    </div>
  );
}
