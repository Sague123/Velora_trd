import { useState } from "react";
import { useSpotWallet } from "../../hooks/useSpot";
import { useAccount } from "../../hooks/useTrading";
import { classNames, fmtPrice, fmtUsd, n } from "../../lib/format";
import { ErrorRow, SkeletonLines } from "../common/States";
import { Tooltip } from "../common/Tooltip";
import { SpotExchangeModal, type ExchangeMode } from "./SpotExchangeModal";
import { SpotTransferModal } from "./SpotTransferModal";
import { IconCoin, IconSwap, IconTrendDown, IconTrendUp, IconWarning } from "../icons/Icon";

const actionCls =
  "btn-fx tap-sm flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-semibold transition-colors";

/**
 * The spot wallet on the Account screen: what is actually owned, asset by
 * asset, and the three things that can be done with it.
 *
 * It sits beside the futures figures rather than replacing them, because the
 * two answer different questions — "what do I own" versus "what is backing my
 * open positions" — and the account's headline numbers are built from both.
 */
export function SpotWalletCard({ compact = false }: { compact?: boolean }) {
  const wallet = useSpotWallet();
  const { data: account } = useAccount(true);
  const [exchange, setExchange] = useState<{ mode: ExchangeMode; asset?: string } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  if (wallet.isLoading) return <SkeletonLines lines={4} />;
  if (wallet.isError) return <ErrorRow label="Не удалось загрузить спот-кошелёк" onRetry={() => wallet.refetch()} />;
  if (!wallet.data) return null;

  const { holdings, availableUsd, totalValueUsd, pricedFully, quoteAsset } = wallet.data;
  const assetsHeld = holdings.filter((h) => h.asset !== quoteAsset && n(h.qty) > 0);

  return (
    <section className="rounded-lg border border-line bg-bg-1">
      {exchange && (
        <SpotExchangeModal mode={exchange.mode} initialAsset={exchange.asset} onClose={() => setExchange(null)} />
      )}
      {transferOpen && <SpotTransferModal onClose={() => setTransferOpen(false)} />}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line-soft px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">
          <IconCoin size={13} /> Спот-кошелёк
        </span>
        <span className="ml-auto text-right">
          <span className="block text-[9px] uppercase tracking-wide text-txt-3">Стоимость активов</span>
          <span className="tabular text-sm font-bold text-txt-0">{fmtUsd(totalValueUsd)}</span>
        </span>
        <span className="text-right">
          <span className="block text-[9px] uppercase tracking-wide text-txt-3">Свободно {quoteAsset}</span>
          <span className="tabular text-sm font-bold text-txt-0">{fmtUsd(availableUsd)}</span>
        </span>
      </div>

      {!pricedFully && (
        <div className="flex items-start gap-2 border-b border-line-soft bg-warn/10 px-3 py-1.5 text-2xs text-warn">
          <IconWarning size={12} className="mt-0.5 shrink-0" />
          <span>По части активов нет актуальной котировки — их стоимость не включена в сумму.</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-line-soft px-3 py-2">
        <button onClick={() => setExchange({ mode: "buy" })} className={classNames(actionCls, "border-buy/50 text-buy hover:bg-buy-soft")}>
          <IconTrendUp size={12} /> Купить
        </button>
        <button
          onClick={() => setExchange({ mode: "sell", asset: assetsHeld[0]?.asset })}
          disabled={assetsHeld.length === 0}
          className={classNames(actionCls, "border-sell/50 text-sell hover:bg-sell-soft disabled:opacity-40")}
        >
          <IconTrendDown size={12} /> Продать
        </button>
        <button
          onClick={() => setExchange({ mode: "convert", asset: assetsHeld[0]?.asset })}
          className={classNames(actionCls, "border-line text-txt-2 hover:text-txt-0")}
        >
          <IconSwap size={12} /> Конвертировать
        </button>
        <button
          onClick={() => setTransferOpen(true)}
          className={classNames(actionCls, "ml-auto border-accent/50 text-accent hover:bg-accent-soft")}
        >
          <IconSwap size={12} /> Перевод ↔ Фьючерсы
        </button>
      </div>

      <SpotHoldingsList holdings={holdings} quoteAsset={quoteAsset} onTrade={(asset) => setExchange({ mode: "sell", asset })} compact={compact} />

      {/* The futures wallet gets one line here, not a second panel: this card
          is about spot, and the only thing worth saying is that the other
          pocket exists and how much is in it. */}
      {account && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-3 py-2 text-2xs">
          <span className="text-txt-3">
            Фьючерсный кошелёк (залог под позиции):{" "}
            <span className="tabular text-txt-1">{fmtUsd(account.equity)}</span>
          </span>
          <Tooltip label="Свободная маржа — это залог, а не свободные деньги: вывести её напрямую нельзя, сначала нужен перевод в спот.">
            <span className="cursor-help text-txt-3 underline decoration-dotted">
              свободно {fmtUsd(account.cash)}
            </span>
          </Tooltip>
        </div>
      )}
    </section>
  );
}

/**
 * The holdings themselves. No Leverage, Liquidation or Margin columns — a spot
 * holding has none of those, and showing empty columns for them would imply
 * the numbers exist and just weren't loaded.
 */
export function SpotHoldingsList({
  holdings, quoteAsset, onTrade, compact = false,
}: {
  holdings: { asset: string; name: string; qty: string | null; price: string | null; value: string | null; priceDecimals: number; priced: boolean; symbol: string | null }[];
  quoteAsset: string;
  onTrade?: (asset: string) => void;
  compact?: boolean;
}) {
  const rows = holdings.filter((h) => h.asset === quoteAsset || n(h.qty) > 0);

  if (rows.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-2xs text-txt-3">
        В спот-кошельке пока пусто — пополните счёт или купите актив.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-2xs">
        <thead>
          <tr className="border-b border-line-soft text-left text-txt-3">
            <th className="px-3 py-1.5 font-medium">Актив</th>
            <th className="px-3 py-1.5 text-right font-medium">Количество</th>
            {!compact && <th className="px-3 py-1.5 text-right font-medium">Цена</th>}
            <th className="px-3 py-1.5 text-right font-medium">Стоимость</th>
            {onTrade && <th className="px-3 py-1.5" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.asset} className="border-b border-line-soft/60 last:border-b-0 hover:bg-bg-2/50">
              <td className="px-3 py-2">
                <div className="font-semibold text-txt-0">{h.asset}</div>
                <div className="text-[9px] text-txt-3">{h.name}</div>
              </td>
              <td className="px-3 py-2 text-right tabular text-txt-1">{h.qty ?? "—"}</td>
              {!compact && (
                <td className="px-3 py-2 text-right tabular text-txt-2">
                  {h.asset === quoteAsset ? "—" : h.priced ? fmtPrice(h.price, h.priceDecimals) : "нет котировки"}
                </td>
              )}
              <td className="px-3 py-2 text-right tabular font-medium text-txt-0">
                {h.value === null ? "—" : fmtUsd(h.value)}
              </td>
              {onTrade && (
                <td className="px-3 py-2 text-right">
                  {h.asset !== quoteAsset && h.symbol && (
                    <button
                      onClick={() => onTrade(h.asset)}
                      className="btn-fx tap-sm rounded border border-line px-2 py-0.5 text-txt-2 hover:border-accent hover:text-accent"
                    >
                      Обменять
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
