import type { TransactionReceipt, Transaction, Hash } from "viem";
import type { OrderSnapshot, Payment } from "../../lib/domain";
import recorded from "../recorded/live-payment.json";
export const live = recorded;
export const row = (action: string) =>
  recorded.rows.find((r) => r.action === action)!;
export function receiptOf(action: string): TransactionReceipt {
  const r = row(action).receipt;
  return {
    ...r,
    blockNumber: BigInt(r.blockNumber),
    logs: r.logs.map((l) => ({ ...l, blockNumber: BigInt(l.blockNumber) })),
  } as unknown as TransactionReceipt;
}
export function transactionOf(action: string): Transaction {
  const tx = row(action).transaction;
  return {
    ...tx,
    blockNumber: BigInt(tx.blockNumber),
    value: BigInt(tx.value),
  } as unknown as Transaction;
}
export function stateOf(
  action: string,
  phase: "before" | "after",
): OrderSnapshot {
  const s = row(action)[phase],
    o = s.orders.original;
  if (!o.order || !o.paymentState)
    throw Error("Original order did not yet exist");
  return {
    id: o.id as Hash,
    order: {
      ...o.order,
      payment: {
        ...o.order.payment,
        maxAmount: BigInt(o.order.payment.maxAmount),
        salt: BigInt(o.order.payment.salt),
      } as Payment,
    },
    derived: o.status!,
    collected: o.paymentState[0] as boolean,
    held: BigInt(o.paymentState[1] as string),
    captured: BigInt(o.paymentState[2] as string),
    allowance: BigInt(s.allowance),
    preApproved: o.preApproved!,
    buyerBalance: BigInt(s.balances.buyer),
    buyerGas: 1n,
    tokenStore: live.addresses.tokenStore as `0x${string}`,
    storeBalance: BigInt(s.balances.tokenStore),
    chainTime: 1793698000,
    block: BigInt(s.blockNumber),
  } as OrderSnapshot;
}
