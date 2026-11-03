// Public reads and ephemeral simulations only. No signer, wallet, or broadcast methods.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  createPublicClient,
  http,
  erc20Abi,
  encodeFunctionData,
  decodeFunctionResult,
  decodeEventLog,
  keccak256,
  toHex,
  concat,
  parseAbi,
  getAbiItem,
  toFunctionSignature,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import {
  operatorAbi,
  operatorRuntimeHash,
  collectorAbi,
  escrowAbi,
} from "../src/lib/contracts.generated.ts";
const root = new URL("../../", import.meta.url);
const load = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));
const prior = await load(
  "docs/verification/checkout-continuation/snapshot.json",
);
const protocol = await load("docs/verification/base-sepolia.json");
const deployment = await load("contracts/config/base-sepolia.deployment.json");
const { buyer, seller, operator, collector, escrow, usdc } = prior;
const stringify = (x) =>
  JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
const canonical = (x) =>
  Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, canonical(x[k])]),
        )
      : typeof x === "bigint"
        ? x.toString()
        : x;
const same = (a, b) =>
  stringify(canonical(a)).toLowerCase() ===
  stringify(canonical(b)).toLowerCase();
const check = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const client = createPublicClient({
  transport: http("https://base-sepolia-rpc.publicnode.com", {
    timeout: 30000,
    retryCount: 1,
  }),
});
const second = createPublicClient({
  transport: http("https://sepolia.base.org", {
    timeout: 30000,
    retryCount: 1,
  }),
});
check(
  (await client.getChainId()) === 84532 &&
    (await second.getChainId()) === 84532,
  "Wrong chain",
);
const header = await client.getBlock({
  blockNumber: (await client.getBlockNumber({ cacheTime: 0 })) - 2n,
});
const blockNumber = header.number;
const read = (address, abi, functionName, args = [], c = client) =>
  c.readContract({ address, abi, functionName, args, blockNumber });
const encode = (abi, functionName, args) =>
  encodeFunctionData({ abi, functionName, args });
const report = {
  queriedAt: new Date().toISOString(),
  chainId: 84532,
  block: {
    number: blockNumber,
    hash: header.hash,
    timestamp: header.timestamp,
    utc: new Date(Number(header.timestamp) * 1000).toISOString(),
  },
  checks: {},
  rpcOrigins: [
    "https://base-sepolia-rpc.publicnode.com",
    "https://sepolia.base.org",
  ],
};
for (const [address, expected] of [
  [operator, operatorRuntimeHash],
  [escrow, protocol.escrow.runtime_keccak256],
  [collector, protocol.collector.runtime_keccak256],
])
  check(
    keccak256(await client.getCode({ address, blockNumber })) === expected,
    "Runtime mismatch " + address,
  );
check(
  same(await read(operator, operatorAbi, "COLLECTOR"), collector) &&
    same(await read(operator, operatorAbi, "ESCROW"), escrow) &&
    same(await read(operator, operatorAbi, "USDC"), usdc) &&
    (await read(operator, operatorAbi, "CHAIN_ID")) === 84532n &&
    same(await read(collector, collectorAbi, "authCaptureEscrow"), escrow),
  "Binding mismatch",
);
report.checks.runtimesAndBindings = true;
const suppliedHash =
  "0x78cd5930a57b51edccb09a54c6c8e6edd8e85c6c78cf7549bb9d280a26ba70";
const suppliedBlock = 53865872n;
const receiptBlock = await client.getBlock({
  blockNumber: suppliedBlock,
  includeTransactions: true,
});
const matchingLogs = await client.getLogs({
  address: collector,
  fromBlock: suppliedBlock,
  toBlock: suppliedBlock,
  event: getAbiItem({ abi: collectorAbi, name: "PaymentPreApproved" }),
  args: { paymentInfoHash: prior.original.paymentHash },
});
check(
  matchingLogs.length === 1 && !matchingLogs[0].removed,
  "Expected unique preapproval event in supplied block",
);
const hash = matchingLogs[0].transactionHash;
check(
  receiptBlock.transactions.some((t) => t.hash === hash),
  "Receipt transaction not in supplied block",
);
const receipt = await client.getTransactionReceipt({ hash });
const transaction = await client.getTransaction({ hash });
check(
  receipt.status === "success" &&
    receipt.blockNumber === suppliedBlock &&
    receipt.blockNumber <= blockNumber,
  "Receipt failed/unconfirmed/wrong block",
);
check(receiptBlock.hash === receipt.blockHash, "Receipt not canonical");
const preApprovalEvents = receipt.logs
  .filter((l) => same(l.address, collector))
  .map((l) => ({
    ...decodeEventLog({ abi: collectorAbi, ...l, strict: true }),
    logIndex: l.logIndex,
  }));
