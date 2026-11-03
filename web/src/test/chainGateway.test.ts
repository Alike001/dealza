import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  toHex,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  getAbiItem,
  keccak256,
  type TransactionReceipt,
  type Address,
} from "viem";
import { operatorAbi } from "../lib/contracts.generated";
import { descriptionHash, type TxState, type Payment } from "../lib/domain";
import {
  buyer,
  hash,
  id,
  operator,
  reviewer,
  seller,
  session,
  snapshot,
  text,
} from "./fixtures";

// Every RPC and wallet method is stubbed. These tests cannot execute transactions.
const rpc = vi.hoisted(() => ({
  request: vi.fn(),
  getTransactionReceipt: vi.fn(),
  getChainId: vi.fn(),
  getCode: vi.fn(),
  readContract: vi.fn(),
  getBlock: vi.fn(),
  getBlockNumber: vi.fn(),
  getBalance: vi.fn(),
  simulateContract: vi.fn(),
  getTransaction: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));
const wallet = vi.hoisted(() => ({ writeContract: vi.fn() }));
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createPublicClient: () => ({
    ...rpc,
    getTransaction: async (args: { hash: typeof hash }) => ({
      hash: args.hash,
      chainId: 84532,
      blockHash: hash,
      blockNumber: 500n,
      ...(await rpc.getTransaction(args)),
    }),
    waitForTransactionReceipt: async (args: unknown) => {
      const r = await rpc.waitForTransactionReceipt(args);
      lastReceipt = {
        blockHash: hash,
        transactionIndex: 0,
        ...r,
        logs: r.logs.map((l: object, index: number) => ({
          blockHash: r.blockHash ?? hash,
          blockNumber: r.blockNumber,
          transactionHash: r.transactionHash,
          transactionIndex: 0,
          logIndex: index,
          removed: false,
          ...l,
        })),
      };
      return lastReceipt;
    },
  }),
  createWalletClient: () => wallet,
}));
vi.mock("../lib/config", async (original) => {
  const config = await original<typeof import("../lib/config")>();
  const { keccak256 } = await import("viem");
  return {
    ...config,
    deploymentConfig: {
      operator: "0x4444444444444444444444444444444444444444",
      block: 1n,
    },
    network: {
      ...config.network,
      escrowCodeHash: keccak256("0x02"),
      collectorCodeHash: keccak256("0x03"),
    },
  };
});
vi.mock("../lib/contracts.generated", async (original) => {
  const contracts =
    await original<typeof import("../lib/contracts.generated")>();
  const { keccak256 } = await import("viem");
  return { ...contracts, operatorRuntimeHash: keccak256("0x01") };
});
import { network } from "../lib/config";
import { chainGateway } from "../lib/chainGateway";

const terms = {
  buyer,
  reviewer,
  description: text,
  amount: 1_000_000n,
  fundingCutoff: 2000,
  expiry: 3000,
};
const expectedData = encodeFunctionData({
  abi: operatorAbi,
  functionName: "createOrder",
  args: [
    buyer,
    terms.amount,
    terms.fundingCutoff,
    terms.expiry,
    reviewer,
    descriptionHash(text),
  ],
});
const replacementHash = keccak256("0x1234");
let lastReceipt: TransactionReceipt;
let order = snapshot().order;
function creationLog(
  overrides: Partial<{
    seller: Address;
    buyer: Address;
    reviewer: Address;
    descriptionHash: typeof hash;
    paymentHash: typeof hash;
    payment: Payment;
  }> = {},
) {
  const a = {
    seller,
    buyer,
    reviewer,
    descriptionHash: descriptionHash(text),
    paymentHash: hash,
    payment: order.payment,
    ...overrides,
  };
  const event = getAbiItem({ abi: operatorAbi, name: "OrderCreated" });
  return {
    address: operator,
    topics: encodeEventTopics({
      abi: operatorAbi,
      eventName: "OrderCreated",
      args: { orderId: id, seller: a.seller, buyer: a.buyer },
    }),
    data: encodeAbiParameters(
      event.inputs.filter((input) => !input.indexed),
      [a.reviewer, a.descriptionHash, a.paymentHash, a.payment],
    ),
  };
}
const receipt = () =>
  ({
    status: "success",
    transactionHash: hash,
    blockNumber: 500n,
    logs: [creationLog()],
  }) as TransactionReceipt;
