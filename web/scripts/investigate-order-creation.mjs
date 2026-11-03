// Read-only incident capture. No wallet client, keys, signing or broadcast methods.
import { mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  getAbiItem,
  http,
  keccak256,
} from "viem";
import { recoverAuthorizationAddress } from "viem/utils";
import { baseSepolia } from "viem/chains";
import {
  operatorAbi,
  operatorRuntimeHash,
} from "../src/lib/contracts.generated.ts";

const seller = "0xF74aD341e10187073a0eef55356D136F1be5E3Cf";
const operator = "0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8";
const rpcUrl =
  process.env.DEALZA_READONLY_RPC_URL ||
  "https://base-sepolia-rpc.publicnode.com";
const client = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl, { retryCount: 1, timeout: 20000 }),
});
const hashes = [
  "0x26498aaab70c0e6fef9009b046584cf8abf5873760ba3381f336c89aed9749e6",
  "0x7f168316d9df0afe2d041276cd33beda9bc94c8755f6c68e5b46b83d7fb84ca0",
  "0x0a041cd43fd4931414cdcc4672a5621741e53fd46d20b5d0fe576439c7f0b06b",
];
const stringify = (value) =>
  JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n";
if ((await client.getChainId()) !== 84532) throw new Error("Wrong chain");
const block = await client.getBlock();
const blockNumber = block.number;
const [code, nonce, pendingNonce, balance, runtime, orderNonce] =
  await Promise.all([
    client.getCode({ address: seller, blockNumber }),
    client.getTransactionCount({ address: seller, blockNumber }),
    client.getTransactionCount({ address: seller, blockTag: "pending" }),
    client.getBalance({ address: seller, blockNumber }),
    client.getCode({ address: operator, blockNumber }),
    client.readContract({
      address: operator,
      abi: operatorAbi,
      functionName: "sellerNonce",
      args: [seller],
      blockNumber,
    }),
  ]);
if (!runtime || keccak256(runtime) !== operatorRuntimeHash)
  throw new Error("Operator runtime mismatch");
const evidence = {
  queriedAt: new Date().toISOString(),
  rpc: rpcUrl,
  chainId: 84532,
  block: { number: blockNumber, hash: block.hash, timestamp: block.timestamp },
  seller,
  operator,
  code,
  nonce,
  pendingNonce,
  balanceWei: balance,
  operatorRuntimeHash,
  orderNonce,
  transactions: [],
  orders: [],
};
for (const hash of hashes) {
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ]);
  const authorizations = await Promise.all(
    (tx.authorizationList || []).map(async (authorization) => ({
      chainId: authorization.chainId,
      target: authorization.address,
      nonce: authorization.nonce,
      authority: await recoverAuthorizationAddress({ authorization }),
    })),
  );
  // Decode embedded create calldata as a diagnostic; event + contract reads below are the proof.
  const embeddedCreateCalls = [];
  for (
    let offset = tx.input.indexOf("0b0c40bb");
    offset >= 0;
    offset = tx.input.indexOf("0b0c40bb", offset + 8)
  ) {
    try {
      embeddedCreateCalls.push(
        decodeFunctionData({
          abi: operatorAbi,
          data: `0x${tx.input.slice(offset, offset + 392)}`,
        }),
      );
    } catch {
      /* Selector alone proves nothing. */
    }
  }
  const events = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== operator.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: operatorAbi,
        topics: log.topics,
        data: log.data,
      });
      if (decoded.eventName === "OrderCreated") events.push(decoded.args);
    } catch {
      /* Other events are not order creation. */
    }
  }
  evidence.transactions.push({
    hash,
    from: tx.from,
    to: tx.to,
    nonce: tx.nonce,
    type: tx.type,
    value: tx.value,
    inputSelector: tx.input.slice(0, 10),
    inputBytes: (tx.input.length - 2) / 2,
    authorizations,
    embeddedCreateCalls,
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    events,
  });
}
// Full deployment-to-snapshot scan, not a recent-history heuristic.
const logs = [];
for (let fromBlock = 53676176n; fromBlock <= blockNumber; fromBlock += 10000n) {
  logs.push(
    ...(await client.getLogs({
      address: operator,
      event: getAbiItem({ abi: operatorAbi, name: "OrderCreated" }),
      args: { seller },
      fromBlock,
      toBlock:
        fromBlock + 9999n < blockNumber ? fromBlock + 9999n : blockNumber,
      strict: true,
    })),
  );
}
for (const log of logs) {
  const [order, status] = await Promise.all([
    client.readContract({
      address: operator,
      abi: operatorAbi,
      functionName: "getOrder",
      args: [log.args.orderId],
      blockNumber,
    }),
    client.readContract({
      address: operator,
      abi: operatorAbi,
      functionName: "status",
      args: [log.args.orderId],
      blockNumber,
    }),
  ]);
  evidence.orders.push({
    id: log.args.orderId,
    transactionHash: log.transactionHash,
    blockNumber: log.blockNumber,
    event: log.args,
    order,
    status,
  });
}
// Prepare only an unsigned cancellation after proving these are identical,
// unfunded orders. Simulation and estimation are read-only RPC calls.
if (
  evidence.orders.length === 2 &&
  evidence.orders.every((item) => item.status === 1)
) {
  const [original, duplicate] = evidence.orders;
  const sameTerms =
    original.order.descriptionHash === duplicate.order.descriptionHash &&
    original.order.reviewer === duplicate.order.reviewer &&
    Object.entries(original.order.payment).every(
      ([key, value]) =>
        key === "salt" ||
        String(value).toLowerCase() ===
          String(duplicate.order.payment[key]).toLowerCase(),
    );
  if (sameTerms) {
    const call = {
      address: operator,
      abi: operatorAbi,
      functionName: "cancel",
      args: [duplicate.id],
      account: seller,
    };
    await client.simulateContract({ ...call, blockNumber });
    const gas = await client.estimateContractGas({ ...call, blockNumber });
    evidence.nextManualAction = {
      action:
        "Cancel the second, unfunded duplicate; retain the original. No request was sent to a wallet.",
      retainedOrderId: original.id,
      duplicateOrderId: duplicate.id,
      simulatedAtBlock: blockNumber,
      estimatedGas: gas,
      unsignedTransaction: {
        chainId: "0x14a34",
        from: seller,
        to: operator,
        value: "0x0",
        data: encodeFunctionData(call),
      },
    };
  }
}
const dir = new URL(
  "../../docs/verification/transaction-replacement/",
  import.meta.url,
);
await mkdir(dir, { recursive: true });
await writeFile(new URL("chain-evidence.json", dir), stringify(evidence));
console.log(stringify(evidence));
