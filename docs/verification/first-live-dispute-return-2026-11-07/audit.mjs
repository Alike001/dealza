import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import {
  createPublicClient,
  custom,
  erc20Abi,
  keccak256,
  toHex,
  encodeFunctionData,
  decodeEventLog,
  parseAbi,
  formatEther,
  decodeFunctionData,
  encodeEventTopics,
} from "viem";
import {
  operatorAbi,
  collectorAbi,
  escrowAbi,
  operatorRuntimeHash,
} from "../../../web/src/lib/contracts.generated.ts";
const urls = [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
];
const a = {
  operator: "0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  collector: "0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea",
  escrow: "0xf96815976523E00e65Be8f34cA5e64b4f41EB19c",
};
const id = "0xbcb5e97254ce461b35efa91372f2d104f0f71c71ab5abff4f374ec36df4397d0";
const allowed = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBalance",
  "eth_getCode",
  "eth_call",
  "eth_getTransactionCount",
  "eth_gasPrice",
  "eth_estimateGas",
  "eth_getLogs",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
]);
const methods = new Set();
function rpc(url, method, params = []) {
  if (!allowed.has(method)) throw Error("FORBIDDEN " + method);
  methods.add(method);
  return new Promise((resolve, reject) => {
    const p = spawn("curl", [
      "-4",
      "-fsS",
      "--retry",
      "2",
      "--max-time",
      "35",
      url,
      "-H",
      "Content-Type: application/json",
      "--data-binary",
      "@-",
    ]);
    let out = "",
      err = "";
    p.stdout.on("data", (x) => (out += x));
    p.stderr.on("data", (x) => (err += x));
    p.on("error", reject);
    p.on("close", (code) => {
      try {
        if (code) throw Error(err);
        const r = JSON.parse(out);
        if (r.error) throw Error(JSON.stringify(r.error));
        resolve(r.result);
      } catch (e) {
        reject(e);
      }
    });
    p.stdin.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
  });
}
const clients = urls.map((url) =>
  createPublicClient({
    transport: custom(
      { request: ({ method, params }) => rpc(url, method, params) },
      { retryCount: 1 },
    ),
  }),
);
const stable = (x) =>
  typeof x === "bigint"
    ? x.toString()
    : Array.isArray(x)
      ? x.map(stable)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, stable(x[k])]),
          )
        : x;
const json = (x) => JSON.stringify(stable(x), null, 2);

const output = process.argv[2];
if (!output) throw Error("Usage: node audit.mjs FRESH_OUTPUT_JSON");
const resolutionBlock = 55603005n;
const heads = await Promise.all(
  clients.map((c) => c.getBlockNumber({ cacheTime: 0 })),
);
const latest = (heads[0] < heads[1] ? heads[0] : heads[1]) - 2n;
const report = {
  mode: "READ_ONLY",
  at: new Date().toISOString(),
  id,
  addresses: a,
  heads,
  latest,
  resolutionBlock,
  rpcs: [],
};
const buyer = "0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25",
  seller = "0xF74aD341e10187073a0eef55356D136F1be5E3Cf",
  reviewer = "0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548";
