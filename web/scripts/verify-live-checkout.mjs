// Public RPC reads and eth_call/eth_estimateGas only. No wallet, keys or broadcast.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  http,
  keccak256,
  erc20Abi,
  getAbiItem,
  toHex,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbi,
  decodeEventLog,
} from "viem";
import {
  operatorAbi,
  operatorRuntimeHash,
  escrowAbi,
  collectorAbi,
} from "../src/lib/contracts.generated.ts";
import {
  duplicateCancellation,
  verifyDuplicateCancellation,
} from "./checkout-safety.mjs";
const root = new URL("../../", import.meta.url);
const json = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const report = await readFile(
  new URL("docs/12-ORDER-CREATION-WALLET-COMPATIBILITY.md", root),
  "utf8",
);
const originalId = report.match(/original order `(0x[0-9a-f]{64})`/i)?.[1];
const duplicateId = report.match(/duplicate `(0x[0-9a-f]{64})`/i)?.[1];
if (!originalId || !duplicateId || originalId === duplicateId)
  throw new Error("Incident order IDs could not be established");
const deployment = await json("contracts/config/base-sepolia.deployment.json");
const roles = await json("contracts/config/base-sepolia.roles.json");
const protocol = await json("docs/verification/base-sepolia.json");
const operator = deployment.operator;
const { seller, buyer, reviewer } = roles;
const escrow = protocol.escrow.address,
  collector = protocol.collector.address;
const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const endpoint =
  process.env.DEALZA_READONLY_RPC_URL ||
  "https://base-sepolia-rpc.publicnode.com";
const client = createPublicClient({
  transport: http(endpoint, { timeout: 20000, retryCount: 1 }),
});
if ((await client.getChainId()) !== 84532) throw new Error("Wrong chain");
const head = await client.getBlockNumber({ cacheTime: 0 });
const header = await client.getBlock({ blockNumber: head - 2n });
const blockNumber = header.number;
const read = (address, abi, functionName, args = []) =>
  client.readContract({ address, abi, functionName, args, blockNumber });
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const require = (condition, message) => {
  if (!condition) throw new Error(message);
};
for (const [address, hash] of [
  [operator, operatorRuntimeHash],
  [escrow, protocol.escrow.runtime_keccak256],
  [collector, protocol.collector.runtime_keccak256],
]) {
  const code = await client.getCode({ address, blockNumber });
  require(code && keccak256(code) === hash, `Runtime mismatch: ${address}`);
}
const binding = await Promise.all([
  read(operator, operatorAbi, "ESCROW"),
  read(operator, operatorAbi, "COLLECTOR"),
  read(operator, operatorAbi, "USDC"),
  read(operator, operatorAbi, "CHAIN_ID"),
  read(collector, collectorAbi, "authCaptureEscrow"),
]);
require(same(binding[0], escrow) &&
  same(binding[1], collector) &&
  same(binding[2], usdc) &&
  binding[3] === 84532n &&
  same(binding[4], escrow), "Deployment configuration mismatch");