function replacement(
  reason: "replaced" | "repriced" | "cancelled",
  logs = receipt().logs,
) {
  rpc.waitForTransactionReceipt.mockImplementation(async ({ onReplaced }) => {
    onReplaced({ reason, transaction: { hash: replacementHash } });
    return { ...receipt(), logs, transactionHash: replacementHash };
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  order = snapshot().order;
  order.status = 1;
  rpc.getTransactionReceipt.mockImplementation(async () => lastReceipt);
  rpc.request.mockResolvedValue([]);
  rpc.getChainId.mockResolvedValue(84532);
  rpc.getCode.mockImplementation(async ({ address }) =>
    address === operator
      ? "0x01"
      : address === network.escrow
        ? "0x02"
        : "0x03",
  );
  rpc.getBlock.mockResolvedValue({
    number: 500n,
    timestamp: 1500n,
    hash,
    transactions: [hash, replacementHash],
  });
  rpc.getBlockNumber.mockResolvedValue(501n);
  rpc.getBalance.mockResolvedValue(1_000_000n);
  rpc.simulateContract.mockResolvedValue({});
  wallet.writeContract.mockResolvedValue(hash);
  rpc.waitForTransactionReceipt.mockImplementation(async () => receipt());
  rpc.getTransaction.mockResolvedValue({
    from: seller,
    to: operator,
    input: expectedData,
    value: 0n,
  });
  rpc.readContract.mockImplementation(async ({ functionName }) => {
    const values: Record<string, unknown> = {
      ESCROW: network.escrow,
      COLLECTOR: network.collector,
      USDC: network.usdc,
      CHAIN_ID: 84532n,
      authCaptureEscrow: network.escrow,
      getOrder: order,
      status: 1,
      getTokenStore: snapshot().tokenStore,
      getHash: hash,
      paymentState: [false, 0n, 0n],
      allowance: 0n,
      isPreApproved: false,
      balanceOf: 1_000_000n,
    };
    if (!(functionName in values))
      throw new Error(`Unexpected read: ${functionName}`);
    return values[functionName];
  });
});

describe("create-order chain confirmation", () => {
  it("confirms only the matching transaction, event and read-back terms", async () => {
    const states: TxState[] = [];
    await expect(
      chainGateway.create(terms, session(seller), (s) => states.push(s)),
    ).resolves.toBe(id);
    expect(states.at(-1)?.phase).toBe("confirmed");
    expect(rpc.waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ confirmations: 2 }),
    );
    expect(rpc.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "getOrder", blockNumber: 500n }),
    );
  });
  it("accepts a repriced transaction only when its intended call still matches", async () => {
    replacement("repriced");
    const update = vi.fn();
    await expect(
      chainGateway.create(terms, session(seller), update),
    ).resolves.toBe(id);
    expect(rpc.getTransaction).toHaveBeenCalledWith({ hash: replacementHash });
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "confirmed", hash: replacementHash }),
    );
  });
  it.each([
    ["EIP-7702 upgrade", { to: seller, input: "0x", type: "eip7702" }],
    ["different calldata", { input: "0x1234" }],
    ["different sender", { from: buyer }],
    ["different destination", { to: buyer }],
    ["nonzero value", { value: 1n }],
    ["contract creation", { to: null }],
  ])("rejects a successful replacement with %s", async (_name, changed) => {
    replacement("replaced", []);
    rpc.getTransaction.mockResolvedValue({
      from: seller,
      to: operator,
      input: expectedData,
      value: 0n,
      ...changed,
    });
    const update = vi.fn();
    await expect(
      chainGateway.create(terms, session(seller), update),
    ).rejects.toThrow(
      /different transaction|could not be verified|upgrade|identity/,
    );
    expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
      false,
    );
    expect(
      rpc.readContract.mock.calls.some(
        ([call]) => call.functionName === "getOrder",
      ),
    ).toBe(false);
  });
  it("rejects cancellation even if the returned call appears to match", async () => {
    replacement("cancelled");
    await expect(
      chainGateway.create(terms, session(seller), vi.fn()),
    ).rejects.toThrow("cancellation transaction");
  });
  it.each([
    "preApprovalExpiry",
    "authorizationExpiry",
    "refundExpiry",
    "maxAmount",
  ] as const)("does not confirm when read-back %s differs", async (field) => {
    const confirmed = receipt();
    if (field === "maxAmount") order.payment[field] += 1n;
    else order.payment[field] -= 1;
    // Keep structural payment invariants valid to reach the exact term comparison.
    if (field === "authorizationExpiry")
      order.payment.refundExpiry = order.payment.authorizationExpiry;
    if (field === "refundExpiry")
      order.payment.authorizationExpiry = order.payment.refundExpiry;
    rpc.waitForTransactionReceipt.mockResolvedValue(confirmed);
    const update = vi.fn();
    await expect(
      chainGateway.create(terms, session(seller), update),
    ).rejects.toThrow("terms do not match");
    expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
      false,
    );
  });
  it("does not confirm without an OrderCreated event from the configured operator", async () => {
    rpc.waitForTransactionReceipt.mockResolvedValue({
      ...receipt(),
      logs: [{ ...creationLog(), address: buyer }],
    });
    const update = vi.fn();
    await expect(
      chainGateway.create(terms, session(seller), update),
    ).rejects.toThrow("could not be verified");
    expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
      false,
    );
  });
  it("does not confirm or hide a failed order read", async () => {
    const originalRead = rpc.readContract.getMockImplementation()!;
    rpc.readContract.mockImplementation(async (call) => {
      if (call.functionName === "getOrder") throw new Error("RPC unavailable");
      return originalRead(call);
    });
    const update = vi.fn();
    await expect(
      chainGateway.create(terms, session(seller), update),
    ).rejects.toThrow("RPC unavailable");
    expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
      false,
    );
  });
});