function decode(log) {
  for (const abi of [operatorAbi, escrowAbi, collectorAbi, erc20Abi])
    try {
      return {
        address: log.address,
        ...decodeEventLog({ abi, data: log.data, topics: log.topics }),
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
      };
    } catch {}
  return {
    address: log.address,
    data: log.data,
    topics: log.topics,
    transactionHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
  };
}
await Promise.all(
  clients.map(async (c, i) => {
    const read = (blockNumber, address, abi, functionName, args = []) =>
      c.readContract({ address, abi, functionName, args, blockNumber });
    if ((await c.getChainId()) !== 84532) throw Error("Wrong network");
    async function snapshot(blockNumber) {
      const order = await read(
        blockNumber,
        a.operator,
        operatorAbi,
        "getOrder",
        [id],
      );
      const p = order.payment;
      const tokenStore = await read(
        blockNumber,
        a.escrow,
        escrowAbi,
        "getTokenStore",
        [a.operator],
      );
      const block = await c.getBlock({ blockNumber });
      const [derived, state, allowance, preApproved, paymentHash] =
        await Promise.all([
          read(blockNumber, a.operator, operatorAbi, "status", [id]),
          read(blockNumber, a.escrow, escrowAbi, "paymentState", [
            order.paymentHash,
          ]),
          read(blockNumber, a.usdc, erc20Abi, "allowance", [
            buyer,
            a.collector,
          ]),
          read(blockNumber, a.collector, collectorAbi, "isPreApproved", [
            order.paymentHash,
          ]),
          read(blockNumber, a.escrow, escrowAbi, "getHash", [p]),
        ]);
      const balances = {};
      await Promise.all(
        Object.entries({
          buyer,
          seller,
          reviewer,
          tokenStore,
          operator: a.operator,
        }).map(
          async ([role, address]) =>
            (balances[role] = await read(
              blockNumber,
              a.usdc,
              erc20Abi,
              "balanceOf",
              [address],
            )),
        ),
      );
      const buyerGas = await c.getBalance({ address: buyer, blockNumber });
      return {
        id,
        order,
        derived,
        collected: state[0],
        held: state[1],
        captured: state[2],
        allowance,
        preApproved,
        buyerBalance: balances.buyer,
        buyerGas,
        tokenStore,
        storeBalance: balances.tokenStore,
        chainTime: Number(block.timestamp),
        block: blockNumber,
        blockHash: block.hash,
        utc: new Date(Number(block.timestamp) * 1000).toISOString(),
        balances,
        paymentHash,
      };
    }
    const [before, after, current] = await Promise.all([
      snapshot(resolutionBlock - 1n),
      snapshot(resolutionBlock),
      snapshot(latest),
    ]);
    const logs = await c.getLogs({
      address: a.operator,
      fromBlock: resolutionBlock,
      toBlock: resolutionBlock,
    });
    const decisions = logs
      .map(decode)
      .filter(
        (l) =>
          l.eventName === "DisputeResolved" &&
          l.args.orderId.toLowerCase() === id,
      );
    if (decisions.length !== 1) throw Error("Expected exactly one resolution");
    const txHash = decisions[0].transactionHash;
    const [receipt, transaction, block] = await Promise.all([
      c.getTransactionReceipt({ hash: txHash }),
      c.getTransaction({ hash: txHash }),
      c.getBlock({ blockNumber: resolutionBlock }),
    ]);
    let decodedInput;
    try {
      decodedInput = decodeFunctionData({
        abi: operatorAbi,
        data: transaction.input,
      });
    } catch {
      decodedInput = {
        note: "Routed envelope; inspect exact operator events and effects",
      };
    }
    const canonical =
      receipt.status === "success" &&
      receipt.blockHash === block.hash &&
      transaction.blockHash === block.hash &&
      block.transactions.includes(txHash) &&
      receipt.blockNumber === resolutionBlock &&
      transaction.blockNumber === resolutionBlock &&
      heads[i] >= resolutionBlock + 1n;
    if (!canonical) throw Error("Non-canonical receipt");
    const decoded = receipt.logs.map(decode);
    const transfersInBlock = await c.getLogs({
      address: a.usdc,
      event: erc20Abi.find((x) => x.type === "event" && x.name === "Transfer"),
      fromBlock: resolutionBlock,
      toBlock: resolutionBlock,
    });
    const relevantTransfers = transfersInBlock.filter((l) =>
      [buyer, seller, before.tokenStore].some((addr) =>
        [l.args.from, l.args.to].some(
          (v) => v?.toLowerCase() === addr.toLowerCase(),
        ),
      ),
    );
    const simulations = [];
    for (const [name, account, functionName, args] of [
      [
        "reviewer return again",
        reviewer,
        "resolve",
        [id, false, decisions[0].args.decisionHash],
      ],
      [
        "reviewer release instead",
        reviewer,
        "resolve",
        [id, true, decisions[0].args.decisionHash],
      ],
      ["buyer release", buyer, "release", [id]],
      ["seller voluntary return again", seller, "cancel", [id]],
    ]) {
      const data = encodeFunctionData({ abi: operatorAbi, functionName, args });
      let rejected = false,
        error;
      try {
        await rpc(urls[i], "eth_call", [
          { from: account, to: a.operator, data, value: "0x0" },
          "0x" + latest.toString(16),
        ]);
      } catch (e) {
        rejected = true;
        error = String(e);
      }
      simulations.push({
        name,
        from: account,
        to: a.operator,
        data,
        blockNumber: latest,
        rejected,
        error,
      });
      if (!rejected)
        throw Error("Terminal action unexpectedly succeeded " + name);
    }
    const codeHashes = {};
    await Promise.all(
      ["operator", "escrow", "collector"].map(
        async (n) =>
          (codeHashes[n] = keccak256(
            await c.getCode({ address: a[n], blockNumber: latest }),
          )),
      ),
    );
    if (codeHashes.operator !== operatorRuntimeHash)
      throw Error("Runtime mismatch");
    const bindings = {};
    await Promise.all(
      ["ESCROW", "COLLECTOR", "USDC", "CHAIN_ID"].map(
        async (n) =>
          (bindings[n] = await read(latest, a.operator, operatorAbi, n)),
      ),
    );
    bindings.collectorEscrow = await read(
      latest,
      a.collector,
      collectorAbi,
      "authCaptureEscrow",
    );
    report.rpcs[i] = {
      url: urls[i],
      chainId: 84532,
      before,
      after,
      current,
      transactionHash: txHash,
      receipt,
      transaction,
      decodedInput,
      decoded,
      canonical,
      confirmations: heads[i] - resolutionBlock + 1n,
      blockHeader: {
        number: block.number,
        hash: block.hash,
        parentHash: block.parentHash,
        timestamp: block.timestamp,
        transactions: block.transactions,
      },
      relevantTransfersInBlock: relevantTransfers,
      simulations,
      codeHashes,
      bindings,
    };
    console.log("RPC audit complete", urls[i], txHash);
  }),
);
for (const key of [
  "before",
  "after",
  "current",
  "transactionHash",
  "receipt",
  "transaction",
  "decodedInput",
  "decoded",
  "blockHeader",
  "codeHashes",
  "bindings",
])
  if (json(report.rpcs[0][key]) !== json(report.rpcs[1][key]))
    throw Error("RPC disagreement " + key);