check(
  preApprovalEvents.length === 1 &&
    preApprovalEvents[0].eventName === "PaymentPreApproved" &&
    same(preApprovalEvents[0].args.paymentInfoHash, prior.original.paymentHash),
  "Wrong preapproval event",
);
const transfers = receipt.logs.filter(
  (l) =>
    same(l.address, usdc) &&
    l.topics[0] === keccak256(toHex("Transfer(address,address,uint256)")),
);
check(transfers.length === 0, "Unexpected USDC transfer");
report.transaction3 = {
  suppliedHash,
  suppliedHashHexDigits: suppliedHash.length - 2,
  canonicalHash: hash,
  discovery:
    "Unique exact collector/exact payment-hash event in user-supplied block; canonical block transaction list independently read",
  receiptBlock,
  receipt,
  outerTransaction: transaction,
  preApprovalEvents,
  confirmations: blockNumber - receipt.blockNumber + 1n,
  noUsdcTransfers: true,
};
for (const label of ["original", "duplicate"]) {
  const old = prior[label],
    order = await read(operator, operatorAbi, "getOrder", [old.id]);
  check(same(order, old.order), label + " stored order changed");
  const status = await read(operator, operatorAbi, "status", [old.id]);
  const paymentState = await read(escrow, escrowAbi, "paymentState", [
    order.paymentHash,
  ]);
  const preApproved = await read(collector, collectorAbi, "isPreApproved", [
    order.paymentHash,
  ]);
  check(
    status === (label === "original" ? 1 : 5) &&
      same(paymentState, [false, 0n, 0n]) &&
      preApproved === (label === "original"),
    label + " state mismatch",
  );
  check(
    (await read(escrow, escrowAbi, "getHash", [order.payment])) ===
      order.paymentHash,
    "Payment hash mismatch",
  );
  report[label] = {
    id: old.id,
    order,
    status,
    paymentState,
    preApproved,
    unchanged: true,
  };
}
const p = report.original.order.payment;
check(
  p.preApprovalExpiry === 1793725200 &&
    BigInt(p.preApprovalExpiry) > header.timestamp,
  "Deadline expired/changed",
);
report.reservationDeadline = {
  unix: p.preApprovalExpiry,
  utc: new Date(p.preApprovalExpiry * 1000).toISOString(),
  secondsRemaining: BigInt(p.preApprovalExpiry) - header.timestamp,
};
const tokenStore = await read(escrow, escrowAbi, "getTokenStore", [operator]);
const allowance = await read(usdc, erc20Abi, "allowance", [buyer, collector]);
const buyerEth = await client.getBalance({ address: buyer, blockNumber });
const balances = {
  buyerEth,
  buyerUsdc: await read(usdc, erc20Abi, "balanceOf", [buyer]),
  sellerUsdc: await read(usdc, erc20Abi, "balanceOf", [seller]),
  tokenStore,
  tokenStoreUsdc: await read(usdc, erc20Abi, "balanceOf", [tokenStore]),
  operatorUsdc: await read(usdc, erc20Abi, "balanceOf", [operator]),
  allowance,
};
check(
  allowance === 1000000n &&
    balances.buyerUsdc === 21000000n &&
    balances.tokenStoreUsdc === 0n &&
    balances.operatorUsdc === 0n,
  "Unexpected balances/allowance",
);
report.balances = balances;
report.buyerAccount = {
  code: (await client.getCode({ address: buyer, blockNumber })) ?? "0x",
  nonce: await client.getTransactionCount({ address: buyer, blockNumber }),
  pendingNonce: await client.getTransactionCount({
    address: buyer,
    blockTag: "pending",
  }),
};
check(
  report.buyerAccount.nonce === report.buyerAccount.pendingNonce,
  "Pending buyer transaction",
);
const history = [];
for (
  let from = BigInt(deployment.deploymentBlock);
  from <= blockNumber;
  from += 10000n
) {
  const to = from + 9999n < blockNumber ? from + 9999n : blockNumber;
  const results = await Promise.all(
    [
      [operator, operatorAbi, [prior.original.id, prior.duplicate.id]],
      [
        escrow,
        escrowAbi,
        [prior.original.paymentHash, prior.duplicate.paymentHash],
      ],
      [
        collector,
        collectorAbi,
        [prior.original.paymentHash, prior.duplicate.paymentHash],
      ],
    ].map(async ([address, abi, ids]) => {
      const logs = await client.request({
        method: "eth_getLogs",
        params: [
          {
            address,
            fromBlock: toHex(from),
            toBlock: toHex(to),
            topics: [null, ids],
          },
        ],
      });
      return logs.map((l) => {
        check(!l.removed, "Removed log");
        return {
          address,
          blockNumber: l.blockNumber,
          transactionHash: l.transactionHash,
          ...decodeEventLog({ abi, ...l, strict: true }),
        };
      });
    }),
  );
  history.push(...results.flat());
}
check(
  history.length === 4 &&
    history.filter((l) => l.eventName === "OrderCreated").length === 2 &&
    history.filter(
      (l) =>
        l.eventName === "OrderVoided" && l.args.orderId === prior.duplicate.id,
    ).length === 1 &&
    history.filter(
      (l) =>
        l.eventName === "PaymentPreApproved" &&
        l.transactionHash === hash &&
        same(l.args.paymentInfoHash, prior.original.paymentHash),
    ).length === 1,
  "Unexpected order/payment history",
);
report.history = {
  fromBlock: deployment.deploymentBlock,
  toBlock: blockNumber,
  complete: true,
  events: history,
};
check(
  (await second.getBlock({ blockNumber })).hash === header.hash,
  "RPC block mismatch",
);
const otherReceipt = await second.getTransactionReceipt({ hash });
check(
  same(otherReceipt.logs, receipt.logs) &&
    otherReceipt.status === "success" &&
    otherReceipt.blockHash === receipt.blockHash,
  "RPC receipt mismatch",
);
for (const label of ["original", "duplicate"]) {
  const item = report[label];
  check(
    same(
      await read(operator, operatorAbi, "getOrder", [item.id], second),
      item.order,
    ) &&
      same(
        await read(
          escrow,
          escrowAbi,
          "paymentState",
          [item.order.paymentHash],
          second,
        ),
        item.paymentState,
      ) &&
      (await read(
        collector,
        collectorAbi,
        "isPreApproved",
        [item.order.paymentHash],
        second,
      )) ===
        (label === "original"),
    "RPC state mismatch",
  );
}
check(
  (await read(usdc, erc20Abi, "allowance", [buyer, collector], second)) ===
    allowance &&
    (await second.getBalance({ address: buyer, blockNumber })) === buyerEth &&
    (await read(usdc, erc20Abi, "balanceOf", [buyer], second)) ===
      balances.buyerUsdc,
  "RPC buyer mismatch",
);
report.checks.independentRpc =
  "Receipt/logs, canonical block, both stored orders/CPP/preapproval states, allowance, buyer ETH/USDC PASS";
