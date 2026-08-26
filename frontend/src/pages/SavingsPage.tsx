import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useAccount } from "../hooks/useTrading";
import {
  useOpenSavings, useSavings, useSavingsDeposit, useSavingsHistory, useSavingsWithdraw,
} from "../hooks/useSavings";
import { LedgerTable } from "../components/terminal/LedgerTable";
import { LoadingRow } from "../components/common/States";
import { SiteFooter } from "../components/layout/SiteFooter";
import { classNames, fmtDateTime, fmtUsd } from "../lib/format";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";
import type { SavingsAccount, SavingsPlan } from "../lib/types";
import { IconLock, IconTrendUp } from "../components/icons/Icon";

const inputCls = "w-full rounded border border-line bg-bg-2 px-2 py-1.5 text-xs tabular outline-none focus:border-accent";
const labelCls = "mb-1 block text-2xs font-medium text-txt-2";

function PlanCard({
  plan, disabled, onOpen, busy,
}: {
  plan: SavingsPlan;
  disabled: boolean;
  busy: boolean;
  onOpen: (planType: string, amount: string) => void;
}) {
  const [amount, setAmount] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return toast.warning("Введите сумму");
    onOpen(plan.type, value.toFixed(2));
    setAmount("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col rounded-lg border border-line bg-bg-1 p-3.5">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-txt-0">{plan.label}</span>
        <span className="tabular text-sm font-bold text-buy">{plan.apy}%</span>
      </div>
      <div className="mb-2 flex items-center gap-1 text-2xs text-txt-3">
        {plan.lockDays > 0 ? (
          <><IconLock size={11} /> заблокировано {plan.lockDays} дней</>
        ) : (
          <><IconTrendUp size={11} /> снятие в любой момент</>
        )}
      </div>
      <p className="mb-3 flex-1 text-2xs leading-relaxed text-txt-2">{plan.description}</p>

      <label className="mb-2 block">
        <span className={labelCls}>Сумма</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          disabled={disabled}
          className={inputCls}
          placeholder="0.00"
        />
      </label>
      <button
        type="submit"
        disabled={disabled || busy}
        className="btn-fx rounded-lg bg-accent-fill px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
      >
        Открыть счёт
      </button>
    </form>
  );
}

