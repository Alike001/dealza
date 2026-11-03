// Read-only RPC verification and ephemeral eth_simulateV1; no wallet or send methods.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  createPublicClient,
  http,
  erc20Abi,
  encodeFunctionData,
  parseAbi,
  decodeEventLog,
  keccak256,
  concat,
  toHex,
} from "viem";
import {
  operatorAbi,
  escrowAbi,
  collectorAbi,
} from "../src/lib/contracts.generated.ts";

const root = new URL("../../", import.meta.url);
const load = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const snapshot = await load(
  "docs/verification/checkout-continuation/snapshot.json",
);
const client = createPublicClient({
  transport: http(snapshot.rpcOrigin, { timeout: 30000 }),
});
const require = (ok, message) => {
  if (!ok) throw new Error(message);
};
const same = (a, b) =>
  JSON.stringify(a, (_, x) =>
    typeof x === "bigint" ? x.toString() : x,
  ).toLowerCase() ===
  JSON.stringify(b, (_, x) =>
    typeof x === "bigint" ? x.toString() : x,
  ).toLowerCase();
require((await client.getChainId()) === 84532, "Wrong chain");
require(snapshot.cancellation.confirmed &&
  snapshot.buyerPreparation.ready, "Refresh checkout verification first");
const block = BigInt(snapshot.block.number);
const header = await client.getBlock({ blockNumber: block });
const latest = await client.getBlock();
require(header.hash === snapshot.block.hash &&
  latest.timestamp - header.timestamp < 900n, "Stale/reorged snapshot");
const hash =
  "0x9a150e4934f63566722ce02cf20d7d2857fa774e63236eb312e8bcac237c46b2";
const receipt = await client.getTransactionReceipt({ hash });
const transaction = await client.getTransaction({ hash });
require(receipt.status === "success" &&
  receipt.blockNumber === 53847244n, "Cancellation receipt mismatch");
require((await client.getBlock({ blockNumber: receipt.blockNumber })).hash ===
  receipt.blockHash, "Cancellation reorg");
const events = receipt.logs
  .filter((log) => same(log.address, snapshot.operator))
  .map((log) => ({
    logIndex: log.logIndex,
    topics: log.topics,
    data: log.data,
    ...decodeEventLog({ abi: operatorAbi, ...log, strict: true }),
  }));
require(events.length === 1 &&
  events[0].eventName === "OrderVoided" &&
  same(events[0].args.orderId, snapshot.duplicate.id) &&
  same(
    events[0].args.authorizedBy,
    snapshot.seller,
  ), "Unexpected cancellation event");
const { buyer, usdc, collector, operator, escrow } = snapshot;
const amount = 1000000n;
const approval = snapshot.nextAction.transaction;
const encode = (abi, functionName, args) =>
  encodeFunctionData({ abi, functionName, args });
require(same(approval, {
  chainId: "0x14a34",
  from: buyer,
  to: usdc,
  value: "0x0",
  data: encode(erc20Abi, "approve", [collector, amount]),
}), "Wrong approval payload");
const direct = { from: buyer, to: usdc, value: "0x0", data: approval.data };
const directResult = await client.request({
  method: "eth_call",
  params: [direct, toHex(block)],
});
require(BigInt(directResult) === 1n, "Approval did not return true");
const gas = await client.request({
  method: "eth_estimateGas",
  params: [direct, toHex(block)],
});
const gasPrice = await client.getGasPrice();
require(BigInt(snapshot.balances.buyerEth) >
  BigInt(gas) * gasPrice, "Insufficient estimated gas funds");