console.error(
  "PASS: receipt, current state, complete history and independent RPC agreement",
);
const fn = getAbiItem({ abi: operatorAbi, name: "fund" });
const authorize = getAbiItem({ abi: escrowAbi, name: "authorize" });
const artifact = await load(
  "contracts/out/DealzaOperator.sol/DealzaOperator.json",
);
const cppArtifact = await load(
  "contracts/out/AuthCaptureEscrow.sol/AuthCaptureEscrow.json",
);
check(
  same(getAbiItem({ abi: artifact.abi, name: "fund" }), fn),
  "Operator compiled ABI mismatch",
);
check(
  same(getAbiItem({ abi: cppArtifact.abi, name: "authorize" }), authorize),
  "CPP compiled ABI mismatch",
);
const typeHash = keccak256(
  toHex(
    "PaymentInfo(address operator,address payer,address receiver,address token,uint120 maxAmount,uint48 preApprovalExpiry,uint48 authorizationExpiry,uint48 refundExpiry,uint16 minFeeBps,uint16 maxFeeBps,address feeReceiver,uint256 salt)",
  ),
);
const structHash = keccak256(
  encodeAbiParameters([{ type: "bytes32" }, fn.inputs[1]], [typeHash, p]),
);
const computedHash = keccak256(
  encodeAbiParameters(parseAbiParameters("uint256,address,bytes32"), [
    84532n,
    escrow,
    structHash,
  ]),
);
check(
  computedHash === report.original.order.paymentHash,
  "Independent local CPP payment hash mismatch",
);
report.abi = {
  version: "v1.1.0",
  commit: protocol.protocol_commit,
  signature: toFunctionSignature(fn),
  function: fn,
  internalAuthorizeSignature: toFunctionSignature(authorize),
  internalAuthorizeFunction: authorize,
  internalAuthorizeArguments: [p, p.maxAmount, collector, "0x"],
  internalAuthorizeCalldata: encode(escrowAbi, "authorize", [
    p,
    p.maxAmount,
    collector,
    "0x",
  ]),
  computedPaymentHash: computedHash,
  typeHash,
  structHash,
  sources: [
    "https://github.com/base/commerce-payments/blob/v1.1.0/src/AuthCaptureEscrow.sol",
    "https://github.com/base/commerce-payments/blob/v1.1.0/src/collectors/PreApprovalPaymentCollector.sol",
  ],
};
const call = {
  account: buyer,
  address: operator,
  abi: operatorAbi,
  functionName: "fund",
  args: [report.original.id, p],
  blockNumber,
};
await client.simulateContract(call);
await second.simulateContract(call);
console.error(
  "PASS: independent CPP hash, exact ABI and direct eth_call on both RPCs",
);
const gas = await client.estimateContractGas(call),
  gasPrice = await client.getGasPrice();
