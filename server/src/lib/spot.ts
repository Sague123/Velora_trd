import { db, newId, now, asBig, asNum } from "../db.js";
import { badRequest, conflict, notFound } from "./errors.js";
import { mul, out, SCALE } from "./money.js";
import { computeExchange } from "./spotMath.js";
import { markPrice, tradeableMark } from "../engine/execution.js";

/**
 * The spot wallet: real quantities of real assets, owned outright.
 *
 * This is the counterpart to the futures wallet (accounts.cash_scaled), and
 * the difference is the whole point of the file. Futures money is collateral —
 * it backs leveraged positions, it can be used as margin, and a position can
 * be liquidated against it. Spot money is not collateral: 0.42 BTC here is
 * 0.42 BTC, it has no leverage, no liquidation price and no margin, and the
 * only things that change it are deposits, withdrawals, transfers to and from
 * futures, and exchanges between assets.
 *
 * Every one of those goes through postSpot() below, which is to spot_balances
 * exactly what postLedger() is to accounts: the single writer, refusing to
 * overdraw, journalling every move so the balance can be rebuilt from the
 * journal alone.
 */

export const SPOT_QUOTE = "USD";

/** Which instrument categories represent an asset someone can actually hold.
 * PERP is deliberately absent: a perpetual is a derivative contract, and
 * holding one is a position, not an asset — that's what the futures wallet is
 * for, and conflating them is exactly what this split exists to stop. */
const SPOT_CATEGORIES = ["SPOT", "COMMODITY"];

export type SpotLedgerType =
  | "DEPOSIT" | "WITHDRAWAL"
  | "TRANSFER_TO_FUTURES" | "TRANSFER_FROM_FUTURES"
  | "BUY" | "SELL" | "CONVERT_IN" | "CONVERT_OUT"
  | "ADMIN_ADJUSTMENT";

const q = {
  instruments: db.prepare(`
    SELECT i.symbol, i.name, i.category, i.price_decimals, p.price_scaled
    FROM instruments i LEFT JOIN price_snapshots p ON p.symbol = i.symbol
    WHERE i.active = 1 AND i.category = ANY(?)
    ORDER BY i.symbol
  `),
  balance: db.prepare("SELECT qty_scaled FROM spot_balances WHERE user_id = ? AND asset = ?"),
  balances: db.prepare("SELECT asset, qty_scaled FROM spot_balances WHERE user_id = ? ORDER BY asset"),
  upsert: db.prepare(`
    INSERT INTO spot_balances (user_id, asset, qty_scaled, updated_at)
    VALUES (@userId, @asset, @qty, @ts)
    ON CONFLICT (user_id, asset) DO UPDATE SET qty_scaled = @qty, updated_at = @ts
  `),
  insJournal: db.prepare(`
    INSERT INTO spot_ledger (id, user_id, asset, type, qty_scaled, balance_after_scaled,
                             usd_value_scaled, ref_type, ref_id, note, created_at)
    VALUES (@id, @userId, @asset, @type, @qty, @balanceAfter, @usdValue, @refType, @refId, @note, @createdAt)
  `),
  journal: db.prepare(`
    SELECT * FROM spot_ledger WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
  `),
};

export interface SpotAssetInfo {
  asset: string;
  name: string;
  /** The instrument this asset is priced and traded through. Null for USD,
   * which is the unit everything else is priced in. */
  symbol: string | null;
  category: string;
  priceDecimals: number;
}

/** The asset a pair is *of*: BTCUSDT holds BTC, PAXGUSDT holds PAX Gold.
 * Anything not quoted in USDT is skipped rather than guessed at. */
function baseAssetOf(symbol: string): string | null {
  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : null;
}

/**
 * Every asset the spot wallet can hold, derived from the instrument catalog
 * rather than a hardcoded list — so an instrument an admin activates becomes
 * spot-tradeable with it, and one they retire stops being offered.
 *
 * USD leads the list because it is the quote asset: it is what deposits arrive
 * as, what withdrawals leave as, and what every other asset's value is
 * expressed in.
 */
