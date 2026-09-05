import { useState, type ComponentType } from "react";
import { useAccount } from "../../hooks/useTrading";
import { useAuthStore } from "../../store/auth";
import { classNames, fmtSigned, fmtUsd } from "../../lib/format";
import { WalletFlowModal, type WalletMethod } from "./WalletFlowModal";
import { SpotWalletCard } from "./SpotWalletCard";
import { SpotExchangeModal, type ExchangeMode } from "./SpotExchangeModal";
import { SpotTransferModal } from "./SpotTransferModal";
import { BalanceStats } from "./BalanceStats";
import { BalanceChart } from "./BalanceChart";
import { RecentWalletActivity } from "./WalletActions";
import { ErrorRow, SkeletonLines } from "../common/States";
import { Tooltip } from "../common/Tooltip";
import {
  IconChevron, IconRefresh, IconSwap, IconWalletMinus, IconWalletPlus,
} from "../icons/Icon";
import type { KycStatus, Role } from "../../lib/types";

const ROLE_LABEL: Record<Role, string> = {
  USER: "Стандартный",
  MANAGER: "Менеджер",
  ADMIN: "Администратор",
};

// Same wording as SecurityTab's own KYC badge, so a status reads the same way
// wherever it shows up on the platform.
const KYC_LABEL: Record<KycStatus, { text: string; cls: string }> = {
  NONE: { text: "не подтверждена", cls: "text-txt-2" },
  PENDING: { text: "на проверке", cls: "text-warn" },
  APPROVED: { text: "подтверждена", cls: "text-buy" },
  REJECTED: { text: "отклонена", cls: "text-sell" },
};

type ActionTone = "buy" | "sell" | "accent";
const ACTION_TONE_CLS: Record<ActionTone, string> = {
  buy: "border-buy/30 bg-buy-soft text-buy hover:brightness-110",
  sell: "border-sell/30 bg-sell-soft text-sell hover:brightness-110",
  accent: "border-accent/30 bg-accent-soft text-accent hover:brightness-110",
};

function ActionTile({
  Icon, label, tone, onClick,
}: {
  Icon: ComponentType<{ size?: number }>;
  label: string;
  tone: ActionTone;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "btn-fx tap flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors",
        ACTION_TONE_CLS[tone]
      )}
    >
      <Icon size={18} />
      <span className="text-2xs font-bold">{label}</span>
    </button>
  );
}

/** A section that starts closed — used only for Trading Statistics, which is
 * detail a trader checks occasionally rather than the reason they opened this
 * screen. Everything above it (balance, spot, actions, futures) stays open,
 * since those are exactly what the screen exists to show first. */
function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-line bg-bg-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3.5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-txt-0">{title}</span>
        <IconChevron size={14} direction={open ? "up" : "down"} className="text-txt-3" />
      </button>
      {open && <div className="border-t border-line-soft p-3.5">{children}</div>}
    </section>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "buy" | "sell" }) {
  return (
    <div className="rounded-lg bg-bg-2 px-2.5 py-2 text-center">
      <div className="text-2xs text-txt-3">{label}</div>
      <div className={classNames("mt-1 tabular text-sm font-bold", tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : "text-txt-0")}>
        {value}
      </div>
    </div>
  );
}

/**
 * The Account screen, rebuilt around one flow: how much is there, what it's
 * made of, what you can do with it, then the detail you don't need every
 * time. Total Balance leads; the four actions sit *after* Spot, not right
 * under the number, so the balance and its own breakdown get read first.
 */
