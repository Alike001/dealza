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

const cases = [
  {
    name: "paid",
    id: "0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd",
    description:
      "Dealza Checkpoint 6: fresh UI-only 1 test-USDC checkout; controlled test, no physical delivery.",
    hashes: [
      "0x057a937ac93132743a53276eefcd7023d3ae72210410fbcee6dc6fdf4fb84567",
      "0x7807edd5f7838a287a8723268b0f5b3aba7d7e87a44a87a032ccb6359b7b7133",
      "0x3bdd6c65eea5c193abc0dce78b0a92314d459f9cfb38615469977977652ee62c",
      "0xcb162300071bc1ae68e081045050fd50d495de93d7651dfc45fe291b4912802b",
      "0x2dec3e64944f1bc6db00051079e8f86edf671d454de99977cdacf3a8b081e0c0",
      "0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023",
    ],
    expected: 4,
  },
  {
    name: "returned",
    id: "0xbcb5e97254ce461b35efa91372f2d104f0f71c71ab5abff4f374ec36df4397d0",
    description:
      "Dealza Checkpoint 8: buyer dispute and reviewer return; controlled test, no physical delivery.",
    hashes: [
      "0xfa9c7845e4d5da67b9da3f82ef82c964f681c121e398fb2eb497564e08fba390",
      "0x3f9e2f6a633c1d878f4542ee542df298cb117087e7c2b2bb16d1da22d170c664",
      "0xef703b1a8350e4d66b9d9ff3c7f34776f38af746f0617b1836aa365b4412259c",
      "0x4e3ffff0a2e567effebeb1e6f11c17f19bda00fce9d70e7724efab006df4e9df",
      "0xf1bddacd50bf6cd0cb226fb97ccdd09117750d2a300698472b68e683c26515a6",
      "0x3724fb79fef257a8dd5e2168b097755232d5299d90913591bb81d1049fc4e304",
    ],
    expected: 5,
  },
];

const heads = await Promise.all(
  clients.map((c) => c.getBlockNumber({ cacheTime: 0 })),
);
const blockNumber = (heads[0] < heads[1] ? heads[0] : heads[1]) - 2n;
const report = {
  at: new Date().toISOString(),
  mode: "READ_ONLY_CURRENT_STATE_AND_GENUINE_RECEIPTS",
  heads,
  blockNumber,
  rpcs: [],
};
await Promise.all(
  clients.map(async (c, i) => {
    if ((await c.getChainId()) !== 84532) throw Error("Wrong network");
    const block = await c.getBlock({ blockNumber }),
      read = (address, abi, functionName, args = []) =>
        c.readContract({ address, abi, functionName, args, blockNumber });
    const codeHashes = {};
    for (const key of ["operator", "collector", "escrow"])
      codeHashes[key] = keccak256(
        await c.getCode({ address: a[key], blockNumber }),
      );
    if (codeHashes.operator !== operatorRuntimeHash)
      throw Error("Wrong operator runtime");
    const journeys = [];
    for (const journey of cases) {
      const order = await read(a.operator, operatorAbi, "getOrder", [
        journey.id,
      ]);
      const state = await read(a.escrow, escrowAbi, "paymentState", [
        order.paymentHash,
      ]);
      const status = await read(a.operator, operatorAbi, "status", [
        journey.id,
      ]);
      const fingerprint = keccak256(
        toHex(journey.description.normalize("NFC").trim()),
      );
      const paymentHash = await read(a.escrow, escrowAbi, "getHash", [
        order.payment,
      ]);
      if (
        fingerprint !== order.descriptionHash ||
        paymentHash !== order.paymentHash ||
        status !== journey.expected ||
        order.status !== status ||
        !state[0] ||
        state[1] !== 0n ||
        state[2] !== (status === 4 ? 1000000n : 0n) ||
        order.payment.maxAmount !== 1000000n
      )
        throw Error("Journey state or fingerprint mismatch " + journey.name);
      const receipts = [];
      for (const hash of journey.hashes) {
        const receipt = await c.getTransactionReceipt({ hash });
        const transaction = await c.getTransaction({ hash });
        const b = await c.getBlock({ blockNumber: receipt.blockNumber });
        if (
          receipt.status !== "success" ||
          receipt.blockHash !== b.hash ||
          transaction.blockHash !== b.hash ||
          b.transactions[receipt.transactionIndex] !== hash ||
          heads[i] < receipt.blockNumber + 1n
        )
          throw Error("Noncanonical receipt " + hash);
        const events = receipt.logs.map((l) => {
          for (const abi of [operatorAbi, collectorAbi, escrowAbi, erc20Abi])
            try {
              return {
                address: l.address,
                ...decodeEventLog({ abi, data: l.data, topics: l.topics }),
                logIndex: l.logIndex,
              };
            } catch {}
          return {
            address: l.address,
            data: l.data,
            topics: l.topics,
            logIndex: l.logIndex,
          };
        });
        receipts.push({
          hash,
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          utc: new Date(Number(b.timestamp) * 1000).toISOString(),
          events,
        });
      }
      const final = receipts.at(-1);
      const transfers = final.events.filter(
        (e) =>
          e.eventName === "Transfer" &&
          e.address.toLowerCase() === a.usdc.toLowerCase(),
      );
      const tokenStore = await read(a.escrow, escrowAbi, "getTokenStore", [
        a.operator,
      ]);
      const recipient =
        status === 4 ? order.payment.receiver : order.payment.payer;
      if (
        transfers.length !== 1 ||
        transfers[0].args.value !== 1000000n ||
        transfers[0].args.from.toLowerCase() !== tokenStore.toLowerCase() ||
        transfers[0].args.to.toLowerCase() !== recipient.toLowerCase()
      )
        throw Error("Wrong settlement transfer");
      const allowance = await read(a.usdc, erc20Abi, "allowance", [
        order.payment.payer,
        a.collector,
      ]);
      const preApproved = await read(
        a.collector,
        collectorAbi,
        "isPreApproved",
        [order.paymentHash],
      );
      const buyerBalance = await read(a.usdc, erc20Abi, "balanceOf", [
        order.payment.payer,
      ]);
      const buyerGas = await c.getBalance({
        address: order.payment.payer,
        blockNumber,
      });
      const storeBalance = await read(a.usdc, erc20Abi, "balanceOf", [
        tokenStore,
      ]);
      journeys.push({
        ...journey,
        order,
        status,
        allowance,
        preApproved,
        buyerBalance,
        buyerGas,
        storeBalance,
        collected: state[0],
        held: state[1],
        captured: state[2],
        fingerprintMatches: true,
        recipient,
        tokenStore,
        receipts,
      });
    }
    report.rpcs[i] = {
      url: urls[i],
      chainId: 84532,
      blockHash: block.hash,
      chainTime: block.timestamp,
      utc: new Date(Number(block.timestamp) * 1000).toISOString(),
      codeHashes,
      journeys,
    };
    console.log("RPC complete", urls[i]);
  }),
);
for (const key of ["blockHash", "chainTime", "codeHashes", "journeys"])
  if (json(report.rpcs[0][key]) !== json(report.rpcs[1][key]))
    throw Error("RPC mismatch " + key);
report.agreement = true;
report.rpcMethods = [...methods];
await writeFile(
  process.argv[2] || "/tmp/dealza-judge-acceptance-recheck.json",
  json(report) + "\n",
  { flag: "wx" },
);
console.log("BOTH JOURNEYS VERIFIED");
