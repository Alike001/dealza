import cancellation from "./recorded/cancellation.json";
import checkout from "../../../docs/verification/checkout-continuation/snapshot.json";
import { describe, expect, it, vi } from "vitest";
import {
  erc20Abi,
  formatTransactionReceipt,
  formatTransaction,
  encodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import {
  verifyActionEffects,
  verifyCanonicalReceipt,
  verifyCreationEffects,
  type CanonicalReader,
  type ReceiptNetwork,
} from "../lib/receiptProof";
import {
  operatorAbi,
  collectorAbi,
  escrowAbi,
} from "../lib/contracts.generated";
import {
  live,
  row,
  receiptOf,
  stateOf,
  transactionOf,
} from "./helpers/recorded";
import type { Action, OrderSnapshot } from "../lib/domain";
const n = live.addresses as ReceiptNetwork;
const evidence =
  "0xe81e15ba659740bcf8626122f97a3abec2c73ea4833c149f2ff47bc5210dbe82" as Hash;
const wrong = "0x1111111111111111111111111111111111111111" as Address;
const wrongHash = `0x${"11".repeat(32)}` as Hash;
function reader(action: string): CanonicalReader {
  const r = receiptOf(action),
    tx = transactionOf(action);
  return {
    getChainId: vi.fn(async () => 84532),
    getTransactionReceipt: vi.fn(async () => r),
    getTransaction: vi.fn(async () => tx),
    getBlock: vi.fn(async () => ({
      hash: r.blockHash,
      number: r.blockNumber,
      transactions: [r.transactionHash],
    })),
    getBlockNumber: vi.fn(async () => r.blockNumber + 2n),
  };
}
function verify(
  action: Action,
  changed: Partial<Parameters<typeof verifyActionEffects>[0]> = {},
) {
  verifyActionEffects({
    action,
    actor: (action === "delivery"
      ? live.addresses.seller
      : live.addresses.buyer) as Address,
    before: stateOf(action, "before"),
    after: stateOf(action, "after"),
    proof: evidence,
    receipt: receiptOf(action),
    network: n,
    ...changed,
  });
}
function replaceEvent(
  r: TransactionReceipt,
  address: Address,
  name: string,
  args: Record<string, unknown>,
) {
  const abi =
    address.toLowerCase() === n.operator.toLowerCase()
      ? operatorAbi
      : address.toLowerCase() === n.collector.toLowerCase()
        ? collectorAbi
        : escrowAbi;
  const event = getAbiItem({ abi, name } as never) as unknown as {
    inputs: { name: string; type: string; indexed?: boolean }[];
  };
  const index = r.logs.findIndex(
    (l) =>
      l.address.toLowerCase() === address.toLowerCase() &&
      l.topics[0] === encodeEventTopics({ abi, eventName: name } as never)[0],
  );
  if (index < 0) throw Error("Fixture lacks event");
  r.logs[index] = {
    ...r.logs[index],
    topics: encodeEventTopics({ abi, eventName: name, args } as never),
    data: encodeAbiParameters(
      event.inputs.filter((x) => !x.indexed),
      event.inputs.filter((x) => !x.indexed).map((x) => args[x.name]),
    ),
  } as (typeof r.logs)[number];
  return r;
}
describe("authentic routed receipts and exact effects", () => {
  it.each(["approve", "preApprove", "fund", "delivery", "release"] as const)(
    "accepts recorded %s and historical state without an outer actor assumption",
    async (action) => {
      await verifyCanonicalReceipt(reader(action), receiptOf(action));
      verify(action);
      expect(transactionOf(action).from.toLowerCase()).not.toBe(
        (action === "delivery"
          ? live.addresses.seller
          : live.addresses.buyer
        ).toLowerCase(),
      );
    },
  );
  it("accepts recorded creation with its exact immutable terms", async () => {
    const r = receiptOf("create"),
      state = stateOf("create", "after");
    await verifyCanonicalReceipt(reader("create"), r);
    const terms = {
      buyer: state.order.payment.payer,
      reviewer: state.order.reviewer,
      amount: state.order.payment.maxAmount,
      fundingCutoff: state.order.payment.preApprovalExpiry,
      expiry: state.order.payment.authorizationExpiry,
      description: "Dealza Checkpoint 4: controlled 1 test-USDC checkout",
    };
    expect(
      verifyCreationEffects(r, n, state.order.payment.receiver, terms).id,
    ).toBe(state.id);
  });
  it.each(["approve", "preApprove", "fund", "delivery", "release"] as const)(
    "uses the same proof for direct EOA %s",
    async (action) => {
      const c = reader(action),
        tx = transactionOf(action),
        state = stateOf(action, "before");
      const actor = (
        action === "delivery" ? live.addresses.seller : live.addresses.buyer
      ) as Address;
      const target =
        action === "approve"
          ? n.usdc
          : action === "preApprove"
            ? n.collector
            : n.operator;
      const abi =
        action === "approve"
          ? erc20Abi
          : action === "preApprove"
            ? collectorAbi
            : operatorAbi;
      const fn = action === "delivery" ? "noteDelivery" : action;
      const args =
        action === "approve"
          ? [n.collector, state.order.payment.maxAmount]
          : action === "preApprove"
            ? [state.order.payment]
            : action === "fund"
              ? [state.id, state.order.payment]
              : action === "delivery"
                ? [state.id, evidence]
                : [state.id];
      c.getTransaction = vi.fn(async () => ({
        ...tx,
        from: actor,
        to: target,
        type: "eip1559" as const,
        input: encodeFunctionData({ abi, functionName: fn, args } as never),
      }));
      await verifyCanonicalReceipt(c, receiptOf(action));
      verify(action);
    },
  );
  it("rejects logs from a malicious or unrelated contract", () => {
    const r = receiptOf("release");
    r.logs = r.logs.map((l) => ({ ...l, address: wrong }));
    expect(() => verify("release", { receipt: r })).toThrow();
  });
  it.each(["orderId", "authorizedBy"] as const)(
    "rejects release with wrong %s",
    (field) => {
      const r = replaceEvent(
        receiptOf("release"),
        n.operator,
        "OrderReleased",
        {
          orderId: stateOf("release", "before").id,
          authorizedBy: live.addresses.buyer,
          [field]: field === "orderId" ? wrongHash : wrong,
        },
      );
      expect(() => verify("release", { receipt: r })).toThrow();
    },
  );
  it.each(["paymentInfoHash", "amount", "feeAmount", "feeReceiver"] as const)(
    "rejects capture with wrong %s",
    (field) => {
      const args = {
        paymentInfoHash: stateOf("release", "before").order.paymentHash,
        amount: 1000000n,
        feeAmount: 0n,
        feeReceiver: "0x0000000000000000000000000000000000000000",
        [field]:
          field === "paymentInfoHash"
            ? wrongHash
            : field === "feeReceiver"
              ? wrong
              : 1n,
      };
      expect(() =>
        verify("release", {
          receipt: replaceEvent(
            receiptOf("release"),
            n.escrow,
            "PaymentCaptured",
            args,
          ),
        }),
      ).toThrow();
    },
  );
  it("rejects a wrong approval owner/token/spender/value and resulting allowance", () => {
    for (const variant of ["token", "owner", "spender", "amount", "state"]) {
      const r = receiptOf("approve"),
        after = stateOf("approve", "after");
      const l = r.logs.find(
        (l) => l.address.toLowerCase() === n.usdc.toLowerCase(),
      )!;
      if (variant === "token") l.address = wrong;
      if (variant === "owner")
        l.topics[1] = `0x${wrong.slice(2).padStart(64, "0")}`;
      if (variant === "spender")
        l.topics[2] = `0x${wrong.slice(2).padStart(64, "0")}`;
      if (variant === "amount") l.data = `0x${"0".repeat(63)}1`;
      if (variant === "state") after.allowance = 0n;
      expect(() => verify("approve", { receipt: r, after })).toThrow();
    }
  });
  it.each(["fund", "release"] as const)(
    "rejects %s without custody/accounting or the exact actual token transfer",
    (action) => {
      const after = stateOf(action, "after");
      after.held = 77n;
      expect(() => verify(action, { after })).toThrow();
      const r = receiptOf(action);
      r.logs = r.logs.filter(
        (l) => l.address.toLowerCase() !== n.usdc.toLowerCase(),
      );
      expect(() => verify(action, { receipt: r })).toThrow();
    },
  );
  it("rejects partially completed wrapper effects and additional approvals/transfers", () => {
    const r = receiptOf("release");
    r.logs.push(
      ...receiptOf("approve").logs.filter(
        (l) => l.address.toLowerCase() === n.usdc.toLowerCase(),
      ),
    );
    expect(() => verify("release", { receipt: r })).toThrow();
    expect(() =>
      verify("delivery", { after: stateOf("release", "after") }),
    ).toThrow();
  });
});
describe("canonical receipt identity", () => {
  it.each([
    "chain",
    "hash",
    "block",
    "inclusion",
    "confirmations",
    "logs",
    "reverted",
    "upgrade",
  ] as const)("rejects %s mismatch", async (variant) => {
    const c = reader("release"),
      r = receiptOf("release");
    if (variant === "chain") c.getChainId = vi.fn(async () => 1);
    if (variant === "hash")
      c.getTransaction = vi.fn(async () => ({
        ...transactionOf("release"),
        hash: wrongHash,
      }));
    if (variant === "block")
      c.getBlock = vi.fn(async () => ({
        number: r.blockNumber,
        hash: wrongHash,
        transactions: [r.transactionHash],
      }));
    if (variant === "inclusion")
      c.getBlock = vi.fn(async () => ({
        number: r.blockNumber,
        hash: r.blockHash,
        transactions: [],
      }));
    if (variant === "confirmations")
      c.getBlockNumber = vi.fn(async () => r.blockNumber);
    if (variant === "logs") r.logs[0].blockHash = wrongHash;
    if (variant === "reverted") r.status = "reverted";
    if (variant === "upgrade")
      c.getTransaction = vi.fn(async () => ({
        ...transactionOf("release"),
        input: "0x" as const,
      }));
    await expect(verifyCanonicalReceipt(c, r)).rejects.toThrow();
  });
});

// Hypothetical branches below are offline ABI fixtures, not mined evidence.
describe("synthetic cancellation, reviewer and expiry branches", () => {
  const syntheticHash = `0x${"ee".repeat(32)}` as Hash;
  const evt = (
    address: Address,
    name: string,
    args: Record<string, unknown>,
  ) => ({ address, name, args });
  const op = (name: string, args: Record<string, unknown>) =>
    evt(n.operator, name, {
      orderId: stateOf("release", "before").id,
      ...args,
    });
  const cpp = (name: string, args: Record<string, unknown>) =>
    evt(n.escrow, name, {
      paymentInfoHash: stateOf("release", "before").order.paymentHash,
      ...args,
    });
  const amount = 1000000n;
  const returnTransfer = () =>
    evt(n.usdc, "Transfer", {
      from: live.addresses.tokenStore,
      to: live.addresses.buyer,
      value: amount,
    });
  function syntheticReceipt(
    events: ReturnType<typeof evt>[],
  ): TransactionReceipt {
    const r = receiptOf("release");
    r.transactionHash = syntheticHash;
    r.blockHash = syntheticHash;
    r.blockNumber = 1000n;
    r.logs = events.map((e, index) => {
      const abi =
        e.address === n.usdc
          ? erc20Abi
          : e.address === n.escrow
            ? escrowAbi
            : operatorAbi;
      const entry = getAbiItem({ abi, name: e.name } as never) as unknown as {
        inputs: { name: string; type: string; indexed?: boolean }[];
      };
      return {
        ...r.logs[0],
        address: e.address,
        transactionHash: syntheticHash,
        blockHash: syntheticHash,
        blockNumber: 1000n,
        logIndex: index,
        topics: encodeEventTopics({
          abi,
          eventName: e.name,
          args: e.args,
        } as never),
        data: encodeAbiParameters(
          entry.inputs.filter((i) => !i.indexed),
          entry.inputs.filter((i) => !i.indexed).map((i) => e.args[i.name]),
        ),
      } as TransactionReceipt["logs"][number];
    });
    return r;
  }
  it.each([
    "cancel",
    "resolveRelease",
    "resolveVoid",
    "reclaim",
    "sync",
    "dispute",
    "revoke",
  ] as const)(
    "verifies exact %s events and state, and rejects a wrong state",
    (action) => {
      const before = stateOf("release", "before");
      let after = stateOf("release", "after"),
        actor = before.order.payment.payer;
      let events: ReturnType<typeof evt>[] = [];
      if (action === "cancel") {
        actor = before.order.payment.receiver;
        after = {
          ...after,
          order: { ...after.order, status: 5 },
          derived: 5,
          captured: 0n,
        };
        events = [
          cpp("PaymentVoided", { amount }),
          returnTransfer(),
          op("OrderVoided", { authorizedBy: actor }),
        ];
      } else if (action === "resolveRelease" || action === "resolveVoid") {
        before.order.status = 3;
        before.derived = 3;
        actor = before.order.reviewer;
        const release = action === "resolveRelease";
        if (!release)
          after = {
            ...after,
            order: { ...after.order, status: 5 },
            derived: 5,
            captured: 0n,
          };
        events = release
          ? [
              cpp("PaymentCaptured", {
                amount,
                feeAmount: 0n,
                feeReceiver: "0x0000000000000000000000000000000000000000",
              }),
              evt(n.usdc, "Transfer", {
                from: before.tokenStore,
                to: before.order.payment.receiver,
                value: amount,
              }),
              op("OrderReleased", { authorizedBy: actor }),
            ]
          : [
              cpp("PaymentVoided", { amount }),
              returnTransfer(),
              op("OrderVoided", { authorizedBy: actor }),
            ];
        events.push(
          op("DisputeResolved", {
            releaseToSeller: release,
            decisionHash: evidence,
          }),
        );
      } else if (action === "reclaim") {
        before.derived = 6;
        before.chainTime = before.order.payment.authorizationExpiry;
        after = {
          ...after,
          order: { ...before.order },
          derived: 7,
          captured: 0n,
        };
        events = [cpp("PaymentReclaimed", { amount }), returnTransfer()];
      } else if (action === "sync") {
        before.derived = 7;
        before.held = 0n;
        before.storeBalance = 0n;
        after = { ...before, order: { ...before.order, status: 7 } };
        events = [op("RecoverySynced", {})];
      } else if (action === "dispute") {
        after = {
          ...before,
          order: { ...before.order, status: 3 },
          derived: 3,
        };
        events = [op("DisputeOpened", { by: actor, evidenceHash: evidence })];
      } else {
        before.allowance = amount;
        after = { ...before, allowance: 0n };
        events = [
          evt(n.usdc, "Approval", {
            owner: actor,
            spender: n.collector,
            value: 0n,
          }),
        ];
      }
      const receipt = syntheticReceipt(events);
      after.block = receipt.blockNumber;
      const verify = () =>
        verifyActionEffects({
          action,
          actor,
          before,
          after,
          proof: evidence,
          receipt,
          network: n,
        });
      expect(verify).not.toThrow();
      if (action !== "sync")
        expect(() =>
          verifyActionEffects({
            action,
            actor: wrong,
            before,
            after,
            proof: evidence,
            receipt,
            network: n,
          }),
        ).toThrow();
      after.order = { ...after.order, status: 99 };
      expect(verify).toThrow();
    },
  );
  it("verifies an unfunded cancellation without inventing a refund transfer", () => {
    const before = stateOf("approve", "before"),
      after = {
        ...before,
        block: 1000n,
        order: { ...before.order, status: 5 },
        derived: 5,
      };
    const receipt = syntheticReceipt([
      op("OrderVoided", { authorizedBy: before.order.payment.receiver }),
    ]);
    expect(() =>
      verifyActionEffects({
        action: "cancel",
        actor: before.order.payment.receiver,
        before,
        after,
        proof: evidence,
        receipt,
        network: n,
      }),
    ).not.toThrow();
  });
});

describe("authentic duplicate cancellation receipt", () => {
  it("verifies seller-authorized void with no invented funding or return", async () => {
    const r = formatTransactionReceipt(cancellation.receipt as never),
      tx = formatTransaction(cancellation.transaction as never);
    const block = cancellation.block;
    const c: CanonicalReader = {
      getChainId: async () => 84532,
      getTransactionReceipt: async () => r,
      getTransaction: async () => tx,
      getBlock: async () => ({
        ...block,
        number: BigInt(block.number),
        hash: block.hash as Hash,
        transactions: block.transactions as Hash[],
      }),
      getBlockNumber: async () => r.blockNumber + 2n,
    };
    await verifyCanonicalReceipt(c, r);
    // The exact stored duplicate terms are already verified. The genuine no-transfer
    // OrderVoided branch establishes Pending -> Voided; it is not a funded refund.
    const o = checkout.duplicate.order;
    const before = {
      ...stateOf("approve", "before"),
      id: checkout.duplicate.id as Hash,
      order: {
        ...o,
        status: 1,
        payment: {
          ...o.payment,
          maxAmount: BigInt(o.payment.maxAmount),
          salt: BigInt(o.payment.salt),
        },
      },
      derived: 1,
      block: r.blockNumber - 1n,
    } as OrderSnapshot;
    const after = {
      ...before,
      order: { ...before.order, status: 5 },
      derived: 5,
      block: r.blockNumber,
    };
    expect(() =>
      verifyActionEffects({
        action: "cancel",
        actor: live.addresses.seller as Address,
        before,
        after,
        proof: evidence,
        receipt: r,
        network: n,
      }),
    ).not.toThrow();
  });
});

describe("funding terms are bound to the exact CPP payment", () => {
  it.each([
    "hash",
    "collector",
    "token",
    "payer",
    "receiver",
    "amount",
  ] as const)("rejects incorrect funding %s", (field) => {
    const before = stateOf("fund", "before");
    const payment = {
      ...before.order.payment,
      ...(field === "token"
        ? { token: wrong }
        : field === "payer"
          ? { payer: wrong }
          : field === "receiver"
            ? { receiver: wrong }
            : {}),
    };
    const r = replaceEvent(receiptOf("fund"), n.escrow, "PaymentAuthorized", {
      paymentInfoHash: field === "hash" ? wrongHash : before.order.paymentHash,
      paymentInfo: payment,
      amount: field === "amount" ? 1n : 1000000n,
      tokenCollector: field === "collector" ? wrong : n.collector,
    });
    expect(() => verify("fund", { receipt: r })).toThrow();
  });
});