export function AccountOverview({ onSeeAllHistory }: { onSeeAllHistory?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const account = useAccount(!!user);
  const [walletModal, setWalletModal] = useState<WalletMethod | null>(null);
  const [exchange, setExchange] = useState<{ mode: ExchangeMode; asset?: string } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-4">
      {walletModal && <WalletFlowModal method={walletModal} onClose={() => setWalletModal(null)} />}
      {exchange && <SpotExchangeModal mode={exchange.mode} initialAsset={exchange.asset} onClose={() => setExchange(null)} />}
      {transferOpen && <SpotTransferModal onClose={() => setTransferOpen(false)} />}

      {/* ---- Total Balance ---- */}
      <section className="anim-rise relative overflow-hidden rounded-xl border border-line bg-bg-1 p-5">
        <div className="hero-glow" aria-hidden />
        {account.isLoading ? (
          <SkeletonLines lines={2} />
        ) : account.isError || !account.data ? (
          <ErrorRow label="Не удалось загрузить баланс" onRetry={() => account.refetch()} />
        ) : (
          <div className="relative">
            <div className="text-2xs font-medium uppercase tracking-wide text-txt-2">Total Balance</div>
            <div className="tabular mt-1 text-3xl font-bold text-txt-0 sm:text-4xl">{fmtUsd(account.data.totalBalance)}</div>
            {/* No daily-change figure here: the platform has no snapshot of
                what the combined spot+futures total was at the start of the
                day to honestly compare against, and a made-up percentage
                would be exactly the kind of number this screen shouldn't
                show. The breakdown below is real. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-txt-3">
              <span>Спот: <span className="tabular text-txt-2">{fmtUsd(account.data.spotValue)}</span></span>
              <span>Фьючерсы: <span className="tabular text-txt-2">{fmtUsd(account.data.equity)}</span></span>
              <Tooltip label="Свободные средства спот-кошелька. Залог во фьючерсном кошельке сюда не входит — вывести его можно только после перевода в спот.">
                <span className="cursor-help underline decoration-dotted">
                  Доступно к выводу: <span className="tabular text-txt-2">{fmtUsd(account.data.availableToWithdraw)}</span>
                </span>
              </Tooltip>
            </div>
          </div>
        )}
      </section>

      {/* ---- Spot: summary, quick assets, hide-small, show all/collapse ---- */}
      <SpotWalletCard onTrade={(asset) => setExchange({ mode: "sell", asset })} />

      {/* ---- Actions: after Spot, not under the balance ---- */}
      <div className="grid grid-cols-4 gap-2">
        <ActionTile Icon={IconWalletPlus} label="Deposit" tone="buy" onClick={() => setWalletModal("deposit")} />
        <ActionTile Icon={IconWalletMinus} label="Withdraw" tone="sell" onClick={() => setWalletModal("withdraw")} />
        <ActionTile Icon={IconSwap} label="Convert" tone="accent" onClick={() => setExchange({ mode: "convert" })} />
        <ActionTile Icon={IconRefresh} label="Transfer" tone="accent" onClick={() => setTransferOpen(true)} />
      </div>
      <button
        type="button"
        onClick={() => setWalletModal("transfer")}
        className="btn-fx -mt-2 self-start text-2xs text-txt-3 hover:text-accent hover:underline"
      >
        Отправить другому пользователю Velora →
      </button>

      {/* ---- Futures: Equity, Available, Unrealized PnL ---- */}
      {account.data && (
        <section className="rounded-lg border border-line bg-bg-1 p-3.5">
          <div className="mb-3">
            <div className="text-sm font-semibold text-txt-0">Фьючерсы</div>
            <div className="text-2xs text-txt-3">Торговый счёт с плечом — залог под открытые позиции</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Equity" value={fmtUsd(account.data.equity)} />
            <MiniStat label="Available" value={fmtUsd(account.data.cash)} />
            <MiniStat
              label="Unrealized PnL"
              value={fmtSigned(account.data.unrealisedPnl)}
              tone={Number(account.data.unrealisedPnl) >= 0 ? "buy" : "sell"}
            />
          </div>
        </section>
      )}

      {/* ---- Trading statistics: collapsed by default ---- */}
      <CollapsibleSection title="Статистика торговли">
        <BalanceStats />
      </CollapsibleSection>

      {/* ---- Account: ID / type / verification ---- */}
      <section className="rounded-lg border border-line bg-bg-1 p-3.5">
        <div className="mb-3 text-sm font-semibold text-txt-0">Аккаунт</div>
        <div className="flex items-center justify-between border-b border-line-soft py-2 text-2xs">
          <span className="text-txt-3">Номер счёта</span>
          <span className="tabular font-semibold text-txt-1">{user.accountNumber ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between border-b border-line-soft py-2 text-2xs">
          <span className="text-txt-3">Тип аккаунта</span>
          <span className="font-semibold text-txt-1">{ROLE_LABEL[user.role]}</span>
        </div>
        <div className="flex items-center justify-between py-2 text-2xs">
          <span className="text-txt-3">Верификация</span>
          <span className={classNames("font-semibold", KYC_LABEL[user.kycStatus ?? "NONE"].cls)}>
            {KYC_LABEL[user.kycStatus ?? "NONE"].text}
          </span>
        </div>
      </section>

      <BalanceChart />
      <RecentWalletActivity onSeeAll={onSeeAllHistory} />
    </div>
  );
}
