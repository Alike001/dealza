import { describe, expect, it } from "vitest";
import { encodeFunctionData } from "viem";
import { operatorAbi, collectorAbi } from "../lib/contracts.generated";
import recorded from "./recorded/live-payment.json";

// Captures the old send() condition before replacing it. Real receipts, no RPC/wallet calls.
describe("authentic pre-fix routed-receipt failure", () => {
  it.each(
    recorded.rows.filter((r) =>
      ["preApprove", "fund", "delivery", "release"].includes(r.action),
    ),
  )(
    "rejects the genuinely successful $action under the old direct-only rule",
    (r) => {
      const order = r.before.orders.original.order!;
      const fn = r.action === "delivery" ? "noteDelivery" : r.action;
      const args =
        r.action === "fund"
          ? [r.before.orders.original.id, order.payment]
          : r.action === "preApprove"
            ? [order.payment]
            : r.action === "delivery"
              ? [
                  r.before.orders.original.id,
                  "0xe81e15ba659740bcf8626122f97a3abec2c73ea4833c149f2ff47bc5210dbe82",
                ]
              : [r.before.orders.original.id];
      // Viem numeric ABI fields can be restored from recorded decimal strings.
      const data = encodeFunctionData({
        abi: r.action === "preApprove" ? collectorAbi : operatorAbi,
        functionName: fn,
        args,
      } as never);
      const actor =
        r.action === "delivery"
          ? recorded.addresses.seller
          : recorded.addresses.buyer;
      const target =
        r.action === "preApprove"
          ? recorded.addresses.collector
          : recorded.addresses.operator;
      const direct =
        r.transaction.from.toLowerCase() === actor.toLowerCase() &&
        r.transaction.to?.toLowerCase() === target.toLowerCase() &&
        r.transaction.input === data;
      expect(r.receipt.status).toBe("success");
      expect(direct).toBe(false);
    },
  );
});
