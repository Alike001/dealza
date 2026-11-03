import {
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
  toBytes,
  type Address,
  type Hash,
} from "viem";

export type Payment = {
  operator: Address;
  payer: Address;
  receiver: Address;
  token: Address;
  maxAmount: bigint;
  preApprovalExpiry: number;
  authorizationExpiry: number;
  refundExpiry: number;
  minFeeBps: number;
  maxFeeBps: number;
  feeReceiver: Address;
  salt: bigint;
};
export type Order = {
  payment: Payment;
  reviewer: Address;
  descriptionHash: Hash;
  paymentHash: Hash;
  status: number;
};
export type Activity = {
  logIndex: number;
  name: string;
  hash: Hash;
  block: bigint;
  timestamp: number;
  detail: string;
};
export type OrderSnapshot = {
  id: Hash;
  order: Order;
  derived: number;
  collected: boolean;
  held: bigint;
  captured: bigint;
  allowance: bigint;
  preApproved: boolean;
  buyerBalance: bigint;
  buyerGas: bigint;
  tokenStore: Address;
  storeBalance: bigint;
  chainTime: number;
  block: bigint;
};
export type Action =
  | "approve"
  | "preApprove"
  | "fund"
  | "release"
  | "delivery"
  | "dispute"
  | "resolveRelease"
  | "resolveVoid"
  | "cancel"
  | "reclaim"
  | "sync"
  | "revoke";
export type CreateTerms = {
  buyer: Address;
  amount: bigint;
  fundingCutoff: number;
  expiry: number;
  reviewer: Address;
  description: string;
};
export type TxState = {
  phase: "idle" | "checking" | "signature" | "pending" | "confirmed" | "error";
  message: string;
  hash?: Hash;
};
export const idleTx: TxState = { phase: "idle", message: "" };
export const sameAddress = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const shortAddress = (value: string) =>
  `${value.slice(0, 6)}…${value.slice(-4)}`;
export const money = (amount: bigint) => formatUnits(amount, 6);
export const descriptionHash = (text: string): Hash =>
  keccak256(toBytes(text.normalize("NFC").trim()));
export const isOrderId = (value: string): value is Hash =>
  /^0x[0-9a-fA-F]{64}$/.test(value);