const snapshot = {
  queriedAt: new Date().toISOString(),
  rpcOrigin: new URL(endpoint).origin,
  chainId: 84532,
  block: {
    number: blockNumber,
    hash: header.hash,
    timestamp: header.timestamp,
  },
  operator,
  seller,
  buyer,
  reviewer,
  escrow,
  collector,
  usdc,
  original: null,
  duplicate: null,
};
for (const [label, id, nonce] of [
  ["original", originalId, 0n],
  ["duplicate", duplicateId, 1n],
]) {
  require(keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      [84532n, operator, seller, nonce],
    ),
  ) === id, "Order ID does not match its chain/operator/seller/creation nonce");
  const order = await read(operator, operatorAbi, "getOrder", [id]);
  const p = order.payment;
  require(same(p.receiver, seller) &&
    same(p.payer, buyer) &&
    same(order.reviewer, reviewer) &&
    same(p.operator, operator) &&
    same(p.token, usdc), "Participant/token mismatch");
  require(p.maxAmount === 1000000n &&
    p.preApprovalExpiry === 1793725200 &&
    p.authorizationExpiry === 1793898000 &&
    p.refundExpiry === 1793898000 &&
    p.minFeeBps === 0 &&
    p.maxFeeBps === 0 &&
    /^0x0{40}$/i.test(p.feeReceiver) &&
    p.salt === BigInt(id), "Stored terms differ from incident report");
  require(order.descriptionHash ===
    "0xb28c8133d0699cbe2cda54262423de1d3c2fb55227e1508afa38602334c4ced4", "Description mismatch");
  const [status, paymentState, preApproved, paymentHash] = await Promise.all([
    read(operator, operatorAbi, "status", [id]),
    read(escrow, escrowAbi, "paymentState", [order.paymentHash]),
    read(collector, collectorAbi, "isPreApproved", [order.paymentHash]),
    read(escrow, escrowAbi, "getHash", [p]),
  ]);
  require(paymentHash === order.paymentHash, "CPP payment hash mismatch");
  snapshot[label] = {
    id,
    order,
    status,
    paymentState,
    preApproved,
    paymentHash,
    fundingSecondsRemaining: BigInt(p.preApprovalExpiry) - header.timestamp,
  };
}
const extras = parseAbi([
  "function paused() view returns (bool)",
  "function isBlacklisted(address) view returns (bool)",
]);
const tokenStore = await read(escrow, escrowAbi, "getTokenStore", [operator]);
const [
  balance,
  allowance,
  decimals,
  paused,
  buyerBlacklisted,
  sellerBlacklisted,
  tokenStoreBalance,
  operatorBalance,
  buyerEth,
  sellerEth,
  buyerNonce,
  buyerPendingNonce,
  sellerNonce,
  sellerPendingNonce,
  buyerCode,
  sellerCode,
] = await Promise.all([
  read(usdc, erc20Abi, "balanceOf", [buyer]),
  read(usdc, erc20Abi, "allowance", [buyer, collector]),
  read(usdc, erc20Abi, "decimals"),
  read(usdc, extras, "paused"),
  read(usdc, extras, "isBlacklisted", [buyer]),
  read(usdc, extras, "isBlacklisted", [seller]),
  read(usdc, erc20Abi, "balanceOf", [tokenStore]),
  read(usdc, erc20Abi, "balanceOf", [operator]),
  client.getBalance({ address: buyer, blockNumber }),
  client.getBalance({ address: seller, blockNumber }),
  client.getTransactionCount({ address: buyer, blockNumber }),
  client.getTransactionCount({ address: buyer, blockTag: "pending" }),
  client.getTransactionCount({ address: seller, blockNumber }),
  client.getTransactionCount({ address: seller, blockTag: "pending" }),
  client.getCode({ address: buyer, blockNumber }),
  client.getCode({ address: seller, blockNumber }),
]);
snapshot.balances = {
  buyerUsdc: balance,
  buyerEth,
  sellerEth,
  collectorAllowance: allowance,
  tokenStore,
  tokenStoreUsdc: tokenStoreBalance,
  operatorUsdc: operatorBalance,
  decimals,
  paused,
  buyerBlacklisted,
  sellerBlacklisted,
};
snapshot.accounts = {
  buyer: {
    nonce: buyerNonce,
    pendingNonce: buyerPendingNonce,
    code: buyerCode ?? "0x",
  },
  seller: {
    nonce: sellerNonce,
    pendingNonce: sellerPendingNonce,
    code: sellerCode ?? "0x",
  },
};
// Scan the complete deployment-to-snapshot interval for payment-hash and order-ID events.
const history = [];
for (
  let from = BigInt(deployment.deploymentBlock);
  from <= blockNumber;
  from += 10000n
) {
  const end = from + 9999n < blockNumber ? from + 9999n : blockNumber;
  for (const [address, hashes, abi] of [
    [operator, [originalId, duplicateId], operatorAbi],
    [
      escrow,
      [snapshot.original.paymentHash, snapshot.duplicate.paymentHash],
      escrowAbi,
    ],
    [
      collector,
      [snapshot.original.paymentHash, snapshot.duplicate.paymentHash],
      collectorAbi,
    ],
  ]) {
    const logs = await client.request({
      method: "eth_getLogs",
      params: [
        {
          address,
          fromBlock: toHex(from),
          toBlock: toHex(end),
          topics: [null, hashes],
        },
      ],
    });
    for (const log of logs) {
      require(!log.removed, "Removed log requires a fresh snapshot");
      const decoded = decodeEventLog({
        abi,
        topics: log.topics,
        data: log.data,
        strict: true,
      });
      history.push({
        address,
        blockNumber: BigInt(log.blockNumber),
        transactionHash: log.transactionHash,
        eventName: decoded.eventName,
        args: decoded.args,
        log,
      });
    }
  }
}
snapshot.creationProofs = [];
for (const item of [snapshot.original, snapshot.duplicate]) {
  const created = history.filter(
    (entry) =>
      entry.eventName === "OrderCreated" && entry.args.orderId === item.id,
  );
  require(created.length ===
    1, "Expected exactly one genuine creation event per order");
  const event = created[0];
  const receipt = await client.getTransactionReceipt({
    hash: event.transactionHash,
  });
  const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
  require(receipt.status === "success" &&
    receipt.blockHash === canonical.hash &&
    blockNumber - receipt.blockNumber + 1n >=
      2n, "Creation receipt must be canonical, successful and confirmed");
  require(event.args.paymentHash === item.paymentHash &&
    same(event.args.seller, seller) &&
    same(event.args.buyer, buyer) &&
    same(event.args.reviewer, reviewer) &&
    event.args.descriptionHash ===
      item.order.descriptionHash, "Creation event identity mismatch");
  require(Object.entries(item.order.payment).every(([key, value]) =>
    same(event.args.payment[key], value),
  ), "Creation event payment terms mismatch");
  snapshot.creationProofs.push({
    id: item.id,
    transactionHash: event.transactionHash,
    blockNumber: receipt.blockNumber,
    confirmations: blockNumber - receipt.blockNumber + 1n,
    verified: true,
  });
}
snapshot.history = history.map(({ log, ...item }) => item);
snapshot.historyScan = {
  fromBlock: deployment.deploymentBlock,
  toBlock: blockNumber,
  complete: true,
};
const receiptArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith("--cancellation-hash="))
  ?.split("=")[1];
