import { FormEvent, useState } from "react";
import { useDeposit, useTransfer, useWithdraw } from "../../hooks/useProfile";
import { useAccount } from "../../hooks/useTrading";
import { useAuthStore } from "../../store/auth";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { fmtUsd, classNames } from "../../lib/format";
import { demoWalletAddress } from "../../lib/demoWallet";
import { useModalExit } from "../../hooks/useModalExit";
import { IconCard, IconCopy, IconCrypto, IconSwap, IconUsers, IconWalletMinus, IconWalletPlus } from "../icons/Icon";

export type WalletMethod = "deposit" | "withdraw" | "transfer";
type PayMethod = "p2p" | "card" | "crypto";

// Flat semantic fills, not gradients (see WalletActions.tsx's tiles for the
// same rule) — deposit/withdraw reuse the exact -fill tokens the terminal's
// own Buy/Sell buttons are built on; transfer isn't a buy/sell action, so it
// takes the neutral accent-fill rather than inventing a new hue for it.
const METHOD_META: Record<WalletMethod, { title: string; Icon: typeof IconWalletPlus; cta: string; accentClass: string }> = {
  deposit: { title: "Deposit", Icon: IconWalletPlus, cta: "bg-buy-fill text-black", accentClass: "border-buy/40" },
  withdraw: { title: "Withdraw", Icon: IconWalletMinus, cta: "bg-sell-fill text-white", accentClass: "border-warn/40" },
  transfer: { title: "Transfer", Icon: IconSwap, cta: "bg-accent-fill text-white", accentClass: "border-accent/40" },
};

const PAY_METHODS: { id: PayMethod; label: string; sub: string; Icon: typeof IconUsers }[] = [
  { id: "p2p", label: "P2P", sub: "Через объявление продавца", Icon: IconUsers },
  { id: "card", label: "Online Payment", sub: "Банковская карта", Icon: IconCard },
  { id: "crypto", label: "Crypto Wallet", sub: "Демо-адрес Velora", Icon: IconCrypto },
];

const P2P_OFFERS = [
  { name: "Alex_Trade", rate: "1 USD = 1.00 vUSD", limit: "50 – 5,000" },
  { name: "CryptoMerchant", rate: "1 USD = 1.00 vUSD", limit: "100 – 10,000" },
  { name: "FastPay24", rate: "1 USD = 1.00 vUSD", limit: "20 – 2,000" },
];

const PRESETS = ["100", "500", "1000", "5000"];