export async function spotAssets(): Promise<SpotAssetInfo[]> {
  const rows = (await q.instruments.all(SPOT_CATEGORIES)) as any[];
  const assets: SpotAssetInfo[] = [
    { asset: SPOT_QUOTE, name: "US Dollar", symbol: null, category: "CASH", priceDecimals: 2 },
  ];
  const seen = new Set([SPOT_QUOTE]);
  for (const r of rows) {
    const asset = baseAssetOf(r.symbol);
    if (!asset || seen.has(asset)) continue;
    seen.add(asset);
    assets.push({
      asset,
      name: r.name,
      symbol: r.symbol,
      category: r.category,
      priceDecimals: asNum(r.price_decimals),
    });
  }
  return assets;
}

export async function assetInfo(asset: string): Promise<SpotAssetInfo> {
  const found = (await spotAssets()).find((a) => a.asset === asset.toUpperCase());
  if (!found) throw notFound(`Актив ${asset} недоступен в спот-кошельке`);
  return found;
}

/** Last known price in USD — for display. USD is 1 by definition. */
export async function assetPriceUsd(info: SpotAssetInfo): Promise<bigint | null> {
  if (info.symbol === null) return SCALE;
  return markPrice(info.symbol);
}

/** The price a spot exchange may actually execute at: fresh, or the symbol is
 * halted and nothing trades — the same rule the futures side already applies
 * (see engine/execution.ts's tradeableMark). */
export async function assetTradeablePriceUsd(info: SpotAssetInfo): Promise<bigint> {
  if (info.symbol === null) return SCALE;
  return tradeableMark(info.symbol);
}

export const usdValueOf = (qtyScaled: bigint, priceUsd: bigint): bigint => mul(qtyScaled, priceUsd);

export async function spotBalance(userId: string, asset: string): Promise<bigint> {
  const row = (await q.balance.get(userId, asset)) as { qty_scaled: bigint } | undefined;
  return row ? asBig(row.qty_scaled) : 0n;
}

export interface SpotMove {
  userId: string;
  asset: string;
  type: SpotLedgerType;
  /** Signed: positive credits the wallet, negative debits it. */
  qtyScaled: bigint;
  /** What this leg was worth in USD when it happened. Omit for USD legs. */
  usdValueScaled?: bigint;
  refType?: string;
  refId?: string;
  note?: string;
}

/**
 * The ONLY sanctioned way to change a spot balance. Writes the journal row and
 * the balance together, refuses to overdraw, and must be called inside tx().
 *
 * There is no `allowNegative` escape hatch here, unlike postLedger's — that
 * one exists because a realised futures loss can legitimately exceed the cash
 * on hand. Spot has no leverage, so nothing can ever take out more of an asset
 * than is held; a negative spot balance would only ever be a bug.
 */
export async function postSpot(move: SpotMove): Promise<bigint> {
  const asset = move.asset.toUpperCase();
  const current = await spotBalance(move.userId, asset);
  const next = current + move.qtyScaled;
  if (next < 0n) {
    throw conflict("INSUFFICIENT_FUNDS", `Недостаточно ${asset} в спот-кошельке`);
  }

  const ts = now();
  await q.upsert.run({ userId: move.userId, asset, qty: next, ts });
  await q.insJournal.run({
    id: newId(),
    userId: move.userId,
    asset,
    type: move.type,
    qty: move.qtyScaled,
    balanceAfter: next,
    usdValue: move.usdValueScaled ?? null,
    refType: move.refType ?? null,
    refId: move.refId ?? null,
    note: move.note ?? null,
    createdAt: ts,
  });
  return next;
}

