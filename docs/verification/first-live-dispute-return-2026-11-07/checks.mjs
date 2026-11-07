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

import { readFile } from "node:fs/promises";
const input = process.argv[2],
  output = process.argv[3];
if (!input || !output)
  throw Error("Usage: node checks.mjs AUDIT_JSON FRESH_OUTPUT_JSON");
const audit = JSON.parse(await readFile(input, "utf8"));
const protocol = JSON.parse(
  await readFile(new URL("../base-sepolia.json", import.meta.url), "utf8"),
);
const r = audit.rpcs[0],
  current = r.current,
  invalidStateSelector = keccak256(toHex("InvalidState()")).slice(0, 10);
const checks = {
  rpcAgreement: audit.agreement,
  canonicalReceipts: audit.rpcs.every((x) => x.canonical),
  blockDeltasExact: false,
  immutableTerms:
    json(r.before.order.payment) === json(r.after.order.payment) &&
    json(r.before.order.payment) === json(r.current.order.payment),
  rpcs: [],
};
// Arithmetic uses decimal strings restored as BigInt, never floating token amounts.
checks.blockDeltasExact =
  BigInt(r.after.balances.buyer) - BigInt(r.before.balances.buyer) ===
    1000000n &&
  r.before.balances.seller === r.after.balances.seller &&
  BigInt(r.before.balances.tokenStore) - BigInt(r.after.balances.tokenStore) ===
    1000000n;
const decision = r.decoded.find((x) => x.eventName === "DisputeResolved");
const body = r.transaction.input.slice(2),
  selector = encodeFunctionData({
    abi: operatorAbi,
    functionName: "resolve",
    args: [id, false, decision.args.decisionHash],
  }).slice(2, 10);
const innerCalls = [];
let at = body.indexOf(selector);
while (at >= 0) {
  if (at % 2 === 0) {
    const data = "0x" + body.slice(at, at + 200);
    try {
      innerCalls.push({
        byteOffset: at / 2,
        data,
        ...decodeFunctionData({ abi: operatorAbi, data }),
      });
    } catch {}
  }
  at = body.indexOf(selector, at + 1);
}
console.log("Inner calls", json(innerCalls));
if (
  !innerCalls.length ||
  !innerCalls.every(
    (call) =>
      call.functionName === "resolve" &&
      call.args[0] === id &&
      call.args[1] === false &&
      call.args[2] === decision.args.decisionHash,
  )
)
  throw Error("Inner resolution calldata mismatch");
checks.innerResolutionCalls = innerCalls;
for (const [i, c] of clients.entries()) {
  const row = audit.rpcs[i];
  if (
    row.codeHashes.escrow !== protocol.escrow.runtime_keccak256 ||
    row.codeHashes.collector !== protocol.collector.runtime_keccak256 ||
    row.codeHashes.operator !== operatorRuntimeHash
  )
    throw Error("Pinned runtime mismatch");
  if (
    row.bindings.ESCROW !== a.escrow ||
    row.bindings.COLLECTOR !== a.collector ||
    row.bindings.USDC !== a.usdc ||
    row.bindings.CHAIN_ID !== "84532" ||
    row.bindings.collectorEscrow !== a.escrow
  )
    throw Error("Binding mismatch");
  if (
    row.current.balances.buyer !== "19000000" ||
    row.current.balances.seller !== "2000000" ||
    row.current.balances.tokenStore !== "0" ||
    row.current.allowance !== "0"
  )
    throw Error("Current balances/allowance differ");
  if (
    row.before.order.payment.payer !==
      "0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25" ||
    row.before.order.payment.receiver !==
      "0xF74aD341e10187073a0eef55356D136F1be5E3Cf" ||
    row.before.order.reviewer !== "0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548"
  )
    throw Error("Actor mismatch");
  if (row.relevantTransfersInBlock.length !== 1)
    throw Error("Other relevant USDC transfers in resolution block");
  if (
    !row.simulations.every(
      (s) => s.rejected && s.error.includes(invalidStateSelector),
    )
  )
    throw Error("Not all terminal calls reverted InvalidState");
  const decimals = await c.readContract({
    address: a.usdc,
    abi: erc20Abi,
    functionName: "decimals",
    blockNumber: BigInt(audit.latest),
  });
  if (decimals !== 6) throw Error("Wrong token decimals");
  const actorCodes = {};
  for (const [role, address] of Object.entries({
    buyer: current.order.payment.payer,
    seller: current.order.payment.receiver,
    reviewer: current.order.reviewer,
  }))
    actorCodes[role] =
      (await c.getCode({ address, blockNumber: BigInt(audit.latest) })) ?? "0x";
  const fundData = encodeFunctionData({
    abi: operatorAbi,
    functionName: "fund",
    args: [
      id,
      {
        ...current.order.payment,
        maxAmount: BigInt(current.order.payment.maxAmount),
        salt: BigInt(current.order.payment.salt),
      },
    ],
  });
  let replayError;
  try {
    await rpc(urls[i], "eth_call", [
      {
        from: current.order.payment.payer,
        to: a.operator,
        data: fundData,
        value: "0x0",
      },
      "0x" + BigInt(audit.latest).toString(16),
    ]);
  } catch (e) {
    replayError = String(e);
  }
  if (!replayError?.includes(invalidStateSelector))
    throw Error("Funding replay did not reject InvalidState");
  checks.rpcs.push({
    url: urls[i],
    decimals,
    actorCodes,
    invalidStateSelector,
    allSettlementSimulationsReject: true,
    fundReplay: { data: fundData, rejected: true, error: replayError },
    pinnedRuntimesAndBindingsMatch: true,
  });
}
checks.verdict = "PASS";
checks.rpcMethods = [...methods];
await writeFile(output, json(checks) + "\n", { flag: "wx" });
console.log(json(checks));
