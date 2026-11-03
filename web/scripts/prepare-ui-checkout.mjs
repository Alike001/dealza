// Public reads and a LOCAL proposal only. No signing, wallet, broadcast or deploy.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  custom,
  erc20Abi,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  toHex,
} from "viem";
import {
  operatorAbi,
  operatorRuntimeHash,
  escrowAbi,
  collectorAbi,
} from "../src/lib/contracts.generated.ts";
const root = new URL("../../", import.meta.url);
const deployment = JSON.parse(
  await readFile(
    new URL("contracts/config/base-sepolia.deployment.json", root),
    "utf8",
  ),
);
const prior = JSON.parse(
  await readFile(
    new URL(
      "docs/verification/first-live-payment/settlement/evidence.json",
      root,
    ),
    "utf8",
  ),
);
const { buyer, seller, operator, collector, escrow, usdc } = prior.addresses;
if (deployment.operator !== operator || deployment.chainId !== 84532)
  throw Error("Deployment identity mismatch");
const origins = [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
];
const rpc = (url, method, params = []) =>
  new Promise((resolve, reject) => {
    if (
      !/^(eth_chainId|eth_getBlockByNumber|eth_blockNumber|eth_call|eth_getCode|eth_getBalance)$/.test(
        method,
      )
    )
      return reject(Error("Non-read RPC forbidden"));
    const p = spawn("curl", [
      "-4",
      "--fail",
      "--silent",
      "--show-error",
      "--max-time",
      "25",
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
        if (r.error) throw Error(r.error.message);
        resolve(r.result);
      } catch (e) {
        reject(e);
      }
    });
    p.stdin.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
  });
const clients = origins.map((url) =>
  createPublicClient({
    transport: custom(
      { request: ({ method, params }) => rpc(url, method, params) },
      { retryCount: 0 },
    ),
  }),
);
const same = (a, b) =>
  JSON.stringify(a, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  ).toLowerCase() ===
  JSON.stringify(b, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  ).toLowerCase();
const require = (ok, message) => {
  if (!ok) throw Error(message);
};
for (const c of clients)
  require((await c.getChainId()) === 84532, "Wrong chain");
const blockNumber = (await clients[0].getBlockNumber({ cacheTime: 0 })) - 2n;
const blocks = await Promise.all(
  clients.map((c) => c.getBlock({ blockNumber })),
);
require(blocks[0].hash === blocks[1].hash, "Block disagreement");
const snapshots = await Promise.all(
  clients.map(async (c) => {
    const read = (address, abi, functionName, args = []) =>
      c.readContract({ address, abi, functionName, args, blockNumber });
    require(keccak256(await c.getCode({ address: operator, blockNumber })) ===
      operatorRuntimeHash, "Operator code mismatch");
    return {
      sellerNonce: await read(operator, operatorAbi, "sellerNonce", [seller]),
      buyerUSDC: await read(usdc, erc20Abi, "balanceOf", [buyer]),
      sellerUSDC: await read(usdc, erc20Abi, "balanceOf", [seller]),
      allowance: await read(usdc, erc20Abi, "allowance", [buyer, collector]),
      buyerETH: await c.getBalance({ address: buyer, blockNumber }),
    };
  }),
);
require(same(snapshots[0], snapshots[1]), "State disagreement");
const fundingCutoff = Number(((blocks[0].timestamp + 86400n) / 3600n) * 3600n),
  expiry = fundingCutoff + 48 * 3600,
  amount = 1000000n;
require(snapshots[0].buyerUSDC >= amount, "Insufficient buyer test USDC");
const id = keccak256(
  encodeAbiParameters(parseAbiParameters("uint256,address,address,uint256"), [
    84532n,
    operator,
    seller,
    snapshots[0].sellerNonce,
  ]),
);
require(![
  prior.orderId,
  "0x808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97",
].includes(id), "Completed order reuse");
const reviewer = "0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548";
const description =
  "Dealza Checkpoint 6: fresh UI-only 1 test-USDC checkout; controlled test, no physical delivery.";
const descriptionHash = keccak256(toHex(description));
const payment = {
  operator,
  payer: buyer,
  receiver: seller,
  token: usdc,
  maxAmount: amount,
  preApprovalExpiry: fundingCutoff,
  authorizationExpiry: expiry,
  refundExpiry: expiry,
  minFeeBps: 0,
  maxFeeBps: 0,
  feeReceiver: "0x0000000000000000000000000000000000000000",
  salt: BigInt(id),
};
const hashes = await Promise.all(
  clients.map((c) =>
    c.readContract({
      address: escrow,
      abi: escrowAbi,
      functionName: "getHash",
      args: [payment],
      blockNumber,
    }),
  ),
);
require(hashes[0] === hashes[1], "Hash disagreement");
const unused = await Promise.all(
  clients.map(async (c) => ({
    state: await c.readContract({
      address: escrow,
      abi: escrowAbi,
      functionName: "paymentState",
      args: [hashes[0]],
      blockNumber,
    }),
    preApproved: await c.readContract({
      address: collector,
      abi: collectorAbi,
      functionName: "isPreApproved",
      args: [hashes[0]],
      blockNumber,
    }),
  })),
);
require(same(unused[0], unused[1]) &&
  same(unused[0], {
    state: [false, 0n, 0n],
    preApproved: false,
  }), "Proposed payment is not unused");
const args = [buyer, amount, fundingCutoff, expiry, reviewer, descriptionHash];
const report = {
  mode: "LOCAL_DRAFT_ONLY_NOT_SUBMITTED",
  queriedAt: new Date().toISOString(),
  rpcOrigins: origins,
  chainId: 84532,
  block: {
    number: blockNumber,
    hash: blocks[0].hash,
    utc: new Date(Number(blocks[0].timestamp) * 1000).toISOString(),
  },
  addresses: { operator, buyer, seller, reviewer, collector, escrow, usdc },
  amountRaw: amount,
  amountUSDC: "1",
  platformFeeRaw: 0,
  description,
  descriptionHash,
  fundingCutoff,
  expiry,
  fundingCutoffUTC: new Date(fundingCutoff * 1000).toISOString(),
  expiryUTC: new Date(expiry * 1000).toISOString(),
  snapshot: snapshots[0],
  predictedOrderId: id,
  proposedPaymentHash: hashes[0],
  payment,
  unused: unused[0],
  creation: {
    to: operator,
    value: "0x0",
    function: "createOrder",
    args,
    data: encodeFunctionData({
      abi: operatorAbi,
      functionName: "createOrder",
      args,
    }),
  },
  limitations:
    "Predicted ID depends on sellerNonce and can change before mining. Payment hash/terms must be reverified after actual creation. This file authorizes no signature, transaction, allowance, reservation or release.",
  signingPerformed: false,
  broadcastPerformed: false,
  created: false,
};
await writeFile(
  new URL(
    "docs/verification/checkpoint-6/fresh-ui-checkout-proposal.json",
    root,
  ),
  JSON.stringify(
    report,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n",
);
console.log(
  "Prepared LOCAL DRAFT ONLY for 1 test USDC; cut-off",
  report.fundingCutoffUTC,
  "expiry",
  report.expiryUTC,
);