const candidateHashes = [
  ...new Set(
    history
      .filter(
        (item) =>
          item.eventName === "OrderVoided" && item.args.orderId === duplicateId,
      )
      .map((item) => item.transactionHash),
  ),
];
if (receiptArg) {
  require(/^0x[0-9a-f]{64}$/i.test(receiptArg), "Invalid cancellation hash");
  candidateHashes.push(receiptArg);
}
snapshot.cancellation = { confirmed: false };
for (const hash of [...new Set(candidateHashes)]) {
  const receipt = await client.getTransactionReceipt({ hash });
  const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
  require(canonical.hash === receipt.blockHash, "Receipt is not canonical");
  verifyDuplicateCancellation(receipt, snapshot);
  snapshot.cancellation = {
    confirmed: true,
    hash,
    blockNumber: receipt.blockNumber,
    confirmations: blockNumber - receipt.blockNumber + 1n,
    proof:
      "Exact seller-authorized OrderVoided for duplicate plus current state; original remains pending and both CPP states empty",
  };
}
const noPaymentEvents = history.every(
  (item) =>
    ![
      "PaymentPreApproved",
      "PaymentAuthorized",
      "OrderFunded",
      "PaymentCaptured",
    ].includes(item.eventName),
);
const buyerReady =
  balance === 21000000n &&
  allowance === 0n &&
  decimals === 6 &&
  !paused &&
  !buyerBlacklisted &&
  !sellerBlacklisted &&
  buyerEth > 0n &&
  buyerNonce === buyerPendingNonce &&
  noPaymentEvents &&
  snapshot.original.fundingSecondsRemaining > 0n &&
  snapshot.original.status === 1 &&
  !snapshot.original.preApproved &&
  snapshot.original.paymentState[0] === false &&
  snapshot.original.paymentState[1] === 0n &&
  snapshot.original.paymentState[2] === 0n &&
  tokenStoreBalance === 0n &&
  operatorBalance === 0n;