check(buyerEth > gas * gasPrice, "Insufficient estimated execution gas");
const tx = {
  chainId: "0x14a34",
  from: buyer,
  to: operator,
  value: "0x0",
  data: encode(operatorAbi, "fund", [report.original.id, p]),
};
report.preparedTransaction = {
  transaction: tx,
  function: fn.name,
  signature: toFunctionSignature(fn),
  arguments: [report.original.id, p],
  paymentHash: computedHash,
  token: usdc,
  amountRaw: p.maxAmount,
  custodyDestination: tokenStore,
  estimatedGas: gas,
  gasPriceWei: gasPrice,
  estimatedExecutionCostWei: gas * gasPrice,
  gasCaveat:
    "Refresh MetaMask gas and total fee including Base L1 data fee. Routed envelope gas can differ. No fixed gas or nonce is prescribed.",
};
const reads = [
  [
    collector,
    collectorAbi,
    "isPreApproved",
    [report.original.order.paymentHash],
    true,
  ],
  [usdc, erc20Abi, "allowance", [buyer, collector], 0n],
];
for (const [address, expected] of [
  [buyer, balances.buyerUsdc - 1000000n],
  [seller, balances.sellerUsdc],
  [tokenStore, 1000000n],
  [operator, 0n],
])
  reads.push([usdc, erc20Abi, "balanceOf", [address], expected]);