function AccountRow({ account }: { account: SavingsAccount }) {
  const deposit = useSavingsDeposit();
  const withdraw = useSavingsWithdraw();
  const [amount, setAmount] = useState("");
  const busy = deposit.isPending || withdraw.isPending;

  async function run(action: "deposit" | "withdraw") {
    const value = Number(amount);
    if (action === "deposit" && !(value > 0)) return toast.warning("Введите сумму");
    try {
      if (action === "deposit") {
        await deposit.mutateAsync({ id: account.id, amount: value.toFixed(2) });
        toast.success("Счёт пополнен", fmtUsd(value));
      } else {
        const res = await withdraw.mutateAsync({ id: account.id, amount: value > 0 ? value.toFixed(2) : undefined });
        toast.success(res.closed ? "Счёт закрыт" : "Средства сняты", fmtUsd(res.closed ? account.balance : value));
      }
      setAmount("");
    } catch (e) {
      toast.error("Операция не выполнена", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-bg-1">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-bg-2/40 px-3 py-2">
        <span className="text-xs font-semibold text-txt-0">{account.planLabel}</span>
        <span className="rounded bg-buy-soft px-1.5 py-0.5 text-2xs font-medium text-buy">{account.apy}% годовых</span>
        {account.locked && account.lockedUntil && (
          <span className="flex items-center gap-1 rounded bg-warn/10 px-1.5 py-0.5 text-2xs font-medium text-warn">
            <IconLock size={10} /> до {fmtDateTime(account.lockedUntil).split(",")[0]}
          </span>
        )}
        <span className="ml-auto tabular text-sm font-semibold text-txt-0">{fmtUsd(account.balance)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 py-2 text-2xs sm:grid-cols-3">
        <div><span className="text-txt-2">Начисление в день: </span><span className="tabular text-txt-1">{fmtUsd(account.dailyInterest, 4)}</span></div>
        <div><span className="text-txt-2">За год при этой сумме: </span><span className="tabular text-txt-1">{fmtUsd(account.projectedYear)}</span></div>
        <div><span className="text-txt-2">Открыт: </span><span className="tabular text-txt-1">{fmtDateTime(account.createdAt).split(",")[0]}</span></div>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-line-soft px-3 py-2">
        <label className="min-w-[120px] flex-1">
          <span className={labelCls}>Сумма</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={inputCls} placeholder="0.00" />
        </label>
        <button
          onClick={() => run("deposit")}
          disabled={busy || account.locked}
          title={account.locked ? "Срочный вклад пополнить нельзя — откройте ещё один счёт" : undefined}
          className="btn-fx rounded border border-buy/40 px-2.5 py-1.5 text-2xs font-medium text-buy hover:bg-buy-soft disabled:opacity-40"
        >
          Пополнить
        </button>
        <button
          onClick={() => run("withdraw")}
          disabled={busy || account.locked}
          title={account.locked ? "Средства заблокированы до окончания срока" : undefined}
          className="btn-fx rounded border border-line px-2.5 py-1.5 text-2xs font-medium text-txt-1 hover:border-sell/40 hover:text-sell disabled:opacity-40"
        >
          {Number(amount) > 0 ? "Снять" : "Снять всё и закрыть"}
        </button>
      </div>
    </div>
  );
}

/**
 * The savings section. Everything money-shaped here is rendered by the same
 * components the trading account already uses — the ledger table in particular
 * — because savings movements are ordinary ledger entries, and showing them in
 * a bespoke table would imply they were something else.
 */
export function SavingsPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useSavings();
  const history = useSavingsHistory();
  const account = useAccount(!!user);
  const open = useOpenSavings();

  const kycBlocked = !!data?.kycRequired && user?.kycStatus !== "APPROVED";

  async function handleOpen(planType: string, amount: string) {
    try {
      await open.mutateAsync({ planType, amount });
      toast.success("Накопительный счёт открыт", fmtUsd(amount));
    } catch (e) {
      toast.error("Не удалось открыть счёт", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col overflow-y-auto p-3">
      <div className="anim-rise mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-sm font-semibold text-txt-0">Накопительные счета</h1>
        <div className="flex gap-4 text-2xs">
          <div><span className="text-txt-2">Свободно: </span><span className="tabular font-medium text-txt-0">{fmtUsd(account.data?.cash)}</span></div>
          <div><span className="text-txt-2">В накоплениях: </span><span className="tabular font-medium text-txt-0">{fmtUsd(data?.totalSaved)}</span></div>
          <div><span className="text-txt-2">Всего начислено: </span><span className="tabular font-medium text-buy">{fmtUsd(data?.totalEarned)}</span></div>
        </div>
      </div>

      {kycBlocked && (
        <div className="anim-rise mb-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-2xs text-warn">
          Накопительные счета доступны после подтверждения личности.{" "}
          <Link to="/profile" className="underline decoration-dotted hover:text-txt-0">
            Подать заявку в профиле
          </Link>
          .
        </div>
      )}

      <div className="anim-rise-2 mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.plans ?? []).map((plan) => (
          <PlanCard key={plan.type} plan={plan} disabled={kycBlocked} busy={open.isPending} onOpen={handleOpen} />
        ))}
      </div>

      <div className="anim-rise-3 mb-4">
        <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">Мои счета</div>
        {isLoading && <LoadingRow />}
        {!isLoading && (data?.accounts.length ?? 0) === 0 && (
          <div className="rounded-lg border border-dashed border-line bg-bg-1 px-3 py-8 text-center text-2xs text-txt-3">
            Пока нет открытых накопительных счетов.
          </div>
        )}
        <div className="space-y-2">
          {(data?.accounts ?? []).map((a) => <AccountRow key={a.id} account={a} />)}
        </div>
      </div>

      <div className={classNames("anim-rise-3 rounded-lg border border-line bg-bg-1 p-3")}>
        <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">История начислений и переводов</div>
        <p className="mb-2 text-2xs text-txt-3">
          Проценты начисляются раз в сутки и приходят на основной баланс — не в тело вклада, поэтому доход по
          срочному счёту можно тратить, пока сам вклад ещё заблокирован.
        </p>
        {history.isLoading ? <LoadingRow /> : <LedgerTable entries={history.data?.entries ?? []} />}
      </div>

      <SiteFooter compact />
    </div>
  );
}