snapshot.buyerPreparation = {
  ready: buyerReady,
  paymentAttemptsObserved: !noPaymentEvents,
  desiredApproval: { token: usdc, spender: collector, amount: 1000000n },
  blockedUntilDuplicateResolved: !snapshot.cancellation.confirmed,
};
if (!snapshot.cancellation.confirmed) {
  const transaction = duplicateCancellation(snapshot);
  require(sellerNonce ===
    sellerPendingNonce, "Seller has a pending transaction");
  const call = {
    address: operator,
    abi: operatorAbi,
    functionName: "cancel",
    args: [duplicateId],
    account: seller,
    blockNumber,
  };
  await client.simulateContract(call);
  const estimatedGas = await client.estimateContractGas(call);
  snapshot.nextAction = {
    action: "Seller manually cancels duplicate only",
    transaction,
    simulation: "PASS",
    estimatedGas,
    completed: false,
  };
} else if (buyerReady) {
  const call = {
    address: usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [collector, 1000000n],
    account: buyer,
    blockNumber,
  };
  await client.simulateContract(call);
  snapshot.nextAction = {
    action: "Buyer manually approves exactly 1 USDC to CPP collector",
    transaction: {
      chainId: "0x14a34",
      from: buyer,
      to: usdc,
      value: "0x0",
      data: encodeFunctionData(call),
    },
    simulation: "PASS",
    completed: false,
  };
} else
  snapshot.nextAction = {
    action: "STOP: buyer preflight needs review",
    completed: false,
  };
// Independently compare both records and financial state through a second public RPC.
const second = createPublicClient({
  transport: http("https://base-sepolia.drpc.org", {
    timeout: 20000,
    retryCount: 1,
  }),
});
require((await second.getChainId()) === 84532, "Second RPC chain mismatch");
const secondHeader = await second.getBlock({ blockNumber });
require(secondHeader.hash ===
  header.hash, "RPCs disagree on canonical snapshot");
for (const item of [snapshot.original, snapshot.duplicate]) {
  const other = await second.readContract({
    address: operator,
    abi: operatorAbi,
    functionName: "getOrder",
    args: [item.id],
    blockNumber,
  });
  const state = await second.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "paymentState",
    args: [item.paymentHash],
    blockNumber,
  });
  const encode = (v) =>
    JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
  require(encode(other) === encode(item.order) &&
    encode(state) ===
      encode(item.paymentState), "RPCs disagree on order or financial state");
}
snapshot.independentRpcCrosscheck = {
  origin: "https://base-sepolia.drpc.org",
  canonicalBlockAndBothOrdersAndCppState: "PASS",
};
const directory = new URL("docs/verification/checkout-continuation/", root);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL("snapshot.json", directory),
  JSON.stringify(
    snapshot,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n",
);
await writeFile(
  new URL("next-manual-transaction.json", directory),
  JSON.stringify(
    snapshot.nextAction.transaction ?? {
      action: "STOP: no transaction prepared",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      block: snapshot.block,
      original: {
        id: originalId,
        paymentHash: snapshot.original.paymentHash,
        status: snapshot.original.status,
        preApproved: snapshot.original.preApproved,
        paymentState: snapshot.original.paymentState,
        fundingSecondsRemaining: snapshot.original.fundingSecondsRemaining,
      },
      duplicate: {
        id: duplicateId,
        paymentHash: snapshot.duplicate.paymentHash,
        status: snapshot.duplicate.status,
        preApproved: snapshot.duplicate.preApproved,
        paymentState: snapshot.duplicate.paymentState,
      },
      balances: snapshot.balances,
      cancellation: snapshot.cancellation,
      buyerPreparation: snapshot.buyerPreparation,
      nextAction: snapshot.nextAction,
      crosscheck: snapshot.independentRpcCrosscheck,
    },
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ),
);
