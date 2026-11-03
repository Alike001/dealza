import {
  verifyCanonicalReceipt,
  verifyActionEffects,
  verifyCreationEffects,
  equal,
  expectedEvents,
} from "./receiptProof";
import {
  beginIntent,
  pendingKey,
  saveIntent,
  trackHash,
  clearIntent,
  pendingIntent,
  savedCreation,
  rememberCreation,
  SubmittedTransactionError,
  type Intent,
} from "./pendingTransaction";
import { createLogReader, historyRange, checkAbort } from "./eventLogs";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  keccak256,
  encodeEventTopics,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hash,
  type TransactionReceipt,
} from "viem";
import {
  chain,
  deploymentConfig,
  network,
  rpcUrl,
  rpcLogBlocks,
  historyBlocks,
} from "./config";
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
async function verify(blockNumber?: bigint) {
  const d = requiredDeployment();
  if ((await client.getChainId()) !== 84532)
    throw new Error("The read connection is not on Base Sepolia.");
  const codes = await Promise.all(
    [d.operator, network.escrow, network.collector].map((address) =>
      client.getCode({ address, blockNumber }),
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
      blockNumber,
      abi: operatorAbi,
      functionName: "ESCROW",
    }),
    client.readContract({
      address: d.operator,
      blockNumber,
      abi: operatorAbi,
      functionName: "COLLECTOR",
    }),
    client.readContract({
      address: d.operator,
      blockNumber,
      abi: operatorAbi,
      functionName: "USDC",
    }),
    client.readContract({
      address: d.operator,
      blockNumber,
      abi: operatorAbi,
      functionName: "CHAIN_ID",
    }),
    client.readContract({
      address: network.collector,
      blockNumber,
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
async function loadOrder(
  id: Hash,
  minimumBlock = 0n,
  exactBlock?: bigint,
): Promise<OrderSnapshot> {
  await verify(exactBlock);
  const d = requiredDeployment();
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const block = await client.getBlock({
    blockNumber: exactBlock ?? (head < minimumBlock ? minimumBlock : head),
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
const activeSubmissions = new Set<string>();
const proofNetwork = () => ({
  operator: requiredDeployment().operator,
  escrow: network.escrow,
  collector: network.collector,
  usdc: network.usdc,
});
class NoActionError extends Error {
  readonly name = "NoActionError";
}
async function checkTerminal(receipt: TransactionReceipt, intent: Intent) {
  if (receipt.status !== "reverted" && !intent.cancelled) return;
  await verifyCanonicalReceipt(client, receipt, {
    requireSuccess: false,
    requireAction: false,
  });
  if (receipt.status === "reverted") {
    clearIntent(intent);
    throw new NoActionError(
      "The transaction is canonically reverted. No action was completed. Refresh the order before making a new request.",
    );
  }
  const full = await client.getTransaction({ hash: receipt.transactionHash });
  if (
    full.input === "0x" &&
    full.value === 0n &&
    sameAddress(full.to ?? "", full.from) &&
    expectedEvents(receipt, proofNetwork()).length === 0
  ) {
    clearIntent(intent);
    throw new NoActionError(
      "Your wallet confirmed a cancellation transaction. No requested action was completed. Refresh before submitting a new request.",
    );
  }
  throw Error(
    "A cancellation transaction was reported but its receipt requires review. Keep both transaction hashes and do not submit again.",
  );
}
function rejectedByUser(error: unknown): boolean {
  let e = error as { code?: number; name?: string; cause?: unknown };
  const seen = new Set<unknown>();
  while (e && !seen.has(e)) {
    seen.add(e);
    if (e.code === 4001 || e.name === "UserRejectedRequestError") return true;
    e = e.cause as typeof e;
  }
  return false;
}
async function verifyIntent(
  receipt: TransactionReceipt,
  intent: Intent,
): Promise<{ created?: Hash; snapshot: OrderSnapshot }> {
  if (!intent.hash || !equal(receipt.transactionHash, intent.hash))
    throw Error(
      "Receipt hash does not match the saved submission or its replacement.",
    );
  await checkTerminal(receipt, intent);
  const outer = await verifyCanonicalReceipt(client, receipt);
  if (
    sameAddress(outer.to ?? "", intent.target) &&
    (!sameAddress(outer.from, intent.actor) || outer.input !== intent.data)
  )
    throw Error(
      "Your wallet confirmed a different transaction at the expected target. Check its receipt before submitting again.",
    );
  await verify(receipt.blockNumber);
  if (intent.cancelled)
    throw Error(
      "Your wallet confirmed a cancellation transaction. This action was not completed. Inspect its receipt.",
    );
  let created: Hash | undefined;
  let snapshot: OrderSnapshot;
  if (intent.action === "create") {
    if (!intent.terms) throw Error("Missing saved creation terms");
    const event = verifyCreationEffects(
      receipt,
      proofNetwork(),
      intent.actor,
      intent.terms,
    );
    const state = await loadOrder(
      event.id,
      receipt.blockNumber,
      receipt.blockNumber,
    );
    if (
      !equal(state.order.payment, event.payment) ||
      state.order.paymentHash !== event.paymentHash ||
      !equal(state.order.reviewer, intent.terms.reviewer) ||
      state.order.descriptionHash !==
        descriptionHash(intent.terms.description) ||
      state.order.status !== 1 ||
      state.collected ||
      state.held !== 0n ||
      state.captured !== 0n
    )
      throw Error("Confirmed order terms do not match your request.");
    created = event.id;
    snapshot = state;
  } else {
    if (!intent.before) throw Error("Missing saved order context");
    const after = await loadOrder(
      intent.before.id,
      receipt.blockNumber,
      receipt.blockNumber,
    );
    verifyActionEffects({
      action: intent.action,
      actor: intent.actor,
      before: intent.before,
      after,
      proof: intent.proof,
      receipt,
      network: proofNetwork(),
    });
    snapshot = after;
  }
  if (
    (await client.getBlock({ blockNumber: receipt.blockNumber })).hash !==
    receipt.blockHash
  )
    throw Error(
      "Canonical block changed during verification. Recheck the saved transaction.",
    );
  if (created) rememberCreation(intent, created);
  clearIntent(intent);
  return { created, snapshot };
}
async function send(
  call: ContractCall,
  session: Session,
  update: (state: TxState) => void,
  intent: Intent,
): Promise<TransactionReceipt> {
  beginIntent(intent); // Durable before opening the wallet; refresh cannot start a second request.
  const key = pendingKey(intent.actor, intent.operator);
  activeSubmissions.add(key);
  const wallet = createWalletClient({
    chain,
    account: session.account,
    transport: custom(session.provider as EIP1193Provider),
  });
  let submitted = false,
    walletOpened = false;
  try {
    return await confirmTransaction(
      {
        check: async () => {
          await assertSession(session);
          await verify();
        },
        simulate: async () => {
          await client.simulateContract({ ...call, account: session.account });
        },
        send: async () => {
          walletOpened = true;
          try {
            const hash = await wallet.writeContract({
              ...call,
              account: session.account,
              chain,
            });
            submitted = true;
            trackHash(intent, hash);
            return hash;
          } catch (e) {
            if (rejectedByUser(e)) clearIntent(intent);
            throw e;
          }
        },
        wait: async (hash, replaced) => {
          const receipt = await client.waitForTransactionReceipt({
            hash,
            confirmations: 2,
            timeout: 180000,
            onReplaced: (r) => {
              trackHash(intent, r.transaction.hash);
              intent.cancelled ||= r.reason === "cancelled";
              saveIntent(intent);
              replaced(r.transaction.hash, r.reason);
            },
          });
          if (!equal(receipt.transactionHash, intent.hash))
            throw Error(
              "Receipt hash does not match the submitted or reported replacement transaction.",
            );
          await checkTerminal(receipt, intent);
          return receipt;
        },
        verify: async (receipt) => {
          return (await verifyIntent(receipt, intent)).snapshot;
        },
      },
      update,
    );
  } catch (e) {
    if (e instanceof NoActionError)
      throw new SubmittedTransactionError(e.message, intent.hash);
    if (!walletOpened) clearIntent(intent);
    if (
      walletOpened &&
      (submitted || pendingIntent(intent.actor, intent.operator))
    )
      throw new SubmittedTransactionError(
        `${submitted ? "The submitted action is not verified." : "The wallet did not return a usable hash; submission status is unknown."} Recheck the saved transaction; do not submit again. ${String((e as Error).message || e).split("\n")[0]}`,
        intent.hash,
      );
    throw e;
  } finally {
    activeSubmissions.delete(key);
  }
}
async function resumePending(
  session: Session,
  update: (state: TxState) => void,
  suppliedHash?: Hash,
): Promise<Hash | undefined> {
  await assertSession(session);
  if (
    activeSubmissions.has(
      pendingKey(session.account, requiredDeployment().operator),
    )
  )
    throw Error(
      "This page is still processing the original wallet request. Wait for its result before rechecking.",
    );
  const intent = pendingIntent(session.account, requiredDeployment().operator);
  if (!intent) throw Error("No unresolved transaction for this wallet.");
  if (suppliedHash) {
    if (!/^0x[0-9a-f]{64}$/i.test(suppliedHash))
      throw Error("Enter a complete transaction hash.");
    trackHash(intent, suppliedHash);
  }
  if (!intent.hash)
    throw Error(
      "The wallet did not return a hash. Find the submitted transaction in your wallet and paste its hash. Do not submit again.",
    );
  update({
    phase: "pending",
    hash: intent.hash,
    message:
      "Rechecking the saved transaction. No signature or payment is requested…",
  });
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: intent.hash,
      confirmations: 2,
      timeout: 180000,
      onReplaced: (r) => {
        trackHash(intent, r.transaction.hash);
        intent.cancelled ||= r.reason === "cancelled";
        saveIntent(intent);
        update({
          phase: "pending",
          hash: intent.hash,
          message: "Rechecking the replacement transaction…",
        });
      },
    });
    if (!equal(receipt.transactionHash, intent.hash))
      throw Error(
        "Receipt hash does not match the saved submission or reported replacement.",
      );
    await checkTerminal(receipt, intent);
    const verified = await verifyIntent(receipt, intent);
    update({
      phase: "confirmed",
      hash: receipt.transactionHash,
      message: "The saved transaction and its onchain effects are verified.",
      snapshot: verified.snapshot,
    });
    return verified.created;
  } catch (e) {
    if (e instanceof NoActionError)
      throw new SubmittedTransactionError(e.message, intent.hash);
    throw new SubmittedTransactionError(
      "The saved action remains unverified. Inspect its receipt and retry this read-only check; do not submit again. " +
        String((e as Error).message || e).split("\n")[0],
      intent.hash,
    );
  }
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
  const receipt = await send(call, session, update, {
    version: 1,
    actor: session.account,
    operator: d.operator,
    target: call.address,
    data: encodeFunctionData(call),
    action,
    before: s,
    proof,
  });
  // Receipt-block state is already verified; current UI reads may fail independently.
  void receipt;
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
  const call: ContractCall = {
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
  };
  const data = encodeFunctionData(call);
  const prior = savedCreation(session.account, d.operator, data);
  if (prior) {
    const existing = await loadOrder(prior);
    if (
      !sameAddress(existing.order.payment.receiver, session.account) ||
      !sameAddress(existing.order.payment.payer, terms.buyer) ||
      !sameAddress(existing.order.reviewer, terms.reviewer) ||
      existing.order.payment.maxAmount !== terms.amount ||
      existing.order.payment.preApprovalExpiry !== terms.fundingCutoff ||
      existing.order.payment.authorizationExpiry !== terms.expiry ||
      existing.order.descriptionHash !== descriptionHash(terms.description)
    )
      throw Error(
        "Saved creation terms do not match the chain. Check existing orders before submitting again.",
      );
    update({
      phase: "confirmed",
      message:
        "These exact terms were already created. Opening the verified order.",
    });
    return prior;
  }
  await send(call, session, update, {
    version: 1,
    actor: session.account,
    operator: d.operator,
    target: d.operator,
    data,
    action: "create",
    terms,
    proof: descriptionHash(terms.description),
  });
  const id = savedCreation(session.account, d.operator, data);
  if (!id)
    throw Error(
      "Verified creation result could not be restored. Check existing orders before retrying.",
    );
  return id;
}
// Log retries belong to the bounded reader, not nested transport retries.
const logClient = createPublicClient({
  chain,
  transport: http(rpcUrl, { timeout: 15000, retryCount: 0 }),
});
const rawLogs = createLogReader(
  (filter) =>
    logClient.request(
      { method: "eth_getLogs", params: [filter] },
      { retryCount: 0 },
    ),
  { maxBlocks: rpcLogBlocks },
);
async function range(before?: bigint) {
  const d = requiredDeployment();
  const to = before ?? (await client.getBlockNumber({ cacheTime: 0 })) - 1n;
  return historyRange(d.block, to, historyBlocks);
}
async function listOrders(
  account: Address,
  before?: bigint,
  signal?: AbortSignal,
): Promise<Page<OrderItem>> {
  await verify();
  const d = requiredDeployment(),
    r = await range(before);
  checkAbort(signal);
  const logs = await rawLogs(
    d.operator,
    r.from,
    r.to,
    [encodeEventTopics({ abi: operatorAbi, eventName: "OrderCreated" })[0]!],
    signal,
  );
  const items: OrderItem[] = [];
  for (const log of logs) {
    if (
      log.topics[0] !==
      encodeEventTopics({ abi: operatorAbi, eventName: "OrderCreated" })[0]
    )
      continue;
    const parsed = decodeEventLog({ abi: operatorAbi, ...log, strict: true });
    if (parsed.eventName !== "OrderCreated") continue;
    const a = parsed.args;
    if (
      ![a.seller, a.buyer, a.reviewer].some((address) =>
        sameAddress(address, account),
      )
    )
      continue;
    checkAbort(signal);
    const current = await loadOrder(a.orderId);
    checkAbort(signal);
    items.push({
      id: a.orderId,
      seller: a.seller,
      buyer: a.buyer,
      reviewer: a.reviewer,
      amount: a.payment.maxAmount,
      expiry: a.payment.authorizationExpiry,
      block: log.blockNumber,
      status: financialStatus(current),
    });
  }
  return { items: items.reverse(), next: r.next, through: r.to, from: r.from };
}

async function activity(
  s: OrderSnapshot,
  before?: bigint,
  signal?: AbortSignal,
): Promise<Page<Activity>> {
  await verify();
  checkAbort(signal);
  const d = requiredDeployment(),
    r = await range(before);
  const logs = [
    ...(await rawLogs(d.operator, r.from, r.to, [null, s.id], signal)),
    ...(await rawLogs(
      network.escrow,
      r.from,
      r.to,
      [null, s.order.paymentHash],
      signal,
    )),
  ].sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
  );
  const timestamps = new Map<bigint, number>();
  for (const block of new Set(logs.map((log) => log.blockNumber))) {
    checkAbort(signal);
    timestamps.set(
      block,
      Number((await client.getBlock({ blockNumber: block })).timestamp),
    );
  }
  checkAbort(signal);
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
        logIndex: log.logIndex,
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
      throw new Error(
        "A matching event could not be decoded. History is incomplete; retry after checking the pinned ABI.",
      );
    }
  }
  return { items: items.reverse(), next: r.next, through: r.to, from: r.from };
}
export const chainGateway: PaymentGateway = {
  deployment: deploymentConfig,
  verify,
  resumePending,
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
