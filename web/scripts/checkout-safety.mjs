import { decodeEventLog, encodeFunctionData } from "viem";
import { operatorAbi } from "../src/lib/contracts.generated.ts";

export function requireUnfunded(item) {
  if (
    item.preApproved ||
    item.paymentState[0] ||
    item.paymentState[1] !== 0n ||
    item.paymentState[2] !== 0n
  )
    throw new Error(`Unexpected authorization or funds for ${item.id}`);
}
export function duplicateCancellation(snapshot) {
  const { original, duplicate, seller, operator } = snapshot;
  if (original.id === duplicate.id)
    throw new Error("Original must never be cancelled");
  requireUnfunded(original);
  requireUnfunded(duplicate);
  if (
    original.order.status !== 1 ||
    original.status !== 1 ||
    duplicate.order.status !== 1 ||
    duplicate.status !== 1
  )
    throw new Error("Both orders must still be pending");
  if (
    original.order.descriptionHash !== duplicate.order.descriptionHash ||
    original.order.reviewer !== duplicate.order.reviewer ||
    Object.entries(original.order.payment).some(
      ([key, value]) =>
        key !== "salt" &&
        String(value).toLowerCase() !==
          String(duplicate.order.payment[key]).toLowerCase(),
    )
  )
    throw new Error("Orders no longer have identical terms");
  if (original.order.payment.receiver.toLowerCase() !== seller.toLowerCase())
    throw new Error("Seller mismatch");
  return {
    chainId: "0x14a34",
    from: seller,
    to: operator,
    value: "0x0",
    data: encodeFunctionData({
      abi: operatorAbi,
      functionName: "cancel",
      args: [duplicate.id],
    }),
  };
}
export function verifyDuplicateCancellation(receipt, snapshot) {
  const { operator, seller, original, duplicate, block } = snapshot;
  if (
    receipt.status !== "success" ||
    block.number - receipt.blockNumber + 1n < 2n
  )
    throw new Error(
      "Cancellation requires a successful receipt and two confirmations",
    );
  const events = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== operator.toLowerCase()) continue;
    try {
      const event = decodeEventLog({
        abi: operatorAbi,
        topics: log.topics,
        data: log.data,
        strict: true,
      });
      if (event.eventName === "OrderVoided") events.push(event.args);
    } catch {
      /* An unrelated event does not establish cancellation. */
    }
  }
  if (events.some((event) => event.orderId === original.id))
    throw new Error("Original cancellation detected");
  if (
    events.filter(
      (event) =>
        event.orderId === duplicate.id &&
        event.authorizedBy.toLowerCase() === seller.toLowerCase(),
    ).length !== 1
  )
    throw new Error(
      "Missing exact duplicate cancellation event authorized by seller",
    );
  if (
    duplicate.order.status !== 5 ||
    duplicate.status !== 5 ||
    original.order.status !== 1 ||
    original.status !== 1
  )
    throw new Error(
      "Cancellation state does not agree; original must remain pending",
    );
  requireUnfunded(original);
  requireUnfunded(duplicate);
  return true;
}