const r = report.rpcs[0];
const p = r.before.order.payment;
if (
  r.before.order.status !== 3 ||
  r.before.derived !== 3 ||
  r.before.held !== 1000000n ||
  r.before.captured !== 0n
)
  throw Error("Unexpected pre-resolution state");
for (const s of [r.after, r.current])
  if (
    s.order.status !== 5 ||
    s.derived !== 5 ||
    !s.collected ||
    s.held !== 0n ||
    s.captured !== 0n ||
    s.allowance !== 0n
  )
    throw Error("Unexpected terminal state");
if (
  json(r.before.order.payment) !== json(r.after.order.payment) ||
  json(r.before.order.payment) !== json(r.current.order.payment)
)
  throw Error("Changed terms");
if (
  r.after.balances.buyer - r.before.balances.buyer !== 1000000n ||
  r.after.balances.seller !== r.before.balances.seller ||
  r.before.balances.tokenStore - r.after.balances.tokenStore !== 1000000n
)
  throw Error("Wrong block deltas");
const transfer = r.decoded.filter(
  (l) =>
    l.eventName === "Transfer" &&
    l.address.toLowerCase() === a.usdc.toLowerCase(),
);
if (
  transfer.length !== 1 ||
  transfer[0].args.from.toLowerCase() !== r.before.tokenStore.toLowerCase() ||
  transfer[0].args.to.toLowerCase() !== buyer.toLowerCase() ||
  transfer[0].args.value !== 1000000n
)
  throw Error("Wrong USDC return");
const decision = r.decoded.filter((l) => l.eventName === "DisputeResolved");
if (decision.length !== 1 || decision[0].args.releaseToSeller !== false)
  throw Error("Wrong reviewer decision");
const voids = r.decoded.filter((l) => l.eventName === "OrderVoided");
if (
  voids.length !== 1 ||
  voids[0].args.authorizedBy.toLowerCase() !== reviewer.toLowerCase()
)
  throw Error("Wrong reviewer authorizer");
report.agreement = true;
report.rpcMethods = [...methods];
await writeFile(output, json(report) + "\n", { flag: "wx" });
console.log("DUAL RPC AUDIT PASS", r.transactionHash);
