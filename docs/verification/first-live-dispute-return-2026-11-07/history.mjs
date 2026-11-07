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
  throw Error("Usage: node history.mjs AUDIT_JSON FRESH_OUTPUT_JSON");
const audit = JSON.parse(await readFile(input, "utf8"));
const latest = BigInt(audit.latest),
  fromBlock = 55548118n,
  ph = audit.rpcs[0].before.order.paymentHash;
const buyer = audit.rpcs[0].before.order.payment.payer;
const report = {
  at: new Date().toISOString(),
  mode: "READ_ONLY_FULL_ORDER_LIFETIME_SCAN",
  fromBlock,
  through: latest,
  id,
  paymentHash: ph,
  rpcs: [],
};
await Promise.all(
  clients.map(async (c, i) => {
    const filters = [
      {
        address: [a.operator, a.escrow, a.collector],
        topics: [null, [id, ph]],
      },
      {
        address: a.usdc,
        topics: [
          keccak256(toHex("Approval(address,address,uint256)")),
          "0x" + buyer.slice(2).toLowerCase().padStart(64, "0"),
          "0x" + a.collector.slice(2).toLowerCase().padStart(64, "0"),
        ],
      },
    ];
    const span = i === 0 ? 200n : 10000n,
      tasks = [];
    for (let from = fromBlock; from <= latest; from += span) {
      const to = from + span - 1n < latest ? from + span - 1n : latest;
      for (const filter of filters) tasks.push({ filter, from, to });
    }
    const logs = [];
    let next = 0,
      done = 0;
    await Promise.all(
      Array.from({ length: i === 0 ? 8 : 3 }, async () => {
        while (next < tasks.length) {
          const t = tasks[next++];
          const found = await rpc(urls[i], "eth_getLogs", [
            {
              ...t.filter,
              fromBlock: "0x" + t.from.toString(16),
              toBlock: "0x" + t.to.toString(16),
            },
          ]);
          logs.push(...found);
          done++;
          if (done % 100 === 0) console.log(urls[i], done, "/", tasks.length);
        }
      }),
    );
    logs.sort(
      (x, y) =>
        Number(BigInt(x.blockNumber) - BigInt(y.blockNumber)) ||
        Number(BigInt(x.logIndex) - BigInt(y.logIndex)),
    );
    const decoded = logs.map((l) => {
      for (const abi of [operatorAbi, escrowAbi, collectorAbi, erc20Abi])
        try {
          return {
            ...l,
            decoded: decodeEventLog({ abi, data: l.data, topics: l.topics }),
          };
        } catch {}
      throw Error("Unexpected undecodable matching event");
    });
    const hashes = [...new Set(logs.map((l) => l.transactionHash))],
      transactions = [];
    for (const hash of hashes) {
      const receipt = await c.getTransactionReceipt({ hash });
      const tx = await c.getTransaction({ hash });
      const block = await c.getBlock({ blockNumber: receipt.blockNumber });
      if (
        receipt.status !== "success" ||
        block.hash !== receipt.blockHash ||
        tx.blockHash !== block.hash ||
        !block.transactions.includes(hash)
      )
        throw Error("Noncanonical history");
      transactions.push({
        hash,
        blockNumber: receipt.blockNumber,
        blockHash: block.hash,
        timestamp: block.timestamp,
        utc: new Date(Number(block.timestamp) * 1000).toISOString(),
        from: tx.from,
        to: tx.to,
        events: receipt.logs.map((l) => {
          for (const abi of [operatorAbi, escrowAbi, collectorAbi, erc20Abi])
            try {
              return {
                address: l.address,
                ...decodeEventLog({ abi, data: l.data, topics: l.topics }),
                logIndex: l.logIndex,
              };
            } catch {}
          return {
            address: l.address,
            topics: l.topics,
            data: l.data,
            logIndex: l.logIndex,
          };
        }),
      });
    }
    report.rpcs[i] = {
      url: urls[i],
      rangeQueries: tasks.length,
      logs: decoded,
      transactions,
    };
    console.log(
      "History complete",
      urls[i],
      decoded.map((l) => l.decoded.eventName),
    );
  }),
);
const core = (r) =>
  r.logs.map((l) => ({
    address: l.address,
    topics: l.topics,
    data: l.data,
    blockHash: l.blockHash,
    blockNumber: l.blockNumber,
    transactionHash: l.transactionHash,
    logIndex: l.logIndex,
    decoded: l.decoded,
  }));
if (json(core(report.rpcs[0])) !== json(core(report.rpcs[1])))
  throw Error("Canonical history mismatch");
if (json(report.rpcs[0].transactions) !== json(report.rpcs[1].transactions))
  throw Error("History transaction mismatch");
const counts = {};
for (const l of report.rpcs[0].logs)
  counts[l.decoded.eventName] = (counts[l.decoded.eventName] ?? 0) + 1;
for (const n of [
  "OrderCreated",
  "OrderFunded",
  "PaymentAuthorized",
  "DisputeOpened",
  "DisputeResolved",
  "OrderVoided",
  "PaymentVoided",
])
  if (counts[n] !== 1) throw Error("Duplicate/missing event " + n);
for (const n of [
  "PaymentCaptured",
  "OrderReleased",
  "PaymentReclaimed",
  "RecoverySynced",
])
  if (counts[n]) throw Error("Unexpected settlement " + n);
report.agreement = true;
report.counts = counts;
report.rpcMethods = [...methods];
await writeFile(output, json(report) + "\n", { flag: "wx" });
console.log("DUAL HISTORY PASS", json(counts));
