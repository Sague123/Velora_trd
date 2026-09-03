import { create } from "zustand";
import type { OrderSide, OrderType } from "../lib/types";

/** BASE: amount = qty of the base asset. QUOTE: amount = total position
 * notional (qty*price), the way spot order forms size a "Total" input.
 * MARGIN: amount = the trader's own capital committed — qty =
 * (amount * leverage) / price — matching how Binance/Bybit futures order
 * forms size their "Cost"/"Margin" input. */
export type AmountMode = "BASE" | "QUOTE" | "MARGIN";

/**
 * The order being composed, lifted out of the form that renders it.
 *
 * On the phone the ticket's fields and its Buy/Sell buttons are no longer the
 * same component: the fields scroll with the page while the buttons stay
 * pinned in the bottom bar, which is also where a price tapped in the order
 * book has to land. Keeping the ticket in one store is what lets those three
 * places act on the same order without threading callbacks through the whole
 * screen. Desktop reads the same store from a single component, so nothing
 * about its behaviour changes.
 *
 * Validation, estimates and submission are NOT here — see
 * hooks/useOrderTicket.ts. This holds only what the trader has typed.
 */
interface OrderTicketState {
  /** Chosen direction. Null until a Buy/Sell button is pressed — that press
   * is what picks the side, so there is no separate side selector. */
  side: OrderSide | null;
  type: OrderType;
  amountMode: AmountMode;
  amount: string;
  /** Limit/stop price. Ignored for MARKET. */
  price: string;
  leverage: number;
  useTpSl: boolean;
  tp: string;
  sl: string;
  /** Position size as a percentage of available cash, for the size slider.
   * Kept alongside `amount` rather than derived from it: the slider sets the
   * amount, but typing an amount by hand shouldn't make the slider jump. */
  sizePct: number;
  /** Which side is one press away from being submitted, if any. Shared so
   * the pinned bar can show "Ещё раз" on the button that was pressed. */
  armed: OrderSide | null;

  setSide: (v: OrderSide | null) => void;
  setType: (v: OrderType) => void;
  setAmountMode: (v: AmountMode) => void;
  setAmount: (v: string) => void;
  setPrice: (v: string) => void;
  setLeverage: (v: number) => void;
  setUseTpSl: (v: boolean) => void;
  setTp: (v: string) => void;
  setSl: (v: string) => void;
  setSizePct: (v: number) => void;
  setArmed: (v: OrderSide | null) => void;
  /** Clears what a filled order should not leave behind (amount, TP/SL, and
   * a limit price), keeping leverage/mode/type as the trader set them. */
  clearAfterSubmit: () => void;
}

export const useOrderTicketStore = create<OrderTicketState>((set) => ({
  side: null,
  type: "MARKET",
  amountMode: "BASE",
  amount: "",
  price: "",
  leverage: 1,
  useTpSl: false,
  tp: "",
  sl: "",
  sizePct: 0,
  armed: null,

  setSide: (side) => set({ side }),
  setType: (type) => set({ type }),
  setAmountMode: (amountMode) => set({ amountMode }),
  setAmount: (amount) => set({ amount }),
  setPrice: (price) => set({ price }),
  setLeverage: (leverage) => set({ leverage }),
  setUseTpSl: (useTpSl) => set({ useTpSl }),
  setTp: (tp) => set({ tp }),
  setSl: (sl) => set({ sl }),
  setSizePct: (sizePct) => set({ sizePct }),
  setArmed: (armed) => set({ armed }),
  clearAfterSubmit: () => set((s) => ({ amount: "", tp: "", sl: "", sizePct: 0, armed: null, price: s.type === "MARKET" ? s.price : "" })),
}));