export interface SpotHolding {
  asset: string;
  name: string;
  symbol: string | null;
  qty: string | null;
  price: string | null;
  value: string | null;
  priceDecimals: number;
  /** False when there is no usable quote — the value is then unknown, and is
   * reported as null rather than as zero or as a stale guess. */
  priced: boolean;
}

/**
 * The wallet as the client sees it: every held asset with its quantity, its
 * price and what that comes to in USD, plus the total.
 *
 * An asset whose quote is missing contributes null, not zero — the total then
 * says so via `pricedFully`, because a total that quietly omits a holding is
 * worse than one that admits it is incomplete.
 */
export async function spotWallet(userId: string) {
  const catalog = await spotAssets();
  const byAsset = new Map(catalog.map((a) => [a.asset, a]));
  const rows = (await q.balances.all(userId)) as { asset: string; qty_scaled: bigint }[];

  const held = new Map<string, bigint>();
  for (const r of rows) held.set(r.asset, asBig(r.qty_scaled));
  // USD always shows, even at zero: it is the wallet's cash line, and hiding
  // it when empty would make an empty wallet look like a broken one.
  if (!held.has(SPOT_QUOTE)) held.set(SPOT_QUOTE, 0n);

  const holdings: SpotHolding[] = [];
  let total = 0n;
  let pricedFully = true;

  for (const [asset, qty] of held) {
    if (qty === 0n && asset !== SPOT_QUOTE) continue;
    const info = byAsset.get(asset) ?? {
      // A balance in an asset whose instrument was since retired still belongs
      // to the trader and still shows — just without a price to value it at.
      asset, name: asset, symbol: null, category: "RETIRED", priceDecimals: 8,
    };
    const price = info.category === "RETIRED" ? null : await assetPriceUsd(info);
    const value = price === null ? null : usdValueOf(qty, price);
    if (value === null) pricedFully = false;
    else total += value;
    holdings.push({
      asset,
      name: info.name,
      symbol: info.symbol,
      qty: out(qty, 8),
      price: price === null ? null : out(price, info.priceDecimals),
      value: value === null ? null : out(value, 2),
      priceDecimals: info.priceDecimals,
      priced: price !== null,
    });
  }

  // Largest holding first, with USD pinned to the top as the cash line.
  holdings.sort((a, b) => {
    if (a.asset === SPOT_QUOTE) return -1;
    if (b.asset === SPOT_QUOTE) return 1;
    return Number(b.value ?? "0") - Number(a.value ?? "0");
  });

  return {
    quoteAsset: SPOT_QUOTE,
    holdings,
    /** Free USD — the spot wallet has no encumbrance, so this is exactly what
     * a withdrawal can take. Deliberately not the futures wallet's free
     * margin, which is collateral and cannot leave the platform. */
    availableUsd: out(held.get(SPOT_QUOTE) ?? 0n, 2),
    totalValueUsd: out(total, 2),
    pricedFully,
  };
}

/** Raw total for callers that need to add it to something else (the account
 * summary's Total Balance) rather than render it. */
export async function spotTotalValue(userId: string): Promise<{ total: bigint; usd: bigint }> {
  const catalog = await spotAssets();
  const byAsset = new Map(catalog.map((a) => [a.asset, a]));
  const rows = (await q.balances.all(userId)) as { asset: string; qty_scaled: bigint }[];
  let total = 0n;
  let usd = 0n;
  for (const r of rows) {
    const qty = asBig(r.qty_scaled);
    if (qty === 0n) continue;
    if (r.asset === SPOT_QUOTE) { usd += qty; total += qty; continue; }
    const info = byAsset.get(r.asset);
    if (!info) continue;
    const price = await assetPriceUsd(info);
    if (price !== null) total += usdValueOf(qty, price);
  }
  return { total, usd };
}

export interface ExchangeResult {
  fromAsset: string;
  toAsset: string;
  fromQty: string | null;
  toQty: string | null;
  /** Gross USD value of the leg sold, before fee. */
  grossUsd: string | null;
  feeUsd: string | null;
  /** How much of `toAsset` one unit of `fromAsset` bought, after the fee. */
  rate: string | null;
}