export function amountFromText(text: string): bigint {
  if (!/^\d{1,30}(\.\d{1,6})?$/.test(text))
    throw new Error("Enter a USDC amount with up to 6 decimal places.");
  const amount = parseUnits(text, 6);
  if (amount <= 0n || amount > (1n << 120n) - 1n)
    throw new Error("Enter a positive amount within the payment limit.");
  return amount;
}
export function validateTerms(
  input: {
    buyer: string;
    reviewer: string;
    amount: string;
    description: string;
    fundingCutoff: string;
    expiry: string;
  },
  seller?: Address,
  now = Date.now() / 1000,
): CreateTerms {
  if (!seller) throw new Error("Connect the seller wallet first.");
  if (!isAddress(input.buyer) || /^0x0{40}$/i.test(input.buyer))
    throw new Error("Enter the buyer’s complete wallet address.");
  if (!isAddress(input.reviewer) || /^0x0{40}$/i.test(input.reviewer))
    throw new Error("Enter the agreed reviewer’s complete wallet address.");
  if (
    sameAddress(seller, input.buyer) ||
    sameAddress(seller, input.reviewer) ||
    sameAddress(input.buyer, input.reviewer)
  )
    throw new Error("Seller, buyer, and reviewer must use different wallets.");
  const fundingCutoff = Math.floor(
    new Date(input.fundingCutoff).getTime() / 1000,
  );
  const expiry = Math.floor(new Date(input.expiry).getTime() / 1000);
  if (
    !Number.isFinite(fundingCutoff) ||
    !Number.isFinite(expiry) ||
    fundingCutoff <= now + 60 ||
    expiry < fundingCutoff ||
    expiry > now + 30 * 86400
  )
    throw new Error(
      "Choose future deadlines, with funding before expiry and expiry within 30 days. Leave time to sign.",
    );
  const description = input.description.normalize("NFC").trim();
  if (!description || description.length > 1600)
    throw new Error(
      "Describe the order and agreed terms in 1–1,600 characters.",
    );
  return {
    buyer: getAddress(input.buyer),
    reviewer: getAddress(input.reviewer),
    amount: amountFromText(input.amount),
    fundingCutoff,
    expiry,
    description,
  };
}
export function financialStatus(s: OrderSnapshot): string {
  const p = s.order.payment;
  if (s.storeBalance < s.held)
    throw new Error(
      "The protocol reserve balance is below this authorization. Payment records need review.",
    );
  const verified = (label: string, expected: number) => {
    if (s.derived !== expected)
      throw new Error(
        "Payment records do not agree. Refresh before taking any action.",
      );
    return label;
  };
  if (
    s.order.status === 4 &&
    s.collected &&
    s.held === 0n &&
    s.captured === p.maxAmount
  )
    return verified("Paid to seller", 4);
  if (s.order.status === 5 && s.held === 0n && s.captured === 0n)
    return verified("Cancelled", 5);
  if (
    (s.order.status === 2 || s.order.status === 3 || s.order.status === 7) &&
    s.collected &&
    s.held === 0n &&
    s.captured === 0n &&
    s.chainTime >= p.authorizationExpiry
  )
    return verified("Recovered by buyer", 7);
  if (
    (s.order.status === 2 || s.order.status === 3) &&
    s.collected &&
    s.held === p.maxAmount &&
    s.captured === 0n
  ) {
    if (s.chainTime >= p.authorizationExpiry)
      return verified("Recovery available", 6);
    return s.order.status === 3
      ? verified("In review", 3)
      : verified("Payment reserved", 2);
  }
  if (
    s.order.status === 1 &&
    !s.collected &&
    s.held === 0n &&
    s.captured === 0n
  )
    return s.chainTime >= p.preApprovalExpiry
      ? verified("Payment window closed", 6)
      : verified("Awaiting payment", 1);
  throw new Error(
    "Payment records do not agree. Refresh before taking any action.",
  );
}
export function allowedActions(s: OrderSnapshot, actor?: Address): Action[] {
  financialStatus(s); // Fail closed on inconsistent financial reads.
  if (!actor) return [];
  const p = s.order.payment;
  const buyer = sameAddress(actor, p.payer),
    seller = sameAddress(actor, p.receiver),
    reviewer = sameAddress(actor, s.order.reviewer);
  const active = s.chainTime < p.authorizationExpiry;
  const actions: Action[] = [];
  if (buyer && s.allowance > 0n) actions.push("revoke");
  if (s.order.status === 1) {
    if (buyer || seller) actions.push("cancel");
    if (buyer && s.chainTime < p.preApprovalExpiry) {
      if (s.allowance === 0n) actions.push("approve");
      if (!s.preApproved) actions.push("preApprove");
      if (
        s.allowance >= p.maxAmount &&
        s.preApproved &&
        s.buyerBalance >= p.maxAmount &&
        s.buyerGas > 0n
      )
        actions.push("fund");
    }
  }
  if ((s.order.status === 2 || s.order.status === 3) && s.held > 0n) {
    if (seller) actions.push("cancel");
    if (active) {
      if (seller) actions.push("delivery");
      if (s.order.status === 2) {
        if (buyer) actions.push("release");
        if (buyer || seller) actions.push("dispute");
      } else if (reviewer) actions.push("resolveRelease", "resolveVoid");
    } else if (buyer) actions.push("reclaim");
  }
  if (s.derived === 7 && s.order.status !== 7) actions.push("sync");
  return actions;
}
export function friendlyError(error: unknown): string {
  const e = error as {
    code?: number;
    name?: string;
    message?: string;
    cause?: unknown;
  };
  if (e?.code === 4001 || /rejected|denied|cancelled/i.test(e?.message || ""))
    return "You declined the wallet request. Nothing was confirmed. You can try again.";
  if (/insufficient funds|exceeds.*balance/i.test(e?.message || ""))
    return "Your wallet needs enough test ETH for gas and test USDC for this payment.";
  if (/revert|execution reverted/i.test(e?.message || ""))
    return "The transaction was rejected by the contract. No successful payment is recorded. Refresh the order and check its deadline.";
  if (e?.cause && e.cause !== error) return friendlyError(e.cause);
  return (
    e?.message?.split("\n")[0]?.slice(0, 230) ||
    "We could not complete that request. Refresh and try again."
  );
}
export function shareLink(id: Hash, description = ""): string {
  return `${location.origin}${location.pathname}#/order/${id}${description ? "?terms=" + encodeURIComponent(description.normalize("NFC").trim()) : ""}`;
}
