import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { useLedger } from "../../hooks/useTrading";
import { useSpotLedger } from "../../hooks/useSpot";
import { fmtAmount, fmtSigned, classNames } from "../../lib/format";
import type { LedgerType, SpotLedgerType } from "../../lib/types";

type Wallet = "SPOT" | "FUTURES";

/** Short, fixed-width, and never wider than the column it sits in — the old
 * "06 Sep, 00:48:47" was being clipped mid-timestamp on a phone, leaving rows
 * labelled "48:47" with no hour and no date. Seconds are the first thing worth
 * dropping: nobody reconciles a deposit to the second. */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * What each journal row means in words. Written from the reader's point of
 * view rather than the database's: the cash journal's own "SPOT_TRANSFER_IN"
 * and the spot journal's "TRANSFER_TO_FUTURES" are the two halves of one
 * transfer, and showing both raw made it look like money moved twice in
 * opposite directions.
 */
const CASH_LABEL: Partial<Record<LedgerType, string>> = {
  DEPOSIT: "Пополнение",
  WITHDRAWAL: "Вывод",
  TRANSFER_IN: "Входящий перевод",
  TRANSFER_OUT: "Исходящий перевод",
  MARGIN_HOLD: "Резерв маржи",
  MARGIN_RELEASE: "Возврат маржи",
  FEE: "Комиссия",
  PNL: "Расчёт PnL",
  ADMIN_ADJUSTMENT: "Корректировка",
  SAVINGS_DEPOSIT: "В накопительный",
  SAVINGS_WITHDRAWAL: "Из накопительного",
  SAVINGS_INTEREST: "Проценты",
  SPOT_TRANSFER_IN: "Перевод: Спот → Фьючерсы",
  SPOT_TRANSFER_OUT: "Перевод: Фьючерсы → Спот",
};

const SPOT_LABEL: Partial<Record<SpotLedgerType, string>> = {
  DEPOSIT: "Пополнение",
  WITHDRAWAL: "Вывод",
  TRANSFER_TO_FUTURES: "Перевод: Спот → Фьючерсы",
  TRANSFER_FROM_FUTURES: "Перевод: Фьючерсы → Спот",
  BUY: "Покупка",
  SELL: "Продажа",
  CONVERT_IN: "Конвертация, зачисление",
  CONVERT_OUT: "Конвертация, списание",
  ADMIN_ADJUSTMENT: "Корректировка",
};

const WALLET_CHIP: Record<Wallet, { label: string; cls: string }> = {
  SPOT: { label: "Спот", cls: "bg-accent-soft text-accent" },
  FUTURES: { label: "Фьючерсы", cls: "bg-warn/15 text-warn" },
};

/**
 * The last few account movements — enough to confirm a deposit landed, not a
 * second copy of the ledger. `onSeeAll` opens the History tab, which holds
 * the full ledger.
 */
export function RecentWalletActivity({ onSeeAll }: { onSeeAll?: () => void } = {}) {
  const { t } = useTranslation();
  const ledger = useLedger(true);
  const spot = useSpotLedger(true);

  // Both journals, newest first. Deposits, withdrawals and asset purchases
  // live in the spot journal while margin, fees and PnL live in the cash one —
  // showing only the cash side here would mean a trader tops up their account
  // and sees nothing happen on the very screen they did it from.
  const entries = useMemo(() => {
    const cash = (ledger.data?.entries ?? []).map((e) => ({
      id: e.id,
      at: e.createdAt,
      label: CASH_LABEL[e.type] ?? e.type.replace(/_/g, " "),
      delta: e.amount,
      asset: "USD",
      balanceAfter: e.balanceAfter,
      wallet: "FUTURES" as Wallet,
    }));
    const assets = (spot.data?.entries ?? []).map((e) => ({
      id: e.id,
      at: e.createdAt,
      label: SPOT_LABEL[e.type] ?? e.type.replace(/_/g, " "),
      delta: e.qty,
      asset: e.asset,
      balanceAfter: e.balanceAfter,
      wallet: "SPOT" as Wallet,
    }));
    return [...cash, ...assets].sort((a, b) => b.at.localeCompare(a.at));
  }, [ledger.data, spot.data]);

  return (
    <div className="rounded-lg border border-line bg-bg-1">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-txt-2">{t("account.recentActivity")}</span>
        {onSeeAll && entries.length > 0 && (
          <button onClick={onSeeAll} className="btn-fx tap-sm rounded px-1.5 text-2xs font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            Смотреть всё
          </button>
        )}
      </div>
      {entries.length ? (
        <table className="w-full table-fixed text-2xs">
          {/* Headers, which this table never had. Without them the two money
              columns are indistinguishable — and for the first movement of any
              asset they hold the same number (a deposit into an empty wallet
              *is* the new balance), which read as a duplicated-value bug. */}
          <thead>
            <tr className="border-b border-line-soft text-left text-txt-3">
              <th className="w-[66px] px-2 py-1.5 font-medium">Время</th>
              <th className="px-2 py-1.5 font-medium">Операция</th>
              <th className="w-[84px] px-2 py-1.5 text-right font-medium">Изменение</th>
              <th className="w-[86px] px-2 py-1.5 text-right font-medium">Баланс после</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 6).map((e) => (
              <tr key={e.id} className="border-b border-line-soft/60 last:border-b-0 hover:bg-bg-2/60">
                <td className="whitespace-nowrap px-2 py-1.5 tabular text-txt-2">{fmtWhen(e.at)}</td>
                <td className="px-2 py-1.5">
                  <div className="truncate font-medium text-txt-0">{e.label}</div>
                  {/* Which wallet this row's balance belongs to, spelled out.
                      A Spot<->Futures transfer writes one row in each journal,
                      and without the chip the two balances looked like the
                      same wallet contradicting itself. */}
                  <span className={classNames("mt-0.5 inline-block rounded px-1 py-px text-3xs font-semibold", WALLET_CHIP[e.wallet].cls)}>
                    {WALLET_CHIP[e.wallet].label}
                  </span>
                </td>
                <td className={classNames("px-2 py-1.5 text-right tabular font-medium", Number(e.delta) >= 0 ? "text-buy" : "text-sell")}>
                  <div className="truncate">{fmtSigned(e.delta, e.asset === "USD" ? 2 : 8)}</div>
                  <div className="text-3xs font-normal text-txt-3">{e.asset}</div>
                </td>
                {/* Balance after, in that row's own asset — a BTC purchase
                    leaves a BTC balance, and formatting it as dollars would
                    read as a hundred-thousand-fold error. */}
                <td className="px-2 py-1.5 text-right tabular text-txt-2">
                  <div className="truncate">{fmtAmount(e.balanceAfter, e.asset === "USD")}</div>
                  <div className="text-3xs text-txt-3">{e.asset}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-3 py-6 text-center text-2xs text-txt-3">Пока нет операций</div>
      )}
    </div>
  );
}