describe("wallet-managed order execution", () => {
  const relay = () =>
    rpc.getTransaction.mockResolvedValue({
      from: buyer,
      to: reviewer,
      input: "0xcef6d209",
      value: 0n,
      type: "eip7702",
      authorizationList: [{ address: operator }],
    });
  it.each([false, true])(
    "accepts an exact inner order with a relayed receipt (replacement callback: %s)",
    async (replaced) => {
      relay();
      if (replaced) replacement("replaced");
      const update = vi.fn();
      await expect(
        chainGateway.create(terms, session(seller), update),
      ).resolves.toBe(id);
      expect(update).toHaveBeenLastCalledWith(
        expect.objectContaining({ phase: "confirmed" }),
      );
      expect(wallet.writeContract).toHaveBeenCalledTimes(1);
    },
  );
  it("supports an already-delegated account's relayed call without a new authorization", async () => {
    rpc.getTransaction.mockResolvedValue({
      from: buyer,
      to: reviewer,
      input: "0xcef6d209",
      value: 0n,
      type: "eip1559",
      authorizationList: [],
    });
    await expect(
      chainGateway.create(terms, session(seller), vi.fn()),
    ).resolves.toBe(id);
  });
  it("accepts a direct create call carried in type 4 without assuming delegation must be disabled", async () => {
    rpc.getTransaction.mockResolvedValue({
      from: seller,
      to: operator,
      input: expectedData,
      value: 0n,
      type: "eip7702",
      authorizationList: [{ address: reviewer }],
    });
    await expect(
      chainGateway.create(terms, session(seller), vi.fn()),
    ).resolves.toBe(id);
  });
  it("identifies a standalone delegation change without calling it order creation", async () => {
    rpc.getTransaction.mockResolvedValue({
      from: seller,
      to: seller,
      input: "0x",
      value: 0n,
      type: "eip7702",
      authorizationList: [{ address: operator }],
    });
    rpc.waitForTransactionReceipt.mockResolvedValue({ ...receipt(), logs: [] });
    const update = vi.fn();
    await expect(
      chainGateway.create(terms, session(seller), update),
    ).rejects.toThrow(/account upgrade|delegation change/);
    expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
      false,
    );
  });
  it.each([
    "seller",
    "buyer",
    "reviewer",
    "descriptionHash",
    "paymentHash",
  ] as const)(
    "rejects a relayed receipt with mismatched event %s",
    async (field) => {
      relay();
      const changed =
        field === "descriptionHash" || field === "paymentHash"
          ? replacementHash
          : operator;
      rpc.waitForTransactionReceipt.mockResolvedValue({
        ...receipt(),
        logs: [creationLog({ [field]: changed })],
      });
      const update = vi.fn();
      await expect(
        chainGateway.create(terms, session(seller), update),
      ).rejects.toThrow("terms do not match");
      expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
        false,
      );
    },
  );
  it.each([
    "maxAmount",
    "preApprovalExpiry",
    "authorizationExpiry",
    "refundExpiry",
    "minFeeBps",
    "maxFeeBps",
    "salt",
  ] as const)("rejects relayed event payment %s tampering", async (field) => {
    relay();
    const value = order.payment[field];
    const changed = typeof value === "bigint" ? value + 1n : value + 1;
    rpc.waitForTransactionReceipt.mockResolvedValue({
      ...receipt(),
      logs: [creationLog({ payment: { ...order.payment, [field]: changed } })],
    });
    const update = vi.fn();
    await expect(
      chainGateway.create(terms, session(seller), update),
    ).rejects.toThrow("terms do not match");
    expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
      false,
    );
  });
  it("rejects multiple exact creations in one receipt so duplicates require inspection", async () => {
    relay();
    rpc.waitForTransactionReceipt.mockResolvedValue({
      ...receipt(),
      logs: [creationLog(), creationLog()],
    });
    await expect(
      chainGateway.create(terms, session(seller), vi.fn()),
    ).rejects.toThrow("Multiple matching orders");
  });
  it.each([false, true])(
    "never confirms a failed transaction (relayed: %s)",
    async (relayed) => {
      if (relayed) relay();
      rpc.waitForTransactionReceipt.mockResolvedValue({
        ...receipt(),
        status: "reverted",
      });
      const update = vi.fn();
      await expect(
        chainGateway.create(terms, session(seller), update),
      ).rejects.toThrow("reverted");
      expect(rpc.getTransaction).toHaveBeenCalled();
      expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
        false,
      );
    },
  );
  it("does not accept creation events as proof of cancellation", async () => {
    relay();
    await expect(
      chainGateway.act("cancel", id, session(seller), vi.fn()),
    ).rejects.toThrow(
      /action events|creation|order terms|post-state|resulting order status/,
    );
  });
  it.each([false, true])(
    "uses ordinary wallet RPC without capabilities or authorization requests (namespace fallback: %s)",
    async (fallback) => {
      const actual = await vi.importActual<typeof import("viem")>("viem");
      const connected = session(seller);
      connected.provider.request = vi.fn(async ({ method }) => {
        if (method === "eth_accounts") return [seller];
        if (method === "eth_chainId") return "0x14a34";
        if (method === "eth_sendTransaction") {
          if (fallback) throw { code: -32602, message: "Invalid parameters" };
          return hash;
        }
        if (fallback && method === "wallet_sendTransaction") return hash;
        throw new Error(`Unexpected wallet RPC: ${method}`);
      });
      const realWallet = actual.createWalletClient({
        chain: (await import("../lib/config")).chain,
        account: seller,
        transport: actual.custom(connected.provider),
      });
      wallet.writeContract.mockImplementation(realWallet.writeContract);
      await expect(
        chainGateway.create(terms, connected, vi.fn()),
      ).resolves.toBe(id);
      const submitted = vi
        .mocked(connected.provider.request)
        .mock.calls.find(
          ([args]) => args.method === "eth_sendTransaction",
        )?.[0];
      expect(submitted).toEqual({
        method: "eth_sendTransaction",
        params: [{ from: seller, to: operator, data: expectedData }],
      });
      const sendMethods = vi
        .mocked(connected.provider.request)
        .mock.calls.map(([args]) => args.method)
        .filter((method) => method.endsWith("sendTransaction"));
      expect(sendMethods).toEqual(
        fallback
          ? ["eth_sendTransaction", "wallet_sendTransaction"]
          : ["eth_sendTransaction"],
      );
      expect(
        vi
          .mocked(connected.provider.request)
          .mock.calls.every(([args]) =>
            [
              "eth_accounts",
              "eth_chainId",
              "eth_sendTransaction",
              ...(fallback ? ["wallet_sendTransaction"] : []),
            ].includes(args.method),
          ),
      ).toBe(true);
    },
  );
});

