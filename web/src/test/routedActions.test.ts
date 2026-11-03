import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeFunctionData,
  keccak256,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import {
  row,
  live,
  receiptOf,
  stateOf,
  transactionOf,
} from "./helpers/recorded";
import { session } from "./fixtures";
import acknowledgement from "../../../docs/verification/first-live-payment/reservation/controlled-test-acknowledgment.txt?raw";
import type { Action } from "../lib/domain";
import { pendingIntent, saveIntent } from "../lib/pendingTransaction";
const client = vi.hoisted(() => ({
  getChainId: vi.fn(),
  getCode: vi.fn(),
  getBlockNumber: vi.fn(),
  getBlock: vi.fn(),
  readContract: vi.fn(),
  getBalance: vi.fn(),
  simulateContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  getTransaction: vi.fn(),
  getTransactionReceipt: vi.fn(),
}));
const wallet = vi.hoisted(() => ({ writeContract: vi.fn() }));
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createPublicClient: () => client,
  createWalletClient: () => wallet,
}));
vi.mock("../lib/config", async (original) => {
  const c = await original<typeof import("../lib/config")>();
  const { keccak256 } = await import("viem");
  return {
    ...c,
    network: {
      ...c.network,
      escrowCodeHash: keccak256("0x02"),
      collectorCodeHash: keccak256("0x03"),
    },
  };
});
vi.mock("../lib/contracts.generated", async (original) => ({
  ...(await original<typeof import("../lib/contracts.generated")>()),
  operatorRuntimeHash: (await import("viem")).keccak256("0x01"),
}));
import { chainGateway } from "../lib/chainGateway";
let selected: "approve" | "preApprove" | "fund" | "delivery" | "release" =
  "release";
