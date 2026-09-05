import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { newId, tx } from "../db.js";
import { out, toScaled } from "../lib/money.js";
import { postLedger, audit } from "../lib/ledger.js";
import { badRequest } from "../lib/errors.js";
import { computeExchange } from "../lib/spotMath.js";
import {
  assetInfo, assetPriceUsd, assetTradeablePriceUsd, postSpot, sSpotLedger, spotAssets,
  spotBalance, spotExchange, spotJournal, spotWallet, SPOT_QUOTE,
} from "../lib/spot.js";

/**
 * The spot wallet's API. Every route here does one thing to the wallet and
 * does it inside a transaction through lib/spot.ts's postSpot/spotExchange —
 * nothing in this file touches spot_balances directly, for the same reason
 * nothing outside lib/ledger.ts touches accounts.
 *
 * Deposits and withdrawals are not here: they live in routes/trading.ts with
 * the rest of the wallet actions. They move spot USD rather than futures
 * cash — money arrives in the spot wallet and leaves from it, and getting it
 * to the futures wallet is /transfer below.
 */

const decimal = z.string().regex(/^\d+(\.\d{1,8})?$/, "Ожидается положительное десятичное число");
const assetCode = z.string().min(2).max(12).regex(/^[A-Za-z0-9]+$/);