describe("history gateway", () => {
  function rawCreation(block: number) {
    return {
      ...creationLog(),
      blockNumber: toHex(block),
      blockHash: hash,
      transactionHash: hash,
      transactionIndex: "0x0",
      logIndex: "0x0",
      removed: false,
    };
  }
  it.each([4, 5])(
    "reads current status %s even on an older creation page",
    async (status) => {
      order.status = status;
      const read = rpc.readContract.getMockImplementation()!;
      rpc.readContract.mockImplementation(async (call) =>
        call.functionName === "status"
          ? status
          : call.functionName === "paymentState"
            ? status === 4
              ? [true, 0n, 1000000n]
              : [false, 0n, 0n]
            : read(call),
      );
      rpc.request.mockResolvedValue([rawCreation(1)]);
      const result = await chainGateway.listOrders(buyer, 1n);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe(
        status === 4 ? "Paid to seller" : "Cancelled",
      );
      expect(result.next).toBeUndefined();
      expect(result.from).toBe(1n);
      expect(rpc.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "status", blockNumber: 500n }),
      );
    },
  );
  it("never advances a history cursor when current-state enrichment fails", async () => {
    rpc.request.mockResolvedValue([rawCreation(1)]);
    const read = rpc.readContract.getMockImplementation()!;
    rpc.readContract.mockImplementation(async (call) => {
      if (call.functionName === "getOrder") throw Error("state read failed");
      return read(call);
    });
    await expect(chainGateway.listOrders(buyer, 1n)).rejects.toThrow(
      "state read failed",
    );
  });
  it("returns empty older pages with explicit deployment-bound end and <=200 queries", async () => {
    const page = await chainGateway.activity(snapshot(), 400n);
    expect(page.items).toEqual([]);
    expect(page.next).toBeUndefined();
    expect(page.from).toBe(1n);
    const calls = rpc.request.mock.calls.map(([req]) => req.params[0]);
    expect(calls.map((f) => [BigInt(f.fromBlock), BigInt(f.toBlock)])).toEqual([
      [1n, 200n],
      [201n, 400n],
      [1n, 200n],
      [201n, 400n],
    ]);
  });
});