let receipt: TransactionReceipt;
let actor: Address;
function configure(action: typeof selected, direct = false) {
  selected = action;
  receipt = receiptOf(action);
  actor = (
    action === "delivery" ? live.addresses.seller : live.addresses.buyer
  ) as Address;
  const before = stateOf(action, "before"),
    after = stateOf(action, "after");
  client.getChainId.mockResolvedValue(84532);
  client.getCode.mockImplementation(async ({ address }) =>
    address.toLowerCase() === live.addresses.operator.toLowerCase()
      ? "0x01"
      : address.toLowerCase() === live.addresses.escrow.toLowerCase()
        ? "0x02"
        : "0x03",
  );
  client.getBlockNumber.mockImplementation(
    async () => receipt.blockNumber + 2n,
  );
  client.getBlock.mockImplementation(async ({ blockNumber } = {}) => ({
    number: blockNumber ?? receipt.blockNumber + 2n,
    hash: receipt.blockHash,
    transactions: [receipt.transactionHash],
    timestamp: 1793698000n,
  }));
  client.getBalance.mockResolvedValue(1n);
  client.simulateContract.mockResolvedValue({});
  client.readContract.mockImplementation(
    async ({ functionName, blockNumber, args }) => {
      const s = blockNumber === receipt.blockNumber ? after : before;
      const data: Record<string, unknown> = {
        ESCROW: live.addresses.escrow,
        COLLECTOR: live.addresses.collector,
        USDC: live.addresses.usdc,
        CHAIN_ID: 84532n,
        authCaptureEscrow: live.addresses.escrow,
        getOrder: s.order,
        status: s.derived,
        getHash: s.order.paymentHash,
        getTokenStore: s.tokenStore,
        paymentState: [s.collected, s.held, s.captured],
        allowance: s.allowance,
        isPreApproved: s.preApproved,
      };
      if (functionName === "balanceOf")
        return args[0].toLowerCase() === s.tokenStore.toLowerCase()
          ? s.storeBalance
          : s.buyerBalance;
      if (!(functionName in data))
        throw Error("Unexpected RPC test read " + functionName);
      return data[functionName];
    },
  );
  let directData: ReturnType<typeof encodeFunctionData> = "0x";
  let target: Address = live.addresses.operator as Address;
  wallet.writeContract.mockImplementation(async (call) => {
    directData = encodeFunctionData(call);
    target = call.address;
    return receipt.transactionHash;
  });
  client.waitForTransactionReceipt.mockImplementation(async () => receipt);
  client.getTransactionReceipt.mockImplementation(async () => receipt);
  client.getTransaction.mockImplementation(async () => ({
    ...transactionOf(action),
    hash: receipt.transactionHash,
    ...(direct ? { from: actor, to: target, input: directData } : {}),
  }));
}
beforeEach(() => {
  vi.resetAllMocks();
  configure("release");
});
describe("submission and reconciliation using authentic financial receipts (all wallet/RPC calls stubbed)", () => {
  it.each(["approve", "preApprove", "fund", "delivery", "release"] as const)(
    "confirms routed %s without assuming the outer caller",
    async (action) => {
      configure(action);
      const update = vi.fn();
      await chainGateway.act(
        action,
        stateOf(action, "before").id,
        session(actor),
        update,
        action === "delivery" ? acknowledgement : "",
      );
      expect(update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          phase: "confirmed",
          hash: receipt.transactionHash,
          snapshot: expect.objectContaining({
            id: stateOf(action, "after").id,
            block: receipt.blockNumber,
            order: stateOf(action, "after").order,
          }),
        }),
      );
      expect(wallet.writeContract).toHaveBeenCalledTimes(1);
      expect(
        pendingIntent(actor, live.addresses.operator as Address),
      ).toBeNull();
    },
  );
  it.each(["approve", "preApprove", "fund", "delivery", "release"] as const)(
    "confirms synthetic direct EOA %s carrying the same authenticated effects",
    async (action) => {
      configure(action, true);
      await chainGateway.act(
        action,
        stateOf(action, "before").id,
        session(actor),
        vi.fn(),
        action === "delivery" ? acknowledgement : "",
      );
      expect(
        pendingIntent(actor, live.addresses.operator as Address),
      ).toBeNull();
    },
  );
  it("does not submit again after timeout or a refreshed page; read-only reconciliation resolves it", async () => {
    client.waitForTransactionReceipt.mockRejectedValueOnce(
      Error("receipt timeout"),
    );
    const id = stateOf("release", "before").id;
    await expect(
      chainGateway.act("release", id, session(actor), vi.fn()),
    ).rejects.toThrow("do not submit again");
    expect(pendingIntent(actor, live.addresses.operator as Address)?.hash).toBe(
      receipt.transactionHash,
    );
    await expect(
      chainGateway.act("release", id, session(actor), vi.fn()),
    ).rejects.toThrow("unresolved");
    await chainGateway.resumePending(session(actor), vi.fn());
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
    expect(pendingIntent(actor, live.addresses.operator as Address)).toBeNull();
  });
  it("rejects a different receipt hash without clearing the original pending action", async () => {
    const original = receipt.transactionHash;
    client.waitForTransactionReceipt.mockResolvedValue({
      ...receipt,
      transactionHash: `0x${"ff".repeat(32)}`,
    });
    await expect(
      chainGateway.act(
        "release",
        stateOf("release", "before").id,
        session(actor),
        vi.fn(),
      ),
    ).rejects.toThrow("Receipt hash");
    expect(pendingIntent(actor, live.addresses.operator as Address)?.hash).toBe(
      original,
    );
  });
  it("retains an unverifiable success instead of allowing another payment", async () => {
    receipt.logs = receipt.logs.filter(
      (l) => l.address.toLowerCase() !== live.addresses.usdc.toLowerCase(),
    );
    const update = vi.fn();
    await expect(
      chainGateway.act(
        "release",
        stateOf("release", "before").id,
        session(actor),
        update,
      ),
    ).rejects.toThrow(/unverified|not verified/);
    expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
      false,
    );
    expect(
      pendingIntent(actor, live.addresses.operator as Address),
    ).not.toBeNull();
  });
  it("never opens a second wallet request while a submission is pending", async () => {
    let finish!: (r: TransactionReceipt) => void;
    client.waitForTransactionReceipt.mockImplementationOnce(
      () => new Promise((r) => (finish = r)),
    );
    const task = chainGateway.act(
      "release",
      stateOf("release", "before").id,
      session(actor),
      vi.fn(),
    );
    await vi.waitFor(() =>
      expect(client.waitForTransactionReceipt).toHaveBeenCalled(),
    );
    await expect(
      chainGateway.act(
        "release",
        stateOf("release", "before").id,
        session(actor),
        vi.fn(),
      ),
    ).rejects.toThrow("unresolved");
    await expect(
      chainGateway.resumePending(session(actor), vi.fn()),
    ).rejects.toThrow("still processing");
    finish(receipt);
    await task;
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
  });
  it("retains the original captured actor if the wallet switches during confirmation", async () => {
    let finish!: (r: TransactionReceipt) => void;
    client.waitForTransactionReceipt.mockImplementationOnce(
      () => new Promise((r) => (finish = r)),
    );
    const connected = session(actor);
    const task = chainGateway.act(
      "release",
      stateOf("release", "before").id,
      connected,
      vi.fn(),
    );
    await vi.waitFor(() =>
      expect(client.waitForTransactionReceipt).toHaveBeenCalled(),
    );
    connected.provider.request = vi.fn(async ({ method }) =>
      method === "eth_chainId" ? "0x1" : [live.addresses.seller],
    );
    finish(receipt);
    await task;
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
    expect(pendingIntent(actor, live.addresses.operator as Address)).toBeNull();
  });
  it("clears a canonically reverted receipt but never confirms it", async () => {
    receipt.status = "reverted";
    receipt.logs = [];
    const update = vi.fn();
    await expect(
      chainGateway.act(
        "release",
        stateOf("release", "before").id,
        session(actor),
        update,
      ),
    ).rejects.toThrow("canonically reverted");
    expect(pendingIntent(actor, live.addresses.operator as Address)).toBeNull();
    expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
      false,
    );
  });
  it("clears a genuinely declined wallet request without losing its order context", async () => {
    wallet.writeContract.mockRejectedValue({ cause: { code: 4001 } });
    await expect(
      chainGateway.act(
        "release",
        stateOf("release", "before").id,
        session(actor),
        vi.fn(),
      ),
    ).rejects.toBeDefined();
    expect(pendingIntent(actor, live.addresses.operator as Address)).toBeNull();
    expect(client.waitForTransactionReceipt).not.toHaveBeenCalled();
  });
});

