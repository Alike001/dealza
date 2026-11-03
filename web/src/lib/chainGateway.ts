import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  formatLog,
  getAddress,
  http,
  keccak256,
  toHex,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hash,
  type Log,
  type TransactionReceipt,
} from "viem";
import { chain, deploymentConfig, network, rpcUrl } from "./config";
import {
  operatorAbi,
  collectorAbi,
  escrowAbi,
  operatorRuntimeHash,
} from "./contracts.generated";
import {
  allowedActions,
  descriptionHash,
  financialStatus,
  money,
  sameAddress,
  type Action,
  type Activity,
  type CreateTerms,
  type Order,
  type OrderSnapshot,
  type TxState,
} from "./domain";
import { assertSession, type Session } from "./wallet";
import { confirmTransaction } from "./transactions";
import type { PaymentGateway, OrderItem, Page } from "./gateway";

const client = createPublicClient({
  chain,
  transport: http(rpcUrl, { timeout: 15_000, retryCount: 1 }),
});
type ContractCall = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};
function requiredDeployment() {
  if (!deploymentConfig)
    throw new Error(
      "Testnet integration pending. DealzaOperator has not been deployed yet.",
    );
  return deploymentConfig;
}
async function verify() {
  const d = requiredDeployment();
  if ((await client.getChainId()) !== 84532)
    throw new Error("The read connection is not on Base Sepolia.");
  const codes = await Promise.all(
    [d.operator, network.escrow, network.collector].map((address) =>
      client.getCode({ address }),
    ),
  );
  if (
    !codes[0] ||
    keccak256(codes[0]) !== operatorRuntimeHash ||
    !codes[1] ||
    keccak256(codes[1]) !== network.escrowCodeHash ||
    !codes[2] ||
    keccak256(codes[2]) !== network.collectorCodeHash
  )
    throw new Error(
      "Contract verification failed. Payment actions are disabled.",
    );
  const [escrow, collector, usdc, chainId, boundEscrow] = await Promise.all([
    client.readContract({
      address: d.operator,
      abi: operatorAbi,
      functionName: "ESCROW",
    }),
    client.readContract({
      address: d.operator,
      abi: operatorAbi,
      functionName: "COLLECTOR",
    }),
    client.readContract({
      address: d.operator,
      abi: operatorAbi,
      functionName: "USDC",
    }),
    client.readContract({
      address: d.operator,
      abi: operatorAbi,
      functionName: "CHAIN_ID",
    }),
    client.readContract({
      address: network.collector,
      abi: collectorAbi,
      functionName: "authCaptureEscrow",
    }),
  ]);
  if (
    !sameAddress(escrow, network.escrow) ||
    !sameAddress(collector, network.collector) ||
    !sameAddress(usdc, network.usdc) ||
    chainId !== 84532n ||
    !sameAddress(boundEscrow, network.escrow)
  )
    throw new Error(
      "The operator configuration does not match this application.",
    );
}
async function loadOrder(id: Hash, minimumBlock = 0n): Promise<OrderSnapshot> {
  await verify();
  const d = requiredDeployment();
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const block = await client.getBlock({
    blockNumber: head < minimumBlock ? minimumBlock : head,
  });
  const params = {
    address: d.operator,
    abi: operatorAbi,
    blockNumber: block.number,
  } as const;
  const [order, derived] = await Promise.all([
    client.readContract({ ...params, functionName: "getOrder", args: [id] }),
    client.readContract({ ...params, functionName: "status", args: [id] }),
  ]);
  const p = order.payment;
  if (
    !sameAddress(p.operator, d.operator) ||
    !sameAddress(p.token, network.usdc) ||
    p.maxAmount <= 0n ||
    p.minFeeBps !== 0 ||
    p.maxFeeBps !== 0 ||
    !/^0x0{40}$/i.test(p.feeReceiver) ||
    p.salt !== BigInt(id) ||
    p.preApprovalExpiry > p.authorizationExpiry ||
    p.refundExpiry !== p.authorizationExpiry
  )
    throw new Error(
      "This payment configuration does not match Dealza’s supported terms.",
    );
  const tokenStore = await client.readContract({
    address: network.escrow,
    abi: escrowAbi,
    functionName: "getTokenStore",
    args: [p.operator],
    blockNumber: block.number,
  });
  const [
    hash,
    state,
    allowance,
    preApproved,
    buyerBalance,
    buyerGas,
    storeBalance,
  ] = await Promise.all([
    client.readContract({
      address: network.escrow,
      abi: escrowAbi,
      functionName: "getHash",
      args: [p],
      blockNumber: block.number,
    }),
    client.readContract({
      address: network.escrow,
      abi: escrowAbi,
      functionName: "paymentState",
      args: [order.paymentHash],
      blockNumber: block.number,
    }),
    client.readContract({
      address: network.usdc,
      abi: erc20Abi,
      functionName: "allowance",
      args: [p.payer, network.collector],
      blockNumber: block.number,
    }),
    client.readContract({
      address: network.collector,
      abi: collectorAbi,
      functionName: "isPreApproved",
      args: [order.paymentHash],
      blockNumber: block.number,
    }),
    client.readContract({
      address: network.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [p.payer],
      blockNumber: block.number,
    }),
    client.getBalance({ address: p.payer, blockNumber: block.number }),
    client.readContract({
      address: network.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [tokenStore],
      blockNumber: block.number,
    }),
  ]);
  if (hash !== order.paymentHash)
    throw new Error("The order and protocol payment hashes do not match.");
  const snapshot = {
    id,
    order: order as Order,
    derived,
    collected: state[0],
    held: state[1],
    captured: state[2],
    allowance,
    preApproved,
    buyerBalance,
    buyerGas,
    tokenStore,
    storeBalance,
    chainTime: Number(block.timestamp),
    block: block.number,
  };
  financialStatus(snapshot);
  return snapshot;
}
async function send(
  call: ContractCall,
  session: Session,
  update: (state: TxState) => void,
  verifyResult?: (receipt: TransactionReceipt) => Promise<void>,
): Promise<TransactionReceipt> {
  const wallet = createWalletClient({
    chain,
    account: session.account,
    transport: custom(session.provider as EIP1193Provider),
  });
  const expectedData = encodeFunctionData(call);
  let cancelled = false;
  return confirmTransaction(
    {
      check: async () => {
        await assertSession(session);
        await verify();
      },
      simulate: async () => {
        await client.simulateContract({ ...call, account: session.account });
      },
      send: async () =>
        wallet.writeContract({ ...call, account: session.account, chain }),
      wait: (hash, replaced) =>
        client.waitForTransactionReceipt({
          hash,
          confirmations: 2,
          timeout: 180_000,
          onReplaced: (replacement) => {
            cancelled ||= replacement.reason === "cancelled";
            replaced(replacement.transaction.hash, replacement.reason);
          },
        }),
      verify: async (receipt) => {
        const tx = await client.getTransaction({
          hash: receipt.transactionHash,
        });
        if (cancelled)
          throw new Error(
            "Your wallet confirmed a cancellation transaction. This action was not completed. Check existing orders before retrying.",
          );
        const directCall =
          sameAddress(tx.to ?? "", call.address) &&
          sameAddress(tx.from, session.account) &&
          tx.input === expectedData &&
          tx.value === 0n;
        // MetaMask may return a relayer's transaction hash for eth_sendTransaction.
        // Its outer sender/calldata differ, even though the seller executed our call.
        // Only creation has an exact event + read-back proof. Other actions still
        // require direct transaction identity; a wrapper alone proves nothing.
        const canVerifyInnerCreation =
          !!verifyResult &&
          !!tx.to &&
          !sameAddress(tx.to, call.address) &&
          tx.input !== "0x" &&
          tx.value === 0n;
        if (!directCall && !canVerifyInnerCreation) {
          const authorizationChange =
            "authorizationList" in tx &&
            tx.authorizationList?.length &&
            tx.input === "0x";
          throw new Error(
            authorizationChange
              ? "Your wallet confirmed an account delegation change, not this action. Your draft is kept. Check existing orders before retrying."
              : "Your wallet confirmed a different transaction. The requested action was not confirmed. Check existing orders before trying again.",
          );
        }
        await verifyResult?.(receipt);
      },
    },
    update,
  );
}
async function act(
  action: Action,
  id: Hash,
  session: Session,
  update: (state: TxState) => void,
  evidence = "",
) {
  await assertSession(session);
  const s = await loadOrder(id);
  if (!allowedActions(s, session.account).includes(action))
    throw new Error(
      "This action is no longer available for this wallet. Refresh the order and check its deadline.",
    );
  const d = requiredDeployment();
  let call: ContractCall;
  const proof = descriptionHash(evidence);
  if (
    ["delivery", "dispute", "resolveRelease", "resolveVoid"].includes(action) &&
    !evidence.trim()
  )
    throw new Error(
      "Add the evidence or decision reference first. Keep the original content offchain.",
    );
  if (action === "approve" || action === "revoke")
    call = {
      address: network.usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [
        network.collector,
        action === "approve" ? s.order.payment.maxAmount : 0n,
      ],
    };
  else if (action === "preApprove")
    call = {
      address: network.collector,
      abi: collectorAbi,
      functionName: "preApprove",
      args: [s.order.payment],
    };
  else if (action === "reclaim")
    call = {
      address: network.escrow,
      abi: escrowAbi,
      functionName: "reclaim",
      args: [s.order.payment],
    };
  else if (action === "fund")
    call = {
      address: d.operator,
      abi: operatorAbi,
      functionName: "fund",
      args: [id, s.order.payment],
    };
  else if (action === "delivery" || action === "dispute")
    call = {
      address: d.operator,
      abi: operatorAbi,
      functionName: action === "delivery" ? "noteDelivery" : "dispute",
      args: [id, proof],
    };
  else if (action === "resolveRelease" || action === "resolveVoid")
    call = {
      address: d.operator,
      abi: operatorAbi,
      functionName: "resolve",
      args: [id, action === "resolveRelease", proof],
    };
  else
    call = {
      address: d.operator,
      abi: operatorAbi,
      functionName: action === "sync" ? "syncRecovery" : action,
      args: [id],
    };
  const receipt = await send(call, session, update);
  await loadOrder(id, receipt.blockNumber);
}
async function create(
  terms: CreateTerms,
  session: Session,
  update: (state: TxState) => void,
): Promise<Hash> {
  const d = requiredDeployment();
  await assertSession(session);
  const block = await client.getBlock();
  if (
    terms.fundingCutoff <= Number(block.timestamp) ||
    terms.expiry > Number(block.timestamp) + 30 * 86400 ||
    terms.expiry < terms.fundingCutoff ||
    sameAddress(terms.buyer, d.operator) ||
    sameAddress(terms.reviewer, d.operator)
  )
    throw new Error(
      "Check the order addresses and deadlines against current chain time.",
    );
  let orderId: Hash | undefined;
  await send(
    {
      address: d.operator,
      abi: operatorAbi,
      functionName: "createOrder",
      args: [
        terms.buyer,
        terms.amount,
        terms.fundingCutoff,
        terms.expiry,
        terms.reviewer,
        descriptionHash(terms.description),
      ],
    },
    session,
    update,
    async (receipt) => {
      const matches = [];
      let sawOrderEvent = false;
      for (const log of receipt.logs) {
        if (!sameAddress(log.address, d.operator)) continue;
        let decoded;
        try {
          decoded = decodeEventLog({
            abi: operatorAbi,
            topics: log.topics,
            data: log.data,
            strict: true,
          });
        } catch {
          continue;
        }
        if (decoded.eventName !== "OrderCreated") continue;
        sawOrderEvent = true;
        const a = decoded.args;
        const p = a.payment;
        if (
          !sameAddress(a.seller, session.account) ||
          !sameAddress(a.buyer, terms.buyer) ||
          !sameAddress(a.reviewer, terms.reviewer) ||
          a.descriptionHash !== descriptionHash(terms.description) ||
          !sameAddress(p.operator, d.operator) ||
          !sameAddress(p.payer, terms.buyer) ||
          !sameAddress(p.receiver, session.account) ||
          !sameAddress(p.token, network.usdc) ||
          p.maxAmount !== terms.amount ||
          p.preApprovalExpiry !== terms.fundingCutoff ||
          p.authorizationExpiry !== terms.expiry ||
          p.refundExpiry !== terms.expiry ||
          p.minFeeBps !== 0 ||
          p.maxFeeBps !== 0 ||
          !/^0x0{40}$/i.test(p.feeReceiver) ||
          p.salt !== BigInt(a.orderId)
        )
          continue;
        matches.push(a);
      }
      if (matches.length !== 1)
        throw new Error(
          matches.length > 1
            ? "Multiple matching orders were confirmed. Open My orders to inspect them; do not create another order."
            : sawOrderEvent
              ? "Confirmed order terms do not match your request. Check existing orders before retrying."
              : "Transaction confirmed but the new order could not be verified. Inspect the receipt and My orders before trying again.",
        );
      const event = matches[0];
      const s = await loadOrder(event.orderId, receipt.blockNumber);
      if (
        !sameAddress(s.order.reviewer, event.reviewer) ||
        s.order.descriptionHash !== event.descriptionHash ||
        s.order.paymentHash !== event.paymentHash ||
        Object.entries(event.payment).some(
          ([key, value]) =>
            String(value).toLowerCase() !==
            String(
              s.order.payment[key as keyof typeof event.payment],
            ).toLowerCase(),
        )
      )
        throw new Error("Confirmed order terms do not match your request.");
      orderId = event.orderId;
    },
  );
  return orderId!;
}
async function range(before?: bigint) {
  const d = requiredDeployment();
  const to = before ?? (await client.getBlockNumber());
  if (d.block > to)
    throw new Error(
      "The configured deployment block is ahead of the chain. Check the verified deployment record.",
    );
  const from = to - 9999n > d.block ? to - 9999n : d.block;
  return { from, to, next: from > d.block ? from - 1n : undefined };
}
async function rawLogs(
  address: Address,
  from: bigint,
  to: bigint,
  indexedId?: Hash,
) {
  const logs: (Log & {
    blockNumber: bigint;
    logIndex: number;
    transactionHash: Hash;
  })[] = [];
  for (let start = from; start <= to; start += 1000n) {
    const entries = await client.request({
      method: "eth_getLogs",
      params: [
        {
          address,
          fromBlock: toHex(start),
          toBlock: toHex(start + 999n < to ? start + 999n : to),
          ...(indexedId ? { topics: [null, indexedId] } : {}),
        },
      ],
    });
    for (const entry of entries) {
      const item = formatLog(entry);
      if (
        !item.removed &&
        item.blockNumber !== null &&
        item.logIndex !== null &&
        item.transactionHash !== null
      )
        logs.push({
          ...item,
          blockNumber: item.blockNumber,
          logIndex: item.logIndex,
          transactionHash: item.transactionHash,
        });
    }
  }
  return logs;
}
async function listOrders(
  account: Address,
  before?: bigint,
): Promise<Page<OrderItem>> {
  await verify();
  const d = requiredDeployment(),
    r = await range(before);
  const logs = await rawLogs(d.operator, r.from, r.to);
  const items: OrderItem[] = [];
  for (const log of logs) {
    try {
      const parsed = decodeEventLog({
        abi: operatorAbi,
        topics: log.topics,
        data: log.data,
      });
      if (parsed.eventName !== "OrderCreated") continue;
      const a = parsed.args;
      if (
        [a.seller, a.buyer, a.reviewer].some((address) =>
          sameAddress(address, account),
        )
      )
        items.push({
          id: a.orderId,
          seller: a.seller,
          buyer: a.buyer,
          reviewer: a.reviewer,
          amount: a.payment.maxAmount,
          expiry: a.payment.authorizationExpiry,
          block: log.blockNumber,
        });
    } catch {
      /* Ignore non-order events; RPC failures are never swallowed. */
    }
  }
  return { items: items.reverse(), next: r.next, through: r.to };
}
async function activity(
  s: OrderSnapshot,
  before?: bigint,
): Promise<Page<Activity>> {
  const d = requiredDeployment(),
    r = await range(before);
  const logs = (
    await Promise.all([
      rawLogs(d.operator, r.from, r.to, s.id),
      rawLogs(network.escrow, r.from, r.to, s.order.paymentHash),
    ])
  )
    .flat()
    .filter(
      (log) => log.topics[1] === s.id || log.topics[1] === s.order.paymentHash,
    )
    .sort((a, b) =>
      a.blockNumber === b.blockNumber
        ? a.logIndex - b.logIndex
        : a.blockNumber > b.blockNumber
          ? 1
          : -1,
    );
  const timestamps = new Map<bigint, number>();
  for (const block of new Set(logs.map((log) => log.blockNumber)))
    timestamps.set(
      block,
      Number((await client.getBlock({ blockNumber: block })).timestamp),
    );
  const items: Activity[] = [];
  for (const log of logs) {
    try {
      const parsed = decodeEventLog({
        abi: sameAddress(log.address, d.operator) ? operatorAbi : escrowAbi,
        topics: log.topics,
        data: log.data,
      });
      const args = parsed.args as {
        amount?: bigint;
        evidenceHash?: Hash;
        decisionHash?: Hash;
      };
      items.push({
        name: parsed.eventName,
        hash: log.transactionHash,
        block: log.blockNumber,
        timestamp: timestamps.get(log.blockNumber)!,
        detail:
          args.amount !== undefined
            ? `${money(args.amount)} USDC`
            : args.evidenceHash ||
              args.decisionHash ||
              "Confirmed on Base Sepolia",
      });
    } catch {
      /* Unrecognized log; no fabricated activity entries. */
    }
  }
  return { items, next: r.next, through: r.to };
}
export const chainGateway: PaymentGateway = {
  deployment: deploymentConfig,
  verify,
  loadOrder,
  listOrders,
  activity,
  act,
  create,
  balances: async (account) => {
    if ((await client.getChainId()) !== 84532)
      throw new Error("The balance connection is not on Base Sepolia.");
    const [usdc, eth] = await Promise.all([
      client.readContract({
        address: network.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [getAddress(account)],
      }),
      client.getBalance({ address: getAddress(account) }),
    ]);
    return { usdc, eth };
  },
};
