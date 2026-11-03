import { describe, expect, it } from "vitest";
import { encodeEventTopics } from "viem";
import {
  duplicateCancellation,
  verifyDuplicateCancellation,
} from "../../scripts/checkout-safety.mjs";
import { operatorAbi } from "../lib/contracts.generated.ts";
import { snapshot, id, operator, seller, buyer } from "./fixtures.ts";

function state() {
  const original = {
    id,
    order: snapshot().order,
    status: 1,
    preApproved: false,
    paymentState: [false, 0n, 0n],
  };
  original.order.status = 1;
  const secondId = `0x${"ef".repeat(32)}`;
  const duplicate = {
    ...original,
    id: secondId,
    order: {
      ...original.order,
      payment: { ...original.order.payment, salt: BigInt(secondId) },
    },
  };
  return { original, duplicate, seller, operator, block: { number: 500n } };
}
function cancellationReceipt(s, by = seller, cancelledId = s.duplicate.id) {
  return {
    status: "success",
    blockNumber: 499n,
    logs: [
      {
        address: operator,
        data: "0x",
        topics: encodeEventTopics({
          abi: operatorAbi,
          eventName: "OrderVoided",
          args: { orderId: cancelledId, authorizedBy: by },
        }),
      },
    ],
  };
}
function cancelledState() {
  const s = state();
  s.duplicate.status = 5;
  s.duplicate.order.status = 5;
  return s;
}
describe("manual checkout continuation safety", () => {
  it("prepares only operator.cancel(duplicate), never CPP void or original cancellation", () => {
    const s = state(),
      tx = duplicateCancellation(s);
    expect(tx.from).toBe(seller);
    expect(tx.to).toBe(operator);
    expect(tx.value).toBe("0x0");
    expect(tx.data).toBe(`0xc4d252f5${s.duplicate.id.slice(2)}`);
    expect(tx.data).not.toContain(id.slice(2));
    s.duplicate.id = s.original.id;
    expect(() => duplicateCancellation(s)).toThrow(
      "Original must never be cancelled",
    );
  });
  it.each(["original", "duplicate"])(
    "blocks when %s has pre-approval or any CPP funds",
    (label) => {
      for (const change of [
        { preApproved: true },
        { paymentState: [true, 0n, 0n] },
        { paymentState: [false, 1n, 0n] },
        { paymentState: [false, 0n, 1n] },
      ]) {
        const s = state();
        Object.assign(s[label], change);
        expect(() => duplicateCancellation(s)).toThrow(
          "Unexpected authorization or funds",
        );
      }
    },
  );
  it("blocks changed terms or order status", () => {
    const s = state();
    s.duplicate.order.payment.maxAmount = 2_000_000n;
    expect(() => duplicateCancellation(s)).toThrow("identical terms");
    const other = state();
    other.duplicate.order.status = 2;
    expect(() => duplicateCancellation(other)).toThrow("still be pending");
  });
  it("verifies exact event and both states even if the outer sender and target are relayers", () => {
    const s = cancelledState();
    expect(
      verifyDuplicateCancellation(
        { ...cancellationReceipt(s), from: buyer, to: buyer },
        s,
      ),
    ).toBe(true);
  });
  it("rejects success without the matching event, wrong emitter, or wrong authorizer", () => {
    const s = cancelledState();
    expect(() =>
      verifyDuplicateCancellation({ ...cancellationReceipt(s), logs: [] }, s),
    ).toThrow("Missing exact");
    const wrong = cancellationReceipt(s);
    wrong.logs[0].address = buyer;
    expect(() => verifyDuplicateCancellation(wrong, s)).toThrow(
      "Missing exact",
    );
    expect(() =>
      verifyDuplicateCancellation(cancellationReceipt(s, buyer), s),
    ).toThrow("Missing exact");
  });
  it("rejects cancellation of the original and inconsistent readback", () => {
    const s = cancelledState();
    expect(() =>
      verifyDuplicateCancellation(
        cancellationReceipt(s, seller, s.original.id),
        s,
      ),
    ).toThrow("Original cancellation");
    s.original.status = 5;
    expect(() =>
      verifyDuplicateCancellation(cancellationReceipt(s), s),
    ).toThrow("original must remain pending");
  });
  it("rejects failed receipts, insufficient confirmations and unexpected retained funds", () => {
    const s = cancelledState();
    expect(() =>
      verifyDuplicateCancellation(
        { ...cancellationReceipt(s), status: "reverted" },
        s,
      ),
    ).toThrow("successful receipt");
    expect(() =>
      verifyDuplicateCancellation(
        { ...cancellationReceipt(s), blockNumber: 500n },
        s,
      ),
    ).toThrow("two confirmations");
    s.duplicate.paymentState = [true, 1_000_000n, 0n];
    expect(() =>
      verifyDuplicateCancellation(cancellationReceipt(s), s),
    ).toThrow("Unexpected authorization or funds");
  });
});
