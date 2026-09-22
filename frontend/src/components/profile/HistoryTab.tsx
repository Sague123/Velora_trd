import { useMemo, useState } from "react";
import { useTrades, useLedger } from "../../hooks/useTrading";
import { useSpotLedger } from "../../hooks/useSpot";
import { classNames, fmtAmount, fmtDateTime, fmtPrice, fmtQty, fmtSigned, fmtUsd, n } from "../../lib/format";
import { fieldCls } from "../../lib/ui";
import type { LedgerType, SpotLedgerType, Trade, LedgerEntry, SpotLedgerEntry } from "../../lib/types";
import { ErrorRow, LoadingRow, EmptyState, SkeletonBar } from "../common/States";
import { SortTh, useTableSort, type SortCol } from "../common/SortableTable";
import { IconOrderHistory } from "../icons/Icon";

/**
 * Every movement on the account, in one place.
 *
 * Before this, the same question ("where did my money go") was spread over
 * four surfaces holding three different datasets — Account's recent-activity
 * preview, Portfolio's Ledger tab, Portfolio's Trade History tab and this
 * tab — and none of them could be filtered down to one kind of operation.
 * They are merged here: closed trades, the cash journal and the spot journal,
 * with one type filter over all three.
 */

type Kind = "TRADE" | "DEPOSIT" | "WITHDRAWAL" | "TRANSFER" | "FEE" | "OTHER";
type Wallet = "SPOT" | "FUTURES";

type Filter = "ALL" | Kind;

type Row = {
  id: string;
  at: string;
  kind: Kind;
  label: string;
  /** Instrument or asset this row is about; null for rows that aren't tied to one. */
  instrument: string | null;
  /** Signed change, in `asset` units. */
  delta: string;
  asset: string;
  balanceAfter: string | null;
  wallet: Wallet;
  /** The trade behind a TRADE row, for the extra detail line. */
  trade?: Trade;
};

const KIND_FILTERS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "Все" },
  { id: "TRADE", label: "Сделки" },
  { id: "DEPOSIT", label: "Пополнения" },
  { id: "WITHDRAWAL", label: "Выводы" },
  { id: "TRANSFER", label: "Переводы" },
  { id: "FEE", label: "Комиссии" },
  // Margin holds/releases, PnL settlement, savings and conversions. They are
  // the bulk of the journal by row count, so without a chip of their own they
  // would only ever be reachable under "Все".
  { id: "OTHER", label: "Прочее" },
];

const CASH_KIND: Record<LedgerType, Kind> = {
  DEPOSIT: "DEPOSIT",
  WITHDRAWAL: "WITHDRAWAL",
  TRANSFER_IN: "TRANSFER",
  TRANSFER_OUT: "TRANSFER",
  SPOT_TRANSFER_IN: "TRANSFER",
  SPOT_TRANSFER_OUT: "TRANSFER",
  FEE: "FEE",
  MARGIN_HOLD: "OTHER",
  MARGIN_RELEASE: "OTHER",
  PNL: "OTHER",
  ADMIN_ADJUSTMENT: "OTHER",
  SAVINGS_DEPOSIT: "OTHER",
  SAVINGS_WITHDRAWAL: "OTHER",
  SAVINGS_INTEREST: "OTHER",
};

