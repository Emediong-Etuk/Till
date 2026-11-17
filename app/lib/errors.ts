// Turns reverts into plain language, with a suggested fix where one exists.
import { BaseError, ContractFunctionRevertedError, type Abi, decodeErrorResult, type Hex, InsufficientFundsError, UserRejectedRequestError } from "viem";
import { naiveAbi, shopAbi } from "./contracts";
import { eth } from "./format";

export type Friendly = { title: string; detail?: string; fix?: "refresh" | "faucet" | "retry" | "switch-chain"; code?: string };

const combined = [...shopAbi, ...naiveAbi.filter((x) => x.type === "error")] as Abi;

function fromName(name: string, args: readonly unknown[]): Friendly {
  const a = args as bigint[];
  switch (name) {
    case "Overspend":
      return { title: `This cart needs ${eth(a[0]!)} ETH more than was sent`, detail: `An item asked for ${eth(a[0]!)} ETH but only ${eth(a[1]!)} ETH was left of your payment. Prices may have changed.`, fix: "refresh", code: name };
    case "Unspent":
      return { title: "You would have overpaid", detail: `${eth(a[0]!)} ETH would have had nowhere to go, so nothing was charged.`, fix: "refresh", code: name };
    case "NestedBatch":
      return { title: "Batches cannot be nested", code: name };
    case "ExternalCallInBatch":
      return { title: "Payouts can't run inside a batch", detail: "Send withdrawals, refunds and safe transfers on their own.", code: name };
    case "ForeignFrame":
      return { title: "Another contract tried to spend this batch", code: name };
    case "SoldOut":
      return { title: "Sold out", detail: `Only ${a[1]} left.`, fix: "refresh", code: name };
    case "WalletCapExceeded":
      return { title: "That's more than one wallet may hold", detail: `The limit is ${a[1]} per wallet; this wallet already has ${a[2]}.`, code: name };
    case "ItemNotActive":
      return { title: "That item isn't on sale right now", fix: "refresh", code: name };
    case "UnknownItem":
      return { title: "That item doesn't exist", fix: "refresh", code: name };
    case "ZeroQuantity":
      return { title: "Pick at least one", code: name };
    case "ZeroAmount":
      return { title: "A tip must be more than zero", code: name };
    case "NotOwner":
      return { title: "Only the seller can do that", code: name };
    case "NotPendingOwner":
      return { title: "Only the invited new owner can accept", code: name };
    case "BadSignature":
      return { title: "This pass code wasn't signed by its holder", detail: "Ask the holder to refresh their pass.", code: name };
    case "SignatureExpired":
      return { title: "This pass code has expired", detail: "Ask the holder to refresh their pass.", code: name };
    case "AlreadyRedeemed":
      return { title: "Already used", detail: "This pass was checked in before.", code: name };
    case "UnknownPass":
      return { title: "No such pass", code: name };
    case "NotRefundable":
      return { title: "Not refundable", detail: "Refunds open only when the seller cancels an item, and only for unused passes.", code: name };
    case "NotAuthorized":
      return { title: "You don't hold this pass", code: name };
    case "TooEarly":
      return { title: "Too early to release", detail: "Escrow releases after the item's release time.", code: name };
    case "NothingToWithdraw":
      return { title: "Nothing to withdraw yet", code: name };
    case "PayoutFailed":
      return { title: "The receiving address refused the payment", code: name };
    case "SupplyBelowSold":
      return { title: "Supply can't go below what's sold", code: name };
    case "CannotShortenRelease":
      return { title: "The release time can only move later", code: name };
    case "InvalidRecipient":
      return { title: "That address can't receive passes", code: name };
    case "UnsafeRecipient":
      return { title: "That contract can't receive passes", code: name };
    case "FailedCall":
      return { title: "One step of the batch failed", fix: "refresh", code: name };
    case "Error":
      return { title: String(args[0] ?? "Reverted"), code: name };
    default:
      return { title: name, code: name };
  }
}

export function friendly(e: unknown): Friendly {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return { title: "Cancelled in your wallet" };
    if (e.walk((x) => x instanceof InsufficientFundsError)) return { title: "Not enough test ETH for this and gas", fix: "faucet" };
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) {
      if (r.data?.errorName) return fromName(r.data.errorName, r.data.args ?? []);
      const raw = (r as unknown as { raw?: Hex }).raw;
      if (raw) {
        try {
          const d = decodeErrorResult({ abi: combined, data: raw });
          return fromName(d.errorName, d.args ?? []);
        } catch {}
      }
      return { title: r.shortMessage || "The transaction would fail" };
    }
    if (/chain/i.test(e.shortMessage) && /mismatch|does not match/i.test(e.message)) return { title: "Wrong network in your wallet", fix: "switch-chain" };
    if (/replacement|nonce/i.test(e.message)) return { title: "Your wallet had a pending transaction", fix: "retry" };
    return { title: e.shortMessage };
  }
  return { title: e instanceof Error ? e.message : String(e) };
}