for (const label of ["original", "duplicate"]) {
  const item = report[label];
  reads.push(
    [
      operator,
      operatorAbi,
      "getOrder",
      [item.id],
      label === "original" ? { ...item.order, status: 2 } : item.order,
    ],
    [
      operator,
      operatorAbi,
      "status",
      [item.id],
      label === "original" ? 2 : item.status,
    ],
    [
      escrow,
      escrowAbi,
      "paymentState",
      [item.order.paymentHash],
      label === "original" ? [true, 1000000n, 0n] : [false, 0n, 0n],
    ],
  );
}
reads.push([
  collector,
  collectorAbi,
  "isPreApproved",
  [report.duplicate.order.paymentHash],
  false,
]);
async function simulate(label, first) {
  const request = {
    blockStateCalls: [
      {
        calls: [
          first,
          ...reads.map(([to, abi, functionName, args]) => ({
            from: buyer,
            to,
            data: encode(abi, functionName, args),
          })),
        ],
      },
    ],
    validation: false,
  };
  const result = await client.request({
    method: "eth_simulateV1",
    params: [request, toHex(blockNumber)],
  });
  const calls = result[0].calls;
  check(
    calls.length === reads.length + 1 && calls.every((c) => c.status === "0x1"),
    label + " reverted",
  );
  const events = calls[0].logs.map((l) => {
    const abi = same(l.address, usdc)
      ? erc20Abi
      : same(l.address, operator)
        ? operatorAbi
        : same(l.address, escrow)
          ? escrowAbi
          : collectorAbi;
    return {
      address: l.address,
      ...decodeEventLog({ abi, ...l, strict: true }),
    };
  });
  const transfers = events.filter(
    (e) => same(e.address, usdc) && e.eventName === "Transfer",
  );
  check(
    transfers.length === 1 &&
      same(transfers[0].args.from, buyer) &&
      same(transfers[0].args.to, tokenStore) &&
      transfers[0].args.value === 1000000n,
    label + " wrong custody transfer",
  );
  const authorized = events.filter(
    (e) => same(e.address, escrow) && e.eventName === "PaymentAuthorized",
  );
  check(
    authorized.length === 1 &&
      same(
        authorized[0].args.paymentInfoHash,
        report.original.order.paymentHash,
      ) &&
      same(authorized[0].args.paymentInfo, p) &&
      authorized[0].args.amount === 1000000n &&
      same(authorized[0].args.tokenCollector, collector),
    label + " wrong authorization",
  );
  const funded = events.filter(
    (e) => same(e.address, operator) && e.eventName === "OrderFunded",
  );
  check(
    funded.length === 1 &&
      funded[0].args.orderId === report.original.id &&
      funded[0].args.paymentHash === report.original.order.paymentHash,
    label + " wrong funded event",
  );
  check(
    events.every(
      (e) =>
        e.eventName === "PaymentAuthorized" ||
        e.eventName === "OrderFunded" ||
        e.eventName === "Transfer" ||
        e.eventName === "Approval",
    ),
    label + " unexpected lifecycle event",
  );
  const checks = reads.map(
    ([address, abi, functionName, args, expected], i) => {
      const actual = decodeFunctionResult({
        abi,
        functionName,
        data: calls[i + 1].returnData,
      });
      check(same(actual, expected), label + " poststate " + functionName);
      return { address, functionName, args, actual, expected, passed: true };
    },
  );
  return { label, request, result, events, checks, passed: true };
}
const { chainId, ...direct } = tx;
report.directSimulation = await simulate(
  "Actual current buyer account direct operator fund call",
  direct,
);
console.error("PASS: direct reservation custody and all post-state invariants");
const delegator = "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b";
check(
  keccak256(await client.getCode({ address: delegator, blockNumber })) ===
    "0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2",
  "Delegator changed",
);
const executeAbi = parseAbi([
  "function execute(bytes32 mode, bytes executionCalldata) payable",
]);
const routed = {
  from: buyer,
  to: buyer,
  value: "0x0",
  data: encode(executeAbi, "execute", [
    toHex(0n, { size: 32 }),
    concat([operator, toHex(0n, { size: 32 }), tx.data]),
  ]),
};
check(
  same(report.buyerAccount.code, concat(["0xef0100", delegator])),
  "Buyer delegation differs from reviewed implementation",
);
report.routedSimulation = await simulate(
  "Actual current MetaMask v1.3.0 delegated buyer self-execution; no overrides",
  routed,
);
report.preparedTransaction.routedSelfExecutionTransaction = {
  chainId: tx.chainId,
  ...routed,
};
report.preparedTransaction.routedSelfExecutionGas = BigInt(
  await client.request({
    method: "eth_estimateGas",
    params: [routed, toHex(blockNumber)],
  }),
);
check(
  buyerEth > report.preparedTransaction.routedSelfExecutionGas * gasPrice,
  "Insufficient routed execution gas",
);
report.routingLimitations =
  "No state, balance, code overrides or new authorization list used. Actual current buyer delegation is used. Direct and self-execution paths prove exact buyer identity, 1 USDC custody transfer, PaymentAuthorized, OrderFunded and all post-state invariants. Unknown future relayer/signature envelopes, extra calls and delegation changes are not validated. Require exact inner fund call and independently verify the mined outcome before any retry.";
check(
  (await read(collector, collectorAbi, "isPreApproved", [computedHash])) ===
    true &&
    same(await read(escrow, escrowAbi, "paymentState", [computedHash]), [
      false,
      0n,
      0n,
    ]) &&
    (await read(usdc, erc20Abi, "allowance", [buyer, collector])) ===
      1000000n &&
    (await read(operator, operatorAbi, "status", [report.original.id])) === 1,
  "Persistent state unexpectedly changed",
);
check(
  (await client.getBlock({ blockNumber })).hash === header.hash,
  "Snapshot reorg",
);
report.result = "GO_TRANSACTION_4_ONLY";
report.signingPerformed = false;
report.broadcastPerformed = false;
const directory = new URL("docs/verification/buyer-reservation/", root);
await mkdir(directory, { recursive: true });
await writeFile(new URL("evidence.json", directory), stringify(report) + "\n");
await writeFile(
  new URL("next-manual-transaction.json", directory),
  stringify(report.preparedTransaction) + "\n",
);
console.log(
  stringify({
    result: report.result,
    block: report.block,
    transaction3: {
      type: transaction.type,
      from: transaction.from,
      to: transaction.to,
      confirmations: report.transaction3.confirmations,
      events: preApprovalEvents,
    },
    balances,
    buyerAccount: report.buyerAccount,
    reservationDeadline: report.reservationDeadline,
    preparedTransaction: report.preparedTransaction,
    directSimulation: "PASS",
    routedSimulation: "PASS",
    history: report.history,
    abi: report.abi,
  }),
);