const CASH_LABEL: Record<LedgerType, string> = {
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

// A spot buy or sell is a trade in every sense the trader cares about, so it
// files under Сделки rather than under Прочее.
const SPOT_KIND: Record<SpotLedgerType, Kind> = {
  DEPOSIT: "DEPOSIT",
  WITHDRAWAL: "WITHDRAWAL",
  TRANSFER_TO_FUTURES: "TRANSFER",
  TRANSFER_FROM_FUTURES: "TRANSFER",
  BUY: "TRADE",
  SELL: "TRADE",
  CONVERT_IN: "OTHER",
  CONVERT_OUT: "OTHER",
  ADMIN_ADJUSTMENT: "OTHER",
};

const SPOT_LABEL: Record<SpotLedgerType, string> = {
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

const PERIODS: { id: string; label: string; days: number | null }[] = [
  { id: "all", label: "Всё время", days: null },
  { id: "1", label: "Сегодня", days: 1 },
  { id: "7", label: "7 дней", days: 7 },
  { id: "30", label: "30 дней", days: 30 },
  { id: "90", label: "90 дней", days: 90 },
];

/** Module scope so the reference stays stable across renders — see useTableSort. */
const HISTORY_COLS: SortCol<Row, "at" | "label" | "instrument" | "delta">[] = [
  { key: "at", label: "Время", compare: (a, b) => a.at.localeCompare(b.at) },
  { key: "label", label: "Операция", firstDir: 1, compare: (a, b) => a.label.localeCompare(b.label) },
  { key: "instrument", label: "Инструмент", firstDir: 1, compare: (a, b) => (a.instrument ?? "").localeCompare(b.instrument ?? "") },
  // Magnitude in dollars is not comparable across assets (0.5 BTC vs 500 USD),
  // so this ranks within an asset's own scale and leaves the asset visible.
  { key: "delta", label: "Изменение", align: "right", compare: (a, b) => n(a.delta) - n(b.delta) },
];

function tradeRow(t: Trade): Row {
  return {
    id: `trade-${t.id}`,
    at: t.closedAt,
    kind: "TRADE",
    label: `Сделка ${t.side === "BUY" ? "Long" : "Short"}`,
    instrument: t.symbol,
    delta: t.pnl,
    asset: "USD",
    balanceAfter: null,
    wallet: "FUTURES",
    trade: t,
  };
}

function cashRow(e: LedgerEntry): Row {
  return {
    id: `cash-${e.id}`,
    at: e.createdAt,
    kind: CASH_KIND[e.type] ?? "OTHER",
    label: CASH_LABEL[e.type] ?? e.type.replace(/_/g, " "),
    instrument: null,
    delta: e.amount,
    asset: "USD",
    balanceAfter: e.balanceAfter,
    wallet: "FUTURES",
  };
}

function spotRow(e: SpotLedgerEntry): Row {
  return {
    id: `spot-${e.id}`,
    at: e.createdAt,
    kind: SPOT_KIND[e.type] ?? "OTHER",
    label: SPOT_LABEL[e.type] ?? e.type.replace(/_/g, " "),
    instrument: e.asset,
    delta: e.qty,
    asset: e.asset,
    balanceAfter: e.balanceAfter,
    wallet: "SPOT",
  };
}

// Spelled out rather than built as `text-${tone}`: Tailwind only emits classes
// it can find as complete strings in the source.
const STAT_TONE = { buy: "text-buy", sell: "text-sell", warn: "text-warn" } as const;

function Stat({ label, value, tone }: { label: string; value: string; tone?: keyof typeof STAT_TONE }) {
  return (
    <div className="rounded-lg border border-line bg-bg-1 px-3 py-2">
      <div className="text-2xs text-txt-2">{label}</div>
      <div className={classNames("tabular mt-0.5 text-sm font-semibold", tone ? STAT_TONE[tone] : "text-txt-0")}>{value}</div>
    </div>
  );
}

export function HistoryTab() {
  const trades = useTrades(true);
  const ledger = useLedger(true);
  const spot = useSpotLedger(true);

  // "Все" on arrival, deliberately: Account's recent-activity card links here
  // and its preview spans every kind of row (including spot buys and sells),
  // so any narrower default would hide rows the user just saw — which is the
  // bug that link had in the first place.
  const [kind, setKind] = useState<Filter>("ALL");
  const [instrument, setInstrument] = useState("all");
  const [period, setPeriod] = useState("all");

  const isLoading = trades.isLoading || ledger.isLoading || spot.isLoading;
  const isError = trades.isError || ledger.isError || spot.isError;

  const all = useMemo(() => [
    ...(trades.data?.trades ?? []).map(tradeRow),
    ...(ledger.data?.entries ?? []).map(cashRow),
    ...(spot.data?.entries ?? []).map(spotRow),
  ], [trades.data, ledger.data, spot.data]);

  const instruments = useMemo(
    () => [...new Set(all.map((r) => r.instrument).filter((s): s is string => !!s))].sort(),
    [all],
  );

  const rows = useMemo(() => {
    const days = PERIODS.find((p) => p.id === period)?.days ?? null;
    const cutoff = days === null ? null : Date.now() - days * 24 * 60 * 60 * 1000;
    return all.filter((r) => {
      if (kind !== "ALL" && r.kind !== kind) return false;
      if (instrument !== "all" && r.instrument !== instrument) return false;
      if (cutoff !== null && new Date(r.at).getTime() < cutoff) return false;
      return true;
    });
  }, [all, kind, instrument, period]);

  const { sorted, sort, toggle } = useTableSort(rows, HISTORY_COLS, { key: "at", dir: -1 });

  // Computed from the trades actually on screen, not from every trade ever —
  // a summary that ignores the filter above it is a summary of something the
  // reader isn't looking at. Hidden entirely when the filter leaves no trades.
  const visibleTrades = useMemo(() => sorted.filter((r) => r.trade).map((r) => r.trade!), [sorted]);
  const totals = useMemo(() => {
    let pnl = 0, fees = 0, wins = 0;
    for (const t of visibleTrades) {
      const p = n(t.pnl);
      pnl += p;
      fees += n(t.fee);
      if (p > 0) wins++;
    }
    return { pnl, fees, net: pnl - fees, winRate: visibleTrades.length ? Math.round((wins / visibleTrades.length) * 100) : null };
  }, [visibleTrades]);

  if (isError) {
    return (
      <ErrorRow
        label="Не удалось загрузить историю"
        onRetry={() => { trades.refetch(); ledger.refetch(); spot.refetch(); }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-bg-1 p-2.5">
        <div className="flex flex-wrap gap-1">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setKind(f.id)}
              className={classNames(
                "btn-fx tap-sm rounded-full px-3 py-1 text-2xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                kind === f.id ? "bg-accent-soft text-accent" : "text-txt-2 hover:text-txt-0",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={instrument} onChange={(e) => setInstrument(e.target.value)} className={fieldCls("sm", "w-auto min-w-[150px]")}>
            <option value="all">Все инструменты</option>
            {instruments.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className={fieldCls("sm", "w-auto min-w-[130px]")}>
            {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="ml-auto self-center text-2xs text-txt-3">
            {isLoading ? "…" : `${sorted.length} ${sorted.length === 1 ? "операция" : "операций"}`}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-line bg-bg-1 px-3 py-2"><SkeletonBar height={22} /></div>
          ))}
        </div>
      ) : visibleTrades.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Сделок в выборке" value={String(visibleTrades.length)} />
          <Stat label="Валовый P&L" value={fmtSigned(totals.pnl)} tone={totals.pnl >= 0 ? "buy" : "sell"} />
          <Stat label="Комиссии закрытия" value={fmtUsd(totals.fees, 4)} tone="warn" />
          <Stat label="Чистый результат" value={fmtSigned(totals.net)} tone={totals.net >= 0 ? "buy" : "sell"} />
        </div>
      )}

      <div className="rounded-lg border border-line bg-bg-1">
        {isLoading && <LoadingRow />}
        {!isLoading && sorted.length === 0 && (
          <EmptyState
            icon={<IconOrderHistory size={24} />}
            label={all.length === 0 ? "История пуста" : "Ничего не найдено"}
            hint={all.length === 0
              ? "Здесь появятся сделки, пополнения, выводы, переводы и комиссии."
              : "Под выбранные фильтры не попала ни одна операция — попробуйте расширить период или снять фильтр по типу."}
          />
        )}
        {!isLoading && sorted.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-2xs">
              <thead>
                <tr className="border-b border-line-soft text-left text-txt-3">
                  {HISTORY_COLS.map((c) => <SortTh key={c.key} col={c} sort={sort} onToggle={toggle} />)}
                  <th className="px-2 py-1.5 text-right font-medium">Баланс после</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="border-b border-line-soft/60 tabular last:border-b-0 hover:bg-bg-2/60">
                    <td className="whitespace-nowrap px-2 py-1.5 text-txt-2">{fmtDateTime(r.at)}</td>
                    <td className="px-2 py-1.5">
                      <div className="font-medium text-txt-0">{r.label}</div>
                      <span className={classNames("mt-0.5 inline-block rounded px-1 py-px text-3xs font-semibold", WALLET_CHIP[r.wallet].cls)}>
                        {WALLET_CHIP[r.wallet].label}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-txt-1">
                      {r.instrument ?? "—"}
                      {r.trade && (
                        <div className="text-3xs text-txt-3">
                          {fmtQty(r.trade.qty)} · {fmtPrice(r.trade.entryPrice, 4)} → {fmtPrice(r.trade.exitPrice, 4)}
                        </div>
                      )}
                    </td>
                    <td className={classNames("px-2 py-1.5 text-right font-medium", n(r.delta) >= 0 ? "text-buy" : "text-sell")}>
                      <div>{fmtSigned(r.delta, r.asset === "USD" ? 2 : 8)}</div>
                      <div className="text-3xs font-normal text-txt-3">{r.asset}</div>
                    </td>
                    {/* In this row's own asset: a BTC purchase leaves a BTC
                        balance, and formatting it as dollars would read as a
                        hundred-thousand-fold error. */}
                    <td className="px-2 py-1.5 text-right text-txt-2">
                      {r.balanceAfter === null ? "—" : (
                        <>
                          <div>{fmtAmount(r.balanceAfter, r.asset === "USD")}</div>
                          <div className="text-3xs text-txt-3">{r.asset}</div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
