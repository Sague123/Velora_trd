import { useState } from "react";
import { useSpotWallet } from "../../hooks/useSpot";
import { fmtUsd, n } from "../../lib/format";
import { EmptyState, ErrorRow, LoadingRow } from "../common/States";
import { SpotHoldingsList } from "./SpotWalletCard";
import { SpotExchangeModal, type ExchangeMode } from "./SpotExchangeModal";
import { IconCoin } from "../icons/Icon";

/**
 * The Portfolio tab's spot side: the assets themselves, next to (not mixed
 * into) the leveraged positions on the Positions tab.
 *
 * Deliberately narrower than PositionsTable — a spot holding has no leverage,
 * no margin and no liquidation price, so those columns are absent rather than
 * present-and-empty. An empty column implies a number exists and failed to
 * load; a missing one says the concept doesn't apply.
 */
export function SpotHoldingsPanel({ onGoTrade }: { onGoTrade?: () => void }) {
  const wallet = useSpotWallet();
  const [exchange, setExchange] = useState<{ mode: ExchangeMode; asset?: string } | null>(null);

  if (wallet.isLoading) return <LoadingRow />;
  if (wallet.isError) return <ErrorRow label="Ошибка загрузки" onRetry={() => wallet.refetch()} />;
  if (!wallet.data) return null;

  const { holdings, quoteAsset, totalValueUsd } = wallet.data;
  const assetsHeld = holdings.filter((h) => h.asset !== quoteAsset && n(h.qty) > 0);

  if (assetsHeld.length === 0 && n(wallet.data.availableUsd) === 0) {
    return (
      <EmptyState
        icon={<IconCoin size={24} />}
        label="Спот-кошелёк пуст"
        hint="Здесь появятся активы, которыми вы владеете напрямую — без плеча и без цены ликвидации."
        action={onGoTrade ? { label: "Купить актив", onClick: () => setExchange({ mode: "buy" }) } : undefined}
      />
    );
  }

  return (
    <div>
      {exchange && (
        <SpotExchangeModal mode={exchange.mode} initialAsset={exchange.asset} onClose={() => setExchange(null)} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3 py-2 text-2xs">
        <span className="text-txt-3">
          Активы во владении — без плеча, маржи и ликвидации
        </span>
        <span className="text-txt-2">
          Всего: <span className="tabular font-semibold text-txt-0">{fmtUsd(totalValueUsd)}</span>
        </span>
      </div>

      <SpotHoldingsList
        holdings={holdings}
        quoteAsset={quoteAsset}
        onTrade={(asset) => setExchange({ mode: "sell", asset })}
      />
    </div>
  );
}
