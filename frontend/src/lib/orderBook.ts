import type { DepthLevel, DepthSnapshot } from "./binance";

/**
 * A local order book kept in sync with Binance's diff-depth stream.
 *
 * The panel used to read `@depth20@100ms` — the *partial* book stream, which
 * pushes a complete top-20 snapshot ten times a second. That is consistent
 * data (each frame is a valid book), but it is only ever twenty levels, and
 * twenty levels of BTCUSDT is a few dollars of price range: everything
 * outside it simply did not exist as far as the UI was concerned.
 *
 * Going deeper means the diff stream instead, which sends only what changed
 * and therefore requires keeping the book here. Binance documents the exact
 * sequencing this needs, and the whole point of it is that a dropped or
 * out-of-order event must be *detected* rather than silently applied — a book
 * that has quietly missed an update shows prices that were never there, which
 * is worse than showing none. On any gap this resyncs from a fresh snapshot.
 *
 * Spot and futures differ in how they let you check continuity, so both rules
 * live here:
 *   spot     each event carries [U, u]; the next event must start exactly
 *            where the last ended (U === lastU + 1).
 *   futures  each event also carries `pu`, the previous event's u, which is
 *            the continuity check itself (pu === lastU).
 */

export type DepthMarket = "spot" | "futures";

export interface DepthDiffEvent {
  /** first update id in the event */
  U: number;
  /** final update id in the event */
  u: number;
  /** futures only: final update id of the *previous* event */
  pu?: number;
  b?: [string, string][];
  a?: [string, string][];
}

/** Price -> quantity. A diff with quantity 0 deletes the level. */
type Side = Map<number, number>;

function applyLevels(side: Side, rows: [string, string][] | undefined): void {
  if (!rows) return;
  for (const [priceRaw, qtyRaw] of rows) {
    const price = Number(priceRaw);
    const qty = Number(qtyRaw);
    if (!Number.isFinite(price)) continue;
    if (!Number.isFinite(qty) || qty <= 0) side.delete(price);
    else side.set(price, qty);
  }
}

function toSorted(side: Side, dir: "desc" | "asc"): DepthLevel[] {
  const out: DepthLevel[] = [];
  for (const [price, qty] of side) out.push({ price, qty });
  out.sort((a, b) => (dir === "desc" ? b.price - a.price : a.price - b.price));
  return out;
}

export class LocalOrderBook {
  private bids: Side = new Map();
  private asks: Side = new Map();
  private lastUpdateId = 0;
  private buffer: DepthDiffEvent[] = [];
  private synced = false;

  constructor(private readonly market: DepthMarket) {}

  get isSynced(): boolean {
    return this.synced;
  }

  /** Levels held right now, per side — what "all orders" actually means here,
   * as opposed to the twenty the old stream allowed. */
  get depth(): { bids: number; asks: number } {
    return { bids: this.bids.size, asks: this.asks.size };
  }

  /** Events that arrive before the REST snapshot are kept, not dropped: the
   * snapshot is a moment in the past by the time it arrives, and these are
   * what carry the book forward to now. */
  buffer_(event: DepthDiffEvent): void {
    this.buffer.push(event);
    // A snapshot that never arrives must not grow this without bound.
    if (this.buffer.length > 2000) this.buffer.splice(0, this.buffer.length - 2000);
  }

  /**
   * Seeds from a REST snapshot and replays whatever arrived while it was in
   * flight. Returns false when the buffered events don't line up with the
   * snapshot — the caller then fetches a newer one rather than starting from a
   * book with a hole in it.
   */
  seed(snapshot: DepthSnapshot & { lastUpdateId: number }): boolean {
    this.bids = new Map(snapshot.bids.map((l) => [l.price, l.qty]));
    this.asks = new Map(snapshot.asks.map((l) => [l.price, l.qty]));
    this.lastUpdateId = snapshot.lastUpdateId;

    // Anything already contained in the snapshot is not news.
    const pending = this.buffer.filter((e) => e.u > this.lastUpdateId);
    this.buffer = [];

    if (pending.length > 0) {
      const first = pending[0];
      const startsCleanly =
        this.market === "spot"
          ? first.U <= this.lastUpdateId + 1 && first.u >= this.lastUpdateId + 1
          : first.U <= this.lastUpdateId && first.u >= this.lastUpdateId;
      if (!startsCleanly) {
        this.synced = false;
        return false;
      }
      for (const e of pending) {
        applyLevels(this.bids, e.b);
        applyLevels(this.asks, e.a);
        this.lastUpdateId = e.u;
      }
    }

    this.synced = true;
    return true;
  }

  /**
   * Applies one live event. Returns false on a sequence gap, which means the
   * book can no longer be trusted and the caller must resync — reporting that
   * is the entire reason this is not just a map assignment.
   */
  apply(event: DepthDiffEvent): boolean {
    if (!this.synced) {
      this.buffer_(event);
      return true;
    }
    if (event.u <= this.lastUpdateId) return true; // already covered

    const continuous =
      this.market === "spot"
        ? event.U <= this.lastUpdateId + 1
        : event.pu === undefined || event.pu === this.lastUpdateId;

    if (!continuous) {
      this.synced = false;
      this.buffer = [event];
      return false;
    }

    applyLevels(this.bids, event.b);
    applyLevels(this.asks, event.a);
    this.lastUpdateId = event.u;
    return true;
  }

  /** Best bids first, best asks first — the order the panel renders outward
   * from the spread. `limit` caps how much is handed over; the book itself
   * keeps everything it has been told about. */
  snapshot(limit: number): DepthSnapshot {
    return {
      bids: toSorted(this.bids, "desc").slice(0, limit),
      asks: toSorted(this.asks, "asc").slice(0, limit),
    };
  }

  reset(): void {
    this.bids = new Map();
    this.asks = new Map();
    this.lastUpdateId = 0;
    this.buffer = [];
    this.synced = false;
  }
}
