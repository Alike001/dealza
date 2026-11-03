// Read-only Gate 1. Keeps the existing draft/terms; never signs or broadcasts.
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  createPublicClient,
  custom,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  toHex,
  formatEther,
  decodeErrorResult,
} from "viem";
import {
  operatorAbi,
  operatorRuntimeHash,
  collectorAbi,
} from "../src/lib/contracts.generated.ts";
const root = new URL("../../", import.meta.url),
  out = new URL("docs/verification/checkpoint-7/", root);
await mkdir(out, { recursive: true });
const load = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const p = await load(
  "docs/verification/checkpoint-6/fresh-ui-checkout-proposal.json",
);
const deployment = await load("contracts/config/base-sepolia.deployment.json");
const { operator, seller, buyer, reviewer, collector, escrow, usdc } =
  p.addresses;
const origins = [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
];
const json = (x) =>
  JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
const same = (a, b) => json(a).toLowerCase() === json(b).toLowerCase();
const check = (ok, msg) => {
  if (!ok) throw Error(msg);
};
function rpc(url, method, params = []) {
  check(
    /^(eth_chainId|eth_blockNumber|eth_getBlockByNumber|eth_getCode|eth_getBalance|eth_getTransactionCount|eth_call|eth_estimateGas|eth_gasPrice)$/.test(
      method,
    ),
    "Non-read RPC forbidden",
  );
  return new Promise((resolve, reject) => {
    const child = spawn("curl", [
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
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (x) => (stdout += x));
    child.stderr.on("data", (x) => (stderr += x));
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        if (code) throw Error(stderr);
        const r = JSON.parse(stdout);
        if (r.error) throw Object.assign(Error(r.error.message), r.error);
        resolve(r.result);
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
  });
}
const clients = origins.map((url) =>
  createPublicClient({
    transport: custom(
      { request: ({ method, params }) => rpc(url, method, params) },
      { retryCount: 0 },
    ),
  }),
);
let report = {
  queriedAt: new Date().toISOString(),
  mode: "READ_ONLY_PREFLIGHT_NOT_GATE_1_SUCCESS",
  rpcOrigins: origins,
  signingPerformed: false,
  broadcastPerformed: false,
  newOrderCreated: false,
};
try {
  check(
    deployment.chainId === 84532 && same(deployment.operator, operator),
    "Deployment mismatch",
  );
  check(
    p.amountRaw === "1000000" && p.platformFeeRaw === 0,
    "Unexpected payment amount/fee",
  );
  const fingerprint = keccak256(toHex(p.description.normalize("NFC").trim()));
  check(fingerprint === p.descriptionHash, "Fingerprint mismatch");
  const args = [
    buyer,
    1000000n,
    p.fundingCutoff,
    p.expiry,
    reviewer,
    fingerprint,
  ];
  const data = encodeFunctionData({
    abi: operatorAbi,
    functionName: "createOrder",
    args,
  });
  check(
    data === p.creation.data && BigInt(p.creation.value) === 0n,
    "Prepared calldata/value mismatch",
  );
  for (const c of clients)
    check((await c.getChainId()) === 84532, "Wrong network");
  const blockNumber = (await clients[0].getBlockNumber({ cacheTime: 0 })) - 2n;
  const blocks = await Promise.all(
    clients.map((c) => c.getBlock({ blockNumber })),
  );
  check(blocks[0].hash === blocks[1].hash, "Canonical header disagreement");
  const chainTime = blocks[0].timestamp;
  check(
    BigInt(p.fundingCutoff) - chainTime > 6n * 3600n &&
      BigInt(p.expiry) - chainTime > 24n * 3600n &&
      p.expiry >= p.fundingCutoff &&
      BigInt(p.expiry) <= chainTime + 30n * 86400n,
    "Deadlines require refresh; preserve old draft and prepare a reviewed replacement",
  );
  report.block = {
    number: blockNumber,
    hash: blocks[0].hash,
    utc: new Date(Number(chainTime) * 1000).toISOString(),
  };
  report.terms = {
    operator,
    seller,
    buyer,
    reviewer,
    usdc,
    amountRaw: "1000000",
    amountUSDC: "1",
    platformFeeRaw: "0",
    description: p.description,
    fingerprint,
    fundingCutoff: p.fundingCutoff,
    expiry: p.expiry,
    fundingCutoffUTC: p.fundingCutoffUTC,
    expiryUTC: p.expiryUTC,
    reserveSecondsRemaining: BigInt(p.fundingCutoff) - chainTime,
    releaseSecondsRemaining: BigInt(p.expiry) - chainTime,
  };
  report.call = {
    chainId: 84532,
    from: seller,
    to: operator,
    value: "0x0",
    function: "createOrder",
    args,
    data,
  };
  report.providers = await Promise.all(
    clients.map(async (c, i) => {
      const read = (address, abi, functionName, args = []) =>
        c.readContract({ address, abi, functionName, args, blockNumber });
      const runtime = keccak256(
        await c.getCode({ address: operator, blockNumber }),
      );
      check(runtime === operatorRuntimeHash, "Operator runtime mismatch");
      const bindings = await Promise.all(
        ["ESCROW", "COLLECTOR", "USDC", "CHAIN_ID"].map((fn) =>
          read(operator, operatorAbi, fn),
        ),
      );
      check(
        same(bindings, [escrow, collector, usdc, 84532n]) &&
          same(
            await read(collector, collectorAbi, "authCaptureEscrow"),
            escrow,
          ),
        "Operator bindings mismatch",
      );
      const sellerNonce = await read(operator, operatorAbi, "sellerNonce", [
        seller,
      ]);
      check(
        sellerNonce <= 200n,
        "Too many seller orders to certify within this bounded enumeration",
      );
      const existingOrders = [];
      for (let nonce = 0n; nonce < sellerNonce; nonce++) {
        const id = keccak256(
          encodeAbiParameters(
            parseAbiParameters("uint256,address,address,uint256"),
            [84532n, operator, seller, nonce],
          ),
        );
        const order = await read(operator, operatorAbi, "getOrder", [id]);
        check(
          same(order.payment.receiver, seller),
          "Unexpected seller in enumerated order",
        );
        const matchingFingerprint = order.descriptionHash === fingerprint;
        const matchingFreshTerms =
          matchingFingerprint &&
          same(order.payment.payer, buyer) &&
          same(order.reviewer, reviewer) &&
          order.payment.maxAmount === 1000000n;
        existingOrders.push({
          nonce,
          id,
          order,
          status: await read(operator, operatorAbi, "status", [id]),
          matchingFingerprint,
          matchingFreshTerms,
        });
      }
      check(
        !existingOrders.some(
          (o) => o.matchingFingerprint || o.matchingFreshTerms,
        ),
        "A matching fresh order already exists. Do not create again.",
      );
      const predictedId = keccak256(
        encodeAbiParameters(
          parseAbiParameters("uint256,address,address,uint256"),
          [84532n, operator, seller, sellerNonce],
        ),
      );
      let predictedExists = true;
      try {
        await read(operator, operatorAbi, "getOrder", [predictedId]);
      } catch (error) {
        let e = error,
          name;
        while (e) {
          if (e.data?.errorName) {
            name = e.data.errorName;
            break;
          }
          if (typeof e.data === "string") {
            try {
              name = decodeErrorResult({
                abi: operatorAbi,
                data: e.data,
              }).errorName;
              break;
            } catch {}
          }
          e = e.cause;
        }
        if (name !== "UnknownOrder") throw error;
        predictedExists = false;
      }
      check(!predictedExists, "Predicted order already exists");
      const [balance, confirmedNonce, pendingNonce, gasPrice] =
        await Promise.all([
          c.getBalance({ address: seller, blockNumber }),
          c.getTransactionCount({ address: seller, blockNumber }),
          c.getTransactionCount({ address: seller, blockTag: "pending" }),
          c.getGasPrice(),
        ]);
      check(balance > 0n, "Seller needs test ETH");
      check(
        pendingNonce === confirmedNonce,
        "Seller has a pending account transaction; inspect it before proceeding",
      );
      const simulated = await c.simulateContract({
        address: operator,
        abi: operatorAbi,
        functionName: "createOrder",
        args,
        account: seller,
        value: 0n,
        blockNumber,
      });
      check(
        simulated.result === predictedId,
        "Simulation produced a different ID",
      );
      const gas = await c.estimateContractGas({
        address: operator,
        abi: operatorAbi,
        functionName: "createOrder",
        args,
        account: seller,
        value: 0n,
        blockNumber,
      });
      check(
        balance > gas * gasPrice,
        "Insufficient seller ETH for estimated direct L2 execution cost",
      );
      return {
        rpc: origins[i],
        runtime,
        bindings,
        sellerNonce,
        sellerETHWei: balance,
        sellerETH: formatEther(balance),
        confirmedNonce,
        pendingNonce,
        existingOrders,
        predictedId,
        predictedExists,
        simulation: {
          result: simulated.result,
          ephemeralOnly: true,
          value: "0x0",
        },
        directGasEstimate: gas,
        gasPriceWei: gasPrice,
        directL2ExecutionEstimateWei: gas * gasPrice,
      };
    }),
  );
  const [a, b] = report.providers;
  check(
    same(
      [
        a.sellerNonce,
        a.sellerETHWei,
        a.confirmedNonce,
        a.pendingNonce,
        a.existingOrders,
        a.predictedId,
      ],
      [
        b.sellerNonce,
        b.sellerETHWei,
        b.confirmedNonce,
        b.pendingNonce,
        b.existingOrders,
        b.predictedId,
      ],
    ),
    "Independent state disagreement",
  );
  report.result = "READ_ONLY_PREFLIGHT_PASS";
  report.gate1 = "NOT_EXECUTED_AWAITING_USER_METAMASK_CONFIRMATION";
  report.limitations = [
    "No actual MetaMask connection is asserted; it must be checked in the user browser.",
    "Nonce/order checks are pinned onchain observations; a pending relayer call can exist without increasing the seller account nonce. Inspect MetaMask Activity and Saved transaction before submitting.",
    "Direct eth_call/gas estimate does not prove a future wallet envelope or final total fee. MetaMask must refresh the total L1/L2/relayer fee.",
    "The predicted order ID is not a created order. Verify actual events and state after the user supplies the transaction hash.",
  ];
} catch (error) {
  report.result = "NO_GO";
  report.error = String(error.stack || error);
  process.exitCode = 1;
}
await writeFile(new URL("gate-1-preflight.json", out), json(report) + "\n");
console.log(
  report.result,
  report.block?.utc,
  report.error ?? "No signing or broadcast.",
);