export function WalletFlowModal({ method, onClose }: { method: WalletMethod; onClose: () => void }) {
  const { closing, requestClose } = useModalExit(onClose);
  const user = useAuthStore((s) => s.user);
  const { data: account } = useAccount(!!user);
  const deposit = useDeposit();
  const withdraw = useWithdraw();
  const transfer = useTransfer();
  const [amount, setAmount] = useState(method === "deposit" ? "500" : "");
  const [toTarget, setToTarget] = useState("");
  const [transferBy, setTransferBy] = useState<"email" | "accountId">("accountId");
  const [phase, setPhase] = useState<"method" | "amount">(method === "transfer" ? "amount" : "method");
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [offer, setOffer] = useState(0);
  const [copied, setCopied] = useState(false);
  const meta = METHOD_META[method];
  const pending = deposit.isPending || withdraw.isPending || transfer.isPending;
  const address = user ? demoWalletAddress(user.id) : "";

  function chooseMethod(m: PayMethod) {
    setPayMethod(m);
    setPhase("amount");
  }

  function copyAddress() {
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amount.trim() || Number(amount) <= 0) return toast.warning("Укажите сумму");
    try {
      if (method === "deposit") {
        const res = await deposit.mutateAsync({ amount: amount.trim() });
        toast.success("Депозит зачислен", `Баланс: ${fmtUsd(res.balance)}`);
      } else if (method === "withdraw") {
        const res = await withdraw.mutateAsync({ amount: amount.trim() });
        toast.success("Вывод выполнен", `Баланс: ${fmtUsd(res.balance)}`);
      } else {
        if (!toTarget.trim()) return toast.warning(transferBy === "email" ? "Укажите email получателя" : "Укажите номер счёта получателя");
        const res = await transfer.mutateAsync(
          transferBy === "email"
            ? { toEmail: toTarget.trim(), amount: amount.trim() }
            : { toAccountId: toTarget.trim(), amount: amount.trim() }
        );
        toast.success("Перевод выполнен", `Баланс: ${fmtUsd(res.balance)}`);
      }
      requestClose();
    } catch (e) {
      toast.error("Операция отклонена", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={requestClose}>
      <div
        className={`${closing ? "anim-rise-out" : "anim-rise"} w-full max-w-sm rounded-xl border ${meta.accentClass} bg-bg-1 p-5 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-txt-0">
          <meta.Icon size={18} /> {meta.title}
        </div>
        {/* Spot USD, not futures cash: deposits land in the spot wallet and
            withdrawals leave from it, so this is the figure that actually
            bounds what the form can do. */}
        {account && (
          <div className="mb-4 text-2xs text-txt-3">
            {method === "deposit" ? "В спот-кошельке" : "Доступно к выводу"}:{" "}
            <span className="tabular text-txt-1">{fmtUsd(account.availableToWithdraw)}</span>
          </div>
        )}

        {phase === "method" && (
          <div className="flex flex-col gap-2">
            {PAY_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => chooseMethod(m.id)}
                className="btn-fx flex items-center gap-3 rounded-xl border border-line bg-bg-2 p-3 text-left shadow-panel transition-colors hover:border-accent/50 hover:bg-bg-3"
              >
                {/* Accent is spent on the icon alone — a small semantic touch
                    rather than lighting up the whole tile. */}
                <m.Icon size={20} className="shrink-0 text-accent" />
                <div>
                  <div className="text-xs font-bold text-txt-0">{m.label}</div>
                  <div className="text-2xs text-txt-3">{m.sub}</div>
                </div>
              </button>
            ))}
            <button type="button" onClick={requestClose} className="btn-fx mt-1 rounded-lg border border-line py-2 text-xs text-txt-2 hover:text-txt-0">
              Cancel
            </button>
          </div>
        )}

        {phase === "amount" && (
          <form onSubmit={onSubmit}>
            {method !== "transfer" && payMethod && (
              <button type="button" onClick={() => setPhase("method")} className="btn-fx mb-3 text-2xs text-txt-3 hover:text-txt-1">
                ← сменить способ
              </button>
            )}

            {method !== "transfer" && payMethod === "p2p" && (
              <div className="mb-3 space-y-1.5">
                <div className="text-2xs font-medium text-txt-2">Выберите продавца</div>
                {P2P_OFFERS.map((o, idx) => (
                  <button
                    key={o.name}
                    type="button"
                    onClick={() => setOffer(idx)}
                    className={classNames(
                      "flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-2xs",
                      offer === idx ? "border-accent bg-accent-soft" : "border-line"
                    )}
                  >
                    <span className="font-medium text-txt-0">{o.name}</span>
                    <span className="text-right text-txt-2">
                      <div>{o.rate}</div>
                      <div className="text-txt-3">Лимит: {o.limit}</div>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {method !== "transfer" && payMethod === "card" && (
              <div className="mb-3 rounded-xl border border-line bg-bg-3 p-3.5 text-txt-0 shadow-panel">
                <div className="mb-4 flex items-center justify-between text-2xs text-txt-3">
                  <span>Card</span>
                  <IconCard size={16} />
                </div>
                <div className="mb-3 font-mono text-sm tracking-widest">•••• •••• •••• 4242</div>
                <div className="flex justify-between text-2xs text-txt-3">
                  <span>VELORA</span>
                  <span>12/29</span>
                </div>
              </div>
            )}

            {method !== "transfer" && payMethod === "crypto" && (
              <div className="mb-3 rounded-lg border border-line-soft bg-bg-2/40 p-2.5">
                <div className="mb-1 text-2xs font-medium text-txt-2">{method === "deposit" ? "Ваш адрес для пополнения" : "Адрес для вывода"}</div>
                {method === "deposit" ? (
                  <div className="flex items-center gap-1.5">
                    <code className="min-w-0 flex-1 truncate rounded border border-line bg-bg-3 px-2 py-1.5 text-2xs text-txt-1">{address}</code>
                    <button type="button" onClick={copyAddress} className="btn-fx shrink-0 rounded border border-line p-1.5 text-txt-2 hover:text-accent">
                      <IconCopy size={13} />
                    </button>
                  </div>
                ) : (
                  <input
                    value={toTarget}
                    onChange={(e) => setToTarget(e.target.value)}
                    placeholder="Адрес кошелька"
                    className="w-full rounded border border-line bg-bg-2 px-2.5 py-1.5 text-2xs tabular outline-none focus:border-warn"
                  />
                )}
                {copied && <div className="mt-1 text-2xs text-buy">Скопировано</div>}
                <div className="mt-1.5 text-2xs text-txt-3">
                  Адрес для иллюстрации — не привязан к реальной блокчейн-сети. {method === "deposit" ? "Зачисление ниже симулирует получение перевода." : "Средства списываются с баланса без реальной отправки."}
                </div>
              </div>
            )}

            {method === "transfer" && (
              <>
                <div className="mb-2 flex gap-1 rounded border border-line p-0.5">
                  {(["accountId", "email"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTransferBy(t)}
                      className={classNames("flex-1 rounded px-2 py-1 text-2xs font-medium", transferBy === t ? "bg-accent-soft text-accent" : "text-txt-2")}
                    >
                      {t === "accountId" ? "По номеру счёта" : "По email"}
                    </button>
                  ))}
                </div>
                <input
                  value={toTarget}
                  onChange={(e) => setToTarget(e.target.value)}
                  placeholder={transferBy === "accountId" ? "8-значный номер счёта" : "Email получателя"}
                  type={transferBy === "email" ? "email" : "text"}
                  inputMode={transferBy === "accountId" ? "numeric" : undefined}
                  autoFocus
                  className="mb-3 w-full rounded border border-line bg-bg-2 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </>
            )}

            {method === "deposit" && (
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(p)}
                    className={`btn-fx rounded border px-2 py-1.5 text-xs font-medium ${amount === p ? "border-buy bg-buy-soft text-buy" : "border-line text-txt-2"}`}
                  >
                    ${p}
                  </button>
                ))}
              </div>
            )}

            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Сумма, $"
              autoFocus={method !== "transfer" && payMethod !== "crypto"}
              className="mb-4 w-full rounded border border-line bg-bg-2 px-3 py-2 text-sm tabular outline-none focus:border-accent"
            />

            <div className="flex gap-2">
              <button type="button" onClick={requestClose} className="btn-fx flex-1 rounded-lg border border-line py-2 text-xs text-txt-2 hover:text-txt-0">
                Cancel
              </button>
              <button type="submit" disabled={pending} className={`cta-pill flex-1 py-2 text-xs disabled:opacity-50 ${meta.cta}`}>
                {pending ? "…" : meta.title}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