/**
 * Exchanges one spot asset for another at the current mark, with USD as the
 * pivot. Buying BTC with dollars, selling it back, and swapping BTC for ETH
 * are all this one operation — the alternative was three near-identical copies
 * of the same arithmetic, which is how two of them end up subtly disagreeing.
 *
 * The fee is taken out of the proceeds rather than charged as a separate debit:
 * that way the trader receives 0.04% less of what they bought, which works
 * whichever pair of assets is involved. A separate USD fee row would fail on a
 * BTC→ETH swap by an account holding no dollars — a fee the platform cannot
 * always collect is not a fee, it is an intermittent bug.
 */
export async function spotExchange(args: {
  userId: string;
  fromAsset: string;
  toAsset: string;
  fromQtyScaled: bigint;
  refType?: string;
  refId?: string;
  note?: string;
  type?: { out: SpotLedgerType; in: SpotLedgerType };
}): Promise<ExchangeResult> {
  const fromAsset = args.fromAsset.toUpperCase();
  const toAsset = args.toAsset.toUpperCase();
  if (fromAsset === toAsset) throw badRequest("SAME_ASSET", "Активы обмена должны отличаться");
  if (args.fromQtyScaled <= 0n) throw badRequest("ZERO_AMOUNT", "Сумма должна быть больше нуля");

  const from = await assetInfo(fromAsset);
  const to = await assetInfo(toAsset);
  const fromPrice = await assetTradeablePriceUsd(from);
  const toPrice = await assetTradeablePriceUsd(to);

  const { grossUsd, feeUsd, netUsd, toQty, rate } = computeExchange({
    fromQty: args.fromQtyScaled, fromPrice, toPrice,
  });
  if (grossUsd <= 0n) throw badRequest("AMOUNT_TOO_SMALL", "Сумма слишком мала для обмена");
  if (toQty <= 0n) {
    throw badRequest("AMOUNT_TOO_SMALL", "После комиссии к получению вышло бы ноль — увеличьте сумму");
  }

  const types = args.type ?? { out: "CONVERT_OUT" as const, in: "CONVERT_IN" as const };
  const note = args.note ?? `Обмен ${fromAsset} → ${toAsset}`;

  await postSpot({
    userId: args.userId, asset: fromAsset, type: types.out,
    qtyScaled: -args.fromQtyScaled,
    usdValueScaled: fromAsset === SPOT_QUOTE ? undefined : grossUsd,
    refType: args.refType, refId: args.refId, note,
  });
  await postSpot({
    userId: args.userId, asset: toAsset, type: types.in,
    qtyScaled: toQty,
    usdValueScaled: toAsset === SPOT_QUOTE ? undefined : netUsd,
    refType: args.refType, refId: args.refId,
    note: `${note} · комиссия ${out(feeUsd, 4)} USD`,
  });

  return {
    fromAsset, toAsset,
    fromQty: out(args.fromQtyScaled, 8),
    toQty: out(toQty, 8),
    grossUsd: out(grossUsd, 2),
    feeUsd: out(feeUsd, 4),
    rate: out(rate, 8),
  };
}

export async function spotJournal(userId: string, limit = 50) {
  return (await q.journal.all(userId, limit)) as any[];
}

export const sSpotLedger = (row: any) => ({
  id: row.id,
  asset: row.asset,
  type: row.type,
  qty: out(asBig(row.qty_scaled), 8),
  balanceAfter: out(asBig(row.balance_after_scaled), 8),
  usdValue: row.usd_value_scaled === null || row.usd_value_scaled === undefined
    ? null
    : out(asBig(row.usd_value_scaled), 2),
  refType: row.ref_type,
  refId: row.ref_id,
  note: row.note,
  createdAt: row.created_at,
});