describe("financial action replacement proof", () => {
  it("accepts a repriced release and preserves both hashes during confirmation", async () => {
    const original = receipt.transactionHash,
      replacement = `0x${"ab".repeat(32)}` as Hash;
    client.waitForTransactionReceipt.mockImplementationOnce(
      async ({ onReplaced }) => {
        receipt = {
          ...receipt,
          transactionHash: replacement,
          logs: receipt.logs.map((l) => ({
            ...l,
            transactionHash: replacement,
          })),
        };
        onReplaced({ reason: "repriced", transaction: { hash: replacement } });
        expect(
          pendingIntent(actor, live.addresses.operator as Address)?.hashes,
        ).toEqual([original, replacement]);
        return receipt;
      },
    );
    const update = vi.fn();
    await chainGateway.act(
      "release",
      stateOf("release", "before").id,
      session(actor),
      update,
    );
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "confirmed", hash: replacement }),
    );
  });
  it("recognizes an actual self-cancellation without calling it a successful release", async () => {
    const replacement = `0x${"ac".repeat(32)}` as Hash;
    client.waitForTransactionReceipt.mockImplementationOnce(
      async ({ onReplaced }) => {
        receipt = { ...receipt, transactionHash: replacement, logs: [] };
        onReplaced({ reason: "cancelled", transaction: { hash: replacement } });
        return receipt;
      },
    );
    const tx = transactionOf("release");
    client.getTransaction.mockImplementation(async () => ({
      ...tx,
      hash: replacement,
      to: tx.from,
      input: "0x",
      value: 0n,
    }));
    const update = vi.fn();
    await expect(
      chainGateway.act(
        "release",
        stateOf("release", "before").id,
        session(actor),
        update,
      ),
    ).rejects.toThrow("cancellation transaction");
    expect(pendingIntent(actor, live.addresses.operator as Address)).toBeNull();
    expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
      false,
    );
  });
  it("keeps a successful but unrelated replacement unresolved", async () => {
    const replacement = `0x${"ad".repeat(32)}` as Hash;
    client.waitForTransactionReceipt.mockImplementationOnce(
      async ({ onReplaced }) => {
        receipt = { ...receipt, transactionHash: replacement, logs: [] };
        onReplaced({ reason: "replaced", transaction: { hash: replacement } });
        return receipt;
      },
    );
    await expect(
      chainGateway.act(
        "release",
        stateOf("release", "before").id,
        session(actor),
        vi.fn(),
      ),
    ).rejects.toThrow("not verified");
    expect(pendingIntent(actor, live.addresses.operator as Address)?.hash).toBe(
      replacement,
    );
  });
});

it("rejects a new submission for the completed order before any wallet request", async () => {
  const read = client.readContract.getMockImplementation()!;
  const after = stateOf("release", "after");
  client.readContract.mockImplementation(async (call) => {
    if (call.functionName === "getOrder") return after.order;
    if (call.functionName === "status") return 4;
    if (call.functionName === "paymentState") return [true, 0n, 1000000n];
    if (
      call.functionName === "balanceOf" &&
      call.args[0].toLowerCase() === after.tokenStore.toLowerCase()
    )
      return 0n;
    return read(call);
  });
  await expect(
    chainGateway.act("release", after.id, session(actor), vi.fn()),
  ).rejects.toThrow("no longer available");
  expect(wallet.writeContract).not.toHaveBeenCalled();
  expect(client.simulateContract).not.toHaveBeenCalled();
});
