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
const same = (a, b) =>
  stringify(a).toLowerCase() === stringify(b).toLowerCase();
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
  transport: http("https://base-sepolia.drpc.org", {
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
const hash =
  "0x3095767bde9c695c83daf53c7fc78965559d69496ee2435612b1a873b84c782e";
const receipt = await client.getTransactionReceipt({ hash });
const transaction = await client.getTransaction({ hash });
check(
  receipt.status === "success" && receipt.blockNumber <= blockNumber,
  "Receipt failed/unconfirmed",
);
check(
  (await client.getBlock({ blockNumber: receipt.blockNumber })).hash ===
    receipt.blockHash,
  "Receipt not canonical",
);
const approvalEvents = receipt.logs
  .filter(
    (l) =>
      same(l.address, usdc) &&
      l.topics[0] === keccak256(toHex("Approval(address,address,uint256)")),
  )
  .map((l) => ({
    ...decodeEventLog({ abi: erc20Abi, ...l, strict: true }),
    logIndex: l.logIndex,
  }));
check(
  approvalEvents.length === 1 &&
    approvalEvents[0].eventName === "Approval" &&
    same(approvalEvents[0].args.owner, buyer) &&
    same(approvalEvents[0].args.spender, collector) &&
    approvalEvents[0].args.value === 1000000n,
  "Wrong Approval",
);
const transfers = receipt.logs.filter(
  (l) =>
    same(l.address, usdc) &&
    l.topics[0] === keccak256(toHex("Transfer(address,address,uint256)")),
);
check(transfers.length === 0, "Unexpected USDC transfer");
report.transaction2 = {
  receipt,
  outerTransaction: transaction,
  approvalEvents,
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
      !preApproved,
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
  history.length === 3 &&
    history.filter((l) => l.eventName === "OrderCreated").length === 2 &&
    history.filter(
      (l) =>
        l.eventName === "OrderVoided" && l.args.orderId === prior.duplicate.id,
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
      )) === false,
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
const fn = getAbiItem({ abi: collectorAbi, name: "preApprove" });
check(
  !operatorAbi.some((x) => x.type === "function" && /preapprove/i.test(x.name)),
  "Unexpected operator ABI",
);
report.abi = {
  source:
    "contracts/vendor/commerce-payments/src/collectors/PreApprovalPaymentCollector.sol",
  operatorSource: "contracts/src/DealzaOperator.sol",
  signature: toFunctionSignature(fn),
  function: fn,
  operatorHasPreApprovalFunction: false,
};
const artifact = await load(
  "contracts/out/PreApprovalPaymentCollector.sol/PreApprovalPaymentCollector.json",
);
check(
  same(getAbiItem({ abi: artifact.abi, name: "preApprove" }), fn),
  "Compiled collector ABI mismatch",
);
const call = {
  account: buyer,
  address: collector,
  abi: collectorAbi,
  functionName: "preApprove",
  args: [p],
  blockNumber,
};
await client.simulateContract(call);
const gas = await client.estimateContractGas(call),
  gasPrice = await client.getGasPrice();
check(buyerEth > gas * gasPrice, "Insufficient estimated execution gas");
const tx = {
  chainId: "0x14a34",
  from: buyer,
  to: collector,
  value: "0x0",
  data: encode(collectorAbi, "preApprove", [p]),
};
report.preparedTransaction = {
  transaction: tx,
  function: fn.name,
  arguments: [p],
  estimatedGas: gas,
  gasPriceWei: gasPrice,
  estimatedExecutionCostWei: gas * gasPrice,
  gasCaveat:
    "Refresh MetaMask gas and total fee including Base L1 data fee. Routed envelope gas can differ.",
};
const reads = [
  [
    collector,
    collectorAbi,
    "isPreApproved",
    [report.original.order.paymentHash],
    true,
  ],
  [usdc, erc20Abi, "allowance", [buyer, collector], 1000000n],
];
for (const [address, expected] of [
  [buyer, balances.buyerUsdc],
  [seller, balances.sellerUsdc],
  [tokenStore, 0n],
  [operator, 0n],
])
  reads.push([usdc, erc20Abi, "balanceOf", [address], expected]);
for (const label of ["original", "duplicate"]) {
  const item = report[label];
  reads.push(
    [operator, operatorAbi, "getOrder", [item.id], item.order],
    [operator, operatorAbi, "status", [item.id], item.status],
    [
      escrow,
      escrowAbi,
      "paymentState",
      [item.order.paymentHash],
      [false, 0n, 0n],
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
async function simulate(label, first, stateOverrides) {
  const request = {
    blockStateCalls: [
      {
        ...(stateOverrides ? { stateOverrides } : {}),
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
  check(
    calls[0].logs.length === 1 && same(calls[0].logs[0].address, collector),
    label + " unexpected events",
  );
  const event = decodeEventLog({
    abi: collectorAbi,
    ...calls[0].logs[0],
    strict: true,
  });
  check(
    event.eventName === "PaymentPreApproved" &&
      same(event.args.paymentInfoHash, report.original.order.paymentHash),
    label + " wrong event",
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
  return { label, request, result, event, checks, passed: true };
}
const { chainId, ...direct } = tx;
report.directSimulation = await simulate(
  "Actual current buyer account direct collector call",
  direct,
);
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
    concat([collector, toHex(0n, { size: 32 }), tx.data]),
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
report.preparedTransaction.routedSelfExecutionGas = BigInt(
  await client.request({
    method: "eth_estimateGas",
    params: [routed, toHex(blockNumber)],
  }),
);
report.routingLimitations =
  "No state or code overrides used; actual current delegation proves payer identity, exact event and post-state under direct collector and delegated self-execution paths. Does not validate an unknown relayer/signature envelope, account upgrade consent, or wallet-local requests. A successful outer receipt alone is insufficient. Require actual collector PaymentPreApproved for exact hash plus isPreApproved=true and unchanged unfunded order, balances and allowance after manual execution.";
check(
  (await read(collector, collectorAbi, "isPreApproved", [
    report.original.order.paymentHash,
  ])) === false,
  "Persistent state unexpectedly changed",
);
check(
  (await client.getBlock({ blockNumber })).hash === header.hash,
  "Snapshot reorg",
);
report.result = "GO_TRANSACTION_3_ONLY";
report.signingPerformed = false;
report.broadcastPerformed = false;
const directory = new URL("docs/verification/buyer-preapproval/", root);
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
    transaction2: {
      type: transaction.type,
      from: transaction.from,
      to: transaction.to,
      confirmations: report.transaction2.confirmations,
      events: approvalEvents,
    },
    balances,
    buyerAccount: report.buyerAccount,
    reservationDeadline: report.reservationDeadline,
    preparedTransaction: report.preparedTransaction,
    directSimulation: "PASS",
    routedSimulation: "PASS",
    history: report.history,
  }),
);
