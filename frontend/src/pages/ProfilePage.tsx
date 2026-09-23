import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { useOrders, usePositions } from "../hooks/useTrading";
import { AccountOverview } from "../components/profile/AccountOverview";
import { SpotHoldingsPanel } from "../components/profile/SpotHoldingsPanel";
import { HistoryTab } from "../components/profile/HistoryTab";
import { AvatarUpload } from "../components/profile/AvatarUpload";
import { PositionsTable } from "../components/terminal/PositionsTable";
import { OrdersTable } from "../components/terminal/OrdersTable";
import { LoadingRow, ErrorRow, EmptyState } from "../components/common/States";
import { classNames } from "../lib/format";
import { toast } from "../store/toast";
import { IconListView, IconSliders, IconTrade } from "../components/icons/Icon";
import type { OrderStatus } from "../lib/types";
import { Page } from "../components/layout/Page";
import { Tabs } from "../components/common/Tabs";

/** Wallet and Balance were two tabs describing one thing — what's in the
 * account — split by whether you wanted to act on it or read it. They're one
 * `account` tab now; the rest keep their meaning. */
type Tab = "account" | "portfolio" | "history";

/**
 * Current state only — what is open right now. Everything historical (closed
 * trades, the cash journal, the spot journal) lives in the History tab, which
 * shows all of it in one filterable list; this tab used to carry its own
 * "Trade History" and "Ledger" copies of two of those datasets.
 */
function PortfolioTab({ onGoTrade }: { onGoTrade: () => void }) {
  const [sub, setSub] = useState<"positions" | "spot" | "orders">("positions");
  const [orderStatus, setOrderStatus] = useState<OrderStatus | "ALL">("NEW");
  const positions = usePositions(sub === "positions");
  const orders = useOrders(orderStatus, sub === "orders");

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
    <Page width="narrow">
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
        {/* Profile details, preferences and security live on their own page. */}
        <Link to="/settings" className="btn-fx tap-sm relative ml-auto flex shrink-0 items-center gap-1.5 rounded border border-line px-3 py-1.5 text-xs text-txt-2 hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <IconSliders size={13} /> {t("settings.title")}
        </Link>
        <button onClick={handleLogout} className="btn-fx tap-sm relative shrink-0 rounded border border-line px-3 py-1.5 text-xs text-txt-2 hover:border-sell hover:text-sell focus-visible:outline focus-visible:outline-sell focus-visible:outline-2">
          {t("common.logout")}
        </button>
      </div>

      {/* Wraps rather than scrolls. Five tabs don't fit one line on a 375px
          phone; scrolling them was cheaper in height but it put a second
          sideways-draggable strip on a screen that is meant to move only
          vertically — and it clipped "Настройки" off the right edge, so the
          last tab was findable only by dragging. A wrapped second row costs
          one line and hides nothing. */}
      <Tabs
        variant="underline"
        scroll
        className="mt-3 shrink-0 rounded-lg border border-line bg-bg-1"
        value={tab}
        onChange={setTab}
        items={[
          { id: "account", label: t("profileTabs.account") },
          { id: "portfolio", label: t("profileTabs.portfolio") },
          { id: "history", label: t("profileTabs.history") },
        ] satisfies { id: Tab; label: string }[]}
      />

      <div className="mt-3 pb-1">
        {/* Balance and actions in one place: the deposit/withdraw controls and
            the account number on top, then what the account is worth, then
            the last few movements — the sequence someone actually reads,
            instead of two tabs each holding half of it. */}
        {tab === "account" && (
          <AccountOverview onSeeAllHistory={() => setTab("history")} />
        )}

        {tab === "portfolio" && <PortfolioTab onGoTrade={() => navigate("/terminal")} />}

        {tab === "history" && <HistoryTab />}
      </div>
    </Page>
  );
}
