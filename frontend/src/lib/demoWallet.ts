/**
 * A cosmetic, per-user "crypto wallet" address for the demo deposit/withdraw
 * flow. There is no real blockchain behind Velora's virtual balance, so this
 * is deliberately NOT a real address on any network — it's a stable-looking
 * placeholder derived from the user's id, purely so the Wallet tab has
 * something consistent to display across sessions. Deposits/withdrawals
 * still move the same demo ledger balance as every other method.
 */
export function demoWalletAddress(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  const hex = (hash.toString(16) + userId.replace(/[^a-f0-9]/gi, "").toLowerCase()).padEnd(34, "0").slice(0, 34);
  return `vlr1${hex}`;
}