export default async function spotRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  /** The catalog: which assets exist and what they're worth right now. */
  app.get("/assets", async () => {
    const catalog = await spotAssets();
    const assets = [];
    for (const info of catalog) {
      const price = await assetPriceUsd(info);
      assets.push({
        asset: info.asset,
        name: info.name,
        symbol: info.symbol,
        category: info.category,
        priceDecimals: info.priceDecimals,
        price: price === null ? null : out(price, info.priceDecimals),
      });
    }
    return { quoteAsset: SPOT_QUOTE, assets };
  });

  app.get("/wallet", async (req) => spotWallet(req.user.sub));

  app.get("/ledger", async (req) => ({
    entries: (await spotJournal(req.user.sub, 100)).map(sSpotLedger),
  }));

  /**
   * Buy or sell an asset for USD, without leverage — the trader ends up
   * holding the thing itself, which is what separates this from opening a
   * perp position that only tracks its price.
   *
   * `amount` is read in whatever is being given up: buying, it's the dollars
   * to spend; selling, it's the quantity to sell. That's the number a person
   * actually has in mind in each direction, and it means neither side can ask
   * for more than the wallet holds.
   */
  app.post("/trade", async (req, reply) => {
    const body = z.object({
      asset: assetCode,
      side: z.enum(["BUY", "SELL"]),
      amount: decimal,
    }).parse(req.body);

    const asset = body.asset.toUpperCase();
    if (asset === SPOT_QUOTE) throw badRequest("SAME_ASSET", "USD — валюта расчёта, её нельзя купить за USD");
    const info = await assetInfo(asset);
    if (!info.symbol) throw badRequest("NOT_TRADEABLE", `${asset} нельзя купить или продать`);

    const amount = toScaled(body.amount);
    const id = newId();
    const trade = await tx(async () => {
      const r = body.side === "BUY"
        ? await spotExchange({
            userId: req.user.sub, fromAsset: SPOT_QUOTE, toAsset: asset, fromQtyScaled: amount,
            refType: "SPOT_TRADE", refId: id, note: `Покупка ${asset} за USD`,
            type: { out: "BUY", in: "BUY" },
          })
        : await spotExchange({
            userId: req.user.sub, fromAsset: asset, toAsset: SPOT_QUOTE, fromQtyScaled: amount,
            refType: "SPOT_TRADE", refId: id, note: `Продажа ${asset} за USD`,
            type: { out: "SELL", in: "SELL" },
          });
      await audit({
        actorId: req.user.sub, targetUserId: req.user.sub, action: "SPOT_TRADE",
        meta: { id, asset, side: body.side, amount: body.amount, feeUsd: r.feeUsd }, ip: req.ip,
      });
      return r;
    });

    return reply.code(201).send({ trade, wallet: await spotWallet(req.user.sub) });
  });

  /** Swap one held asset for another directly — BTC→ETH without a round trip
   * through a sell screen and then a buy screen (and two fees). */
  app.post("/convert", async (req, reply) => {
    const body = z.object({
      fromAsset: assetCode,
      toAsset: assetCode,
      amount: decimal,
    }).parse(req.body);

    const id = newId();
    const conversion = await tx(async () => {
      const r = await spotExchange({
        userId: req.user.sub,
        fromAsset: body.fromAsset, toAsset: body.toAsset,
        fromQtyScaled: toScaled(body.amount),
        refType: "SPOT_CONVERT", refId: id,
      });
      await audit({
        actorId: req.user.sub, targetUserId: req.user.sub, action: "SPOT_CONVERT",
        meta: { id, ...body, feeUsd: r.feeUsd }, ip: req.ip,
      });
      return r;
    });

    return reply.code(201).send({ conversion, wallet: await spotWallet(req.user.sub) });
  });

  /**
   * Moves USD between the two wallets. This is the only door between them, and
   * it is deliberately explicit: spot money cannot back a leveraged position,
   * and futures collateral cannot be withdrawn, until it has been walked
   * through here. Both legs run in one transaction, so the money is never in
   * neither wallet.
   */
  app.post("/transfer", async (req) => {
    const body = z.object({
      direction: z.enum(["TO_FUTURES", "TO_SPOT"]),
      amount: decimal,
    }).parse(req.body);

    const amount = toScaled(body.amount);
    if (amount <= 0n) throw badRequest("ZERO_AMOUNT", "Сумма должна быть больше нуля");
    const id = newId();

    await tx(async () => {
      if (body.direction === "TO_FUTURES") {
        // Debit spot first: postSpot refuses to overdraw, so futures is only
        // ever credited with money that was actually there to move.
        await postSpot({
          userId: req.user.sub, asset: SPOT_QUOTE, type: "TRANSFER_TO_FUTURES",
          qtyScaled: -amount, refType: "SPOT_TRANSFER", refId: id,
          note: "Перевод в фьючерсный кошелёк",
        });
        await postLedger({
          userId: req.user.sub, type: "SPOT_TRANSFER_IN", amountScaled: amount,
          refType: "SPOT_TRANSFER", refId: id, note: "Перевод из спот-кошелька",
        });
      } else {
        // And the mirror image: postLedger refuses to overdraw the futures
        // cash, so a transfer out can't dip into money that is holding margin.
        await postLedger({
          userId: req.user.sub, type: "SPOT_TRANSFER_OUT", amountScaled: -amount,
          refType: "SPOT_TRANSFER", refId: id, note: "Перевод в спот-кошелёк",
        });
        await postSpot({
          userId: req.user.sub, asset: SPOT_QUOTE, type: "TRANSFER_FROM_FUTURES",
          qtyScaled: amount, refType: "SPOT_TRANSFER", refId: id,
          note: "Перевод из фьючерсного кошелька",
        });
      }
      await audit({
        actorId: req.user.sub, targetUserId: req.user.sub, action: "SPOT_TRANSFER",
        meta: { id, direction: body.direction, amount: body.amount }, ip: req.ip,
      });
    });

    return { wallet: await spotWallet(req.user.sub) };
  });

  /**
   * What a prospective exchange would return, so the form can show it before
   * anything is committed. Runs the same arithmetic spotExchange does, off the
   * same prices — a preview that rounds differently from the fill is a support
   * ticket waiting to happen.
   */
  app.get("/quote", async (req) => {
    const query = z.object({
      fromAsset: assetCode, toAsset: assetCode, amount: decimal,
    }).parse(req.query);

    const from = await assetInfo(query.fromAsset);
    const to = await assetInfo(query.toAsset);
    if (from.asset === to.asset) throw badRequest("SAME_ASSET", "Активы обмена должны отличаться");

    const fromPrice = await assetTradeablePriceUsd(from);
    const toPrice = await assetTradeablePriceUsd(to);
    const math = computeExchange({ fromQty: toScaled(query.amount), fromPrice, toPrice });

    return {
      fromAsset: from.asset, toAsset: to.asset,
      available: out(await spotBalance(req.user.sub, from.asset), 8),
      grossUsd: out(math.grossUsd, 2),
      feeUsd: out(math.feeUsd, 4),
      receive: out(math.toQty, 8),
      rate: out(math.rate, 8),
      fromPrice: out(fromPrice, from.priceDecimals),
      toPrice: out(toPrice, to.priceDecimals),
    };
  });
}