// Verify actual state after simulated approval, including its genuine token event.
const reads = [
  [usdc, erc20Abi, "allowance", [buyer, collector], amount],
  [usdc, erc20Abi, "balanceOf", [buyer], BigInt(snapshot.balances.buyerUsdc)],
  [usdc, erc20Abi, "balanceOf", [snapshot.seller], null],
  [usdc, erc20Abi, "balanceOf", [snapshot.balances.tokenStore], 0n],
  [usdc, erc20Abi, "balanceOf", [operator], 0n],
];
reads[2][4] = await client.readContract({
  address: usdc,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [snapshot.seller],
  blockNumber: block,
});
for (const item of [snapshot.original, snapshot.duplicate]) {
  reads.push(
    [operator, operatorAbi, "getOrder", [item.id], item.order],
    [operator, operatorAbi, "status", [item.id], item.status],
    [escrow, escrowAbi, "paymentState", [item.paymentHash], [false, 0n, 0n]],
    [collector, collectorAbi, "isPreApproved", [item.paymentHash], false],
  );
}
const { decodeFunctionResult } = await import("viem");
async function simulate(label, call, stateOverrides) {
  const request = {
    blockStateCalls: [
      {
        ...(stateOverrides ? { stateOverrides } : {}),
        calls: [
          call,
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
    params: [request, toHex(block)],
  });
  const calls = result[0].calls;
  require(calls.length === reads.length + 1 &&
    calls.every((c) => c.status === "0x1"), `${label}: simulation reverted`);
  const logs = calls[0].logs;
  require(logs.length === 1 &&
    same(logs[0].address, usdc), `${label}: unexpected logs`);
  const event = decodeEventLog({ abi: erc20Abi, ...logs[0], strict: true });
  require(event.eventName === "Approval" &&
    same(event.args.owner, buyer) &&
    same(event.args.spender, collector) &&
    event.args.value === amount, `${label}: wrong Approval event`);
  const checks = reads.map(
    ([address, abi, functionName, args, expected], i) => {
      const actual = decodeFunctionResult({
        abi,
        functionName,
        data: calls[i + 1].returnData,
      });
      require(same(
        actual,
        expected,
      ), `${label}: post-approval ${functionName} mismatch`);
      return { address, functionName, args, actual, expected, passed: true };
    },
  );
  return { label, request, result, approvalEvent: event, checks, passed: true };
}
const directSimulation = await simulate("Direct buyer approval", direct);
const delegator = "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b";
const delegatorCode = await client.getCode({
  address: delegator,
  blockNumber: block,
});
require(keccak256(delegatorCode) ===
  "0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2", "Delegator runtime changed");
const executeAbi = parseAbi([
  "function execute(bytes32 mode, bytes executionCalldata) payable",
]);
const routed = {
  from: buyer,
  to: buyer,
  value: "0x0",
  data: encode(executeAbi, "execute", [
    toHex(0n, { size: 32 }),
    concat([usdc, toHex(0n, { size: 32 }), approval.data]),
  ]),
};
// This override exists only inside the RPC simulation. No authorization is signed,
// no delegation is installed, and no account/storage change persists.
const routedSimulation = await simulate(
  "Hypothetical MetaMask v1.3.0 delegated self execution",
  routed,
  { [buyer]: { code: concat(["0xef0100", delegator]) } },
);
require(((await client.getCode({ address: buyer, blockNumber: block })) ??
  "0x") === "0x", "Buyer account changed");
require((await client.readContract({
  address: usdc,
  abi: erc20Abi,
  functionName: "allowance",
  args: [buyer, collector],
  blockNumber: block,
})) === 0n, "Public allowance changed");
const output = {
  result: "GO_TRANSACTION_2_ONLY",
  snapshotBlock: snapshot.block,
  cancellation: {
    receipt,
    outerTransaction: transaction,
    operatorEvents: events,
  },
  approval,
  directCallReturn: directResult,
  estimatedGas: BigInt(gas),
  gasPriceWei: gasPrice,
  estimatedExecutionCostWei: BigInt(gas) * gasPrice,
  gasCaveat:
    "Execution estimate excludes possible Base L1 data fees; wallet must refresh total fees.",
  directSimulation,
  routedSimulation,
  limitations:
    "Hypothetical delegated self execution proves token behavior and buyer ownership, not MetaMask relayer/signature selection or authorization validity. Buyer currently has empty code. Do not approve an account upgrade/delegation change. An unknown route requires review.",
  signingPerformed: false,
  broadcastPerformed: false,
  delegationChanged: false,
};
const directory = new URL("docs/verification/buyer-approval/", root);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL("evidence.json", directory),
  JSON.stringify(
    output,
    (_, x) => (typeof x === "bigint" ? x.toString() : x),
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      result: output.result,
      block: snapshot.block,
      cancellationEvents: events,
      estimatedGas: output.estimatedGas,
      gasPriceWei: gasPrice,
      directSimulation: "PASS",
      hypotheticalDelegatedSimulation: "PASS",
      unsignedTransaction: approval,
    },
    (_, x) => (typeof x === "bigint" ? x.toString() : x),
    2,
  ),
);
