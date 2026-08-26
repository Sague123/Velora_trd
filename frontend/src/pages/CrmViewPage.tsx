import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useConsumeViewToken } from "../hooks/useCrm";
import { classNames, fmtDateTime, fmtSigned, fmtUsd } from "../lib/format";
import { ApiError } from "../lib/api";
import { Spinner } from "../components/common/States";
import type { CrmViewSnapshot } from "../lib/types";

/**
 * The public side of a one-time support link. No session, no login, nothing
 * beyond what the token itself authorised: a single read of one account,
 * spent the instant this page asks for it. Reloading this page, or opening
 * the link a second time from anywhere, shows the same "already used"
 * message the server gives for a token that never existed — there is no way
 * to tell the two apart, by design.
 */
export function CrmViewPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const consume = useConsumeViewToken();
  const [snapshot, setSnapshot] = useState<CrmViewSnapshot | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "В ссылке нет токена.");
  // A single-use token must be spent at most once even if React mounts this
  // effect twice (StrictMode) — the same guard VerifyEmailPage uses for the
  // same reason.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    consume.mutateAsync(token)
      .then(setSnapshot)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось открыть ссылку"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-0 p-4 text-txt-0">
        <div className="w-full max-w-sm rounded-xl border border-line bg-bg-1 p-5 text-center">
          <div className="mb-2 text-sm font-semibold text-txt-0">Ссылка недоступна</div>
          <p className="text-2xs text-txt-2">{error}</p>
          <p className="mt-2 text-2xs text-txt-3">
            Ссылки для просмотра одноразовые и действуют 10 минут. Запросите новую в карточке лида.
          </p>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-0">
        <Spinner size={20} />
      </div>
    );
  }

  const { summary, positions, openOrders, trades, ledger } = snapshot.account;

  return (
    <div className="min-h-screen bg-bg-0 p-4 text-txt-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-2.5 text-2xs text-accent">
          Read-only снимок аккаунта {snapshot.leadName ?? ""}, открыт по одноразовой ссылке{snapshot.viewedBy ? ` — ${snapshot.viewedBy}` : ""}.
          Действий отсюда не выполнить: ни ордер, ни перевод — только просмотр.
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-line bg-bg-1 p-3 text-2xs sm:grid-cols-4">
          <div><span className="text-txt-2">Свободно</span><div className="tabular font-medium">{fmtUsd(summary.cash)}</div></div>
          <div><span className="text-txt-2">В марже</span><div className="tabular">{fmtUsd(summary.usedMargin)}</div></div>
          <div><span className="text-txt-2">Накопления</span><div className="tabular">{fmtUsd(summary.savings)}</div></div>
          <div><span className="text-txt-2">Equity</span><div className="tabular font-medium">{fmtUsd(summary.equity)}</div></div>
        </div>

        <Section title={`Открытые позиции (${positions.length})`}>
          {positions.length === 0 ? <Empty /> : (
            <Table head={["Символ", "Сторона", "Объём", "uPnL"]}>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-line-soft/60 tabular">
                  <td className="px-2 py-1">{p.symbol}</td>
                  <td className={p.side === "BUY" ? "px-2 py-1 text-buy" : "px-2 py-1 text-sell"}>{p.side}</td>
                  <td className="px-2 py-1 text-right">{p.qty}</td>
                  <td className={classNames("px-2 py-1 text-right font-medium", Number(p.unrealisedPnl) >= 0 ? "text-buy" : "text-sell")}>
                    {fmtSigned(p.unrealisedPnl)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title={`Открытые ордера (${openOrders.length})`}>
          {openOrders.length === 0 ? <Empty /> : (
            <Table head={["Символ", "Тип", "Цена"]}>
              {openOrders.map((o) => (
                <tr key={o.id} className="border-b border-line-soft/60 tabular">
                  <td className="px-2 py-1">{o.symbol}</td>
                  <td className="px-2 py-1">{o.side} {o.type}</td>
                  <td className="px-2 py-1 text-right">{o.price}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Последние сделки">
          {trades.length === 0 ? <Empty /> : (
            <Table head={["Символ", "PnL", "Закрыта"]}>
              {trades.slice(0, 15).map((t) => (
                <tr key={t.id} className="border-b border-line-soft/60 tabular">
                  <td className="px-2 py-1">{t.symbol}</td>
                  <td className={classNames("px-2 py-1 text-right font-medium", Number(t.pnl) >= 0 ? "text-buy" : "text-sell")}>{fmtSigned(t.pnl)}</td>
                  <td className="px-2 py-1 text-right text-txt-3">{fmtDateTime(t.closedAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Последние операции по счёту">
          {ledger.length === 0 ? <Empty /> : (
            <Table head={["Тип", "Сумма", "Время"]}>
              {ledger.slice(0, 15).map((l) => (
                <tr key={l.id} className="border-b border-line-soft/60 tabular">
                  <td className="px-2 py-1">{l.type}</td>
                  <td className={classNames("px-2 py-1 text-right", Number(l.amount) >= 0 ? "text-buy" : "text-sell")}>{fmtSigned(l.amount)}</td>
                  <td className="px-2 py-1 text-right text-txt-3">{fmtDateTime(l.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <div className="mt-4 text-center">
          <Link to="/login" className="text-2xs text-accent hover:underline">Перейти к входу в Velora</Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-txt-2">{title}</div>
      <div className="rounded-lg border border-line bg-bg-1 p-2">{children}</div>
    </div>
  );
}

function Empty() {
  return <div className="px-3 py-4 text-center text-2xs text-txt-3">Нет данных.</div>;
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-2xs">
      <thead>
        <tr className="border-b border-line-soft text-left text-txt-3">
          {head.map((h, i) => (
            <th key={h} className={classNames("px-2 py-1 font-medium", i > 0 && "text-right")}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
