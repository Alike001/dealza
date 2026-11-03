import {
  decodeEventLog,
  erc20Abi,
  type Address,
  type Hash,
  type TransactionReceipt,
  type Hex,
} from "viem";
import { operatorAbi, collectorAbi, escrowAbi } from "./contracts.generated";
import {
  sameAddress,
  type Action,
  type OrderSnapshot,
  type CreateTerms,
  descriptionHash,
} from "./domain";

export const equal = (a: unknown, b: unknown): boolean => {
  const normalize = (x: unknown): unknown =>
    typeof x === "bigint"
      ? x.toString()
      : Array.isArray(x)
        ? x.map(normalize)
        : x && typeof x === "object"
          ? Object.fromEntries(
              Object.entries(x)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, normalize(v)]),
            )
          : typeof x === "string"
            ? x.toLowerCase()
            : x;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
};
const requireProof = (ok: unknown, message: string): void => {
  if (!ok)
    throw Error(
      `Receipt verification failed: ${message}. Keep the transaction hash and check its status before trying again.`,
    );
};
export type ReceiptNetwork = {
  operator: Address;
  escrow: Address;
  collector: Address;
  usdc: Address;
};
export interface CanonicalReader {
  getChainId(): Promise<number>;
  getTransactionReceipt(args: { hash: Hash }): Promise<TransactionReceipt>;
  getTransaction(args: { hash: Hash }): Promise<{
    hash: Hash;
    chainId?: number;
    blockHash: Hash | null;
    blockNumber: bigint | null;
    to: Address | null;
    from: Address;
    input: Hex;
    value: bigint;
  }>;
  getBlock(args: { blockNumber: bigint }): Promise<{
    hash: Hash | null;
    number: bigint | null;
    transactions: (Hash | { hash: Hash })[];
  }>;
  getBlockNumber(args: { cacheTime: number }): Promise<bigint>;
}
export async function verifyCanonicalReceipt(
  client: CanonicalReader,
  receipt: TransactionReceipt,
  options: { requireSuccess?: boolean; requireAction?: boolean } = {},
) {
  requireProof((await client.getChainId()) === 84532, "wrong read network");
  requireProof(
    (receipt.status === "success" ||
      (options.requireSuccess === false && receipt.status === "reverted")) &&
      /^0x[0-9a-f]{64}$/i.test(receipt.transactionHash),
    "receipt is not successful",
  );
  const [fresh, tx, block, head] = await Promise.all([
    client.getTransactionReceipt({ hash: receipt.transactionHash }),
    client.getTransaction({ hash: receipt.transactionHash }),
    client.getBlock({ blockNumber: receipt.blockNumber }),
    client.getBlockNumber({ cacheTime: 0 }),
  ]);
  requireProof(
    equal(
      [
        fresh.transactionHash,
        fresh.status,
        fresh.blockHash,
        fresh.blockNumber,
        fresh.transactionIndex,
        fresh.logs,
      ],
      [
        receipt.transactionHash,
        receipt.status,
        receipt.blockHash,
        receipt.blockNumber,
        receipt.transactionIndex,
        receipt.logs,
      ],
    ),
    "receipt changed or is not canonical",
  );
  requireProof(
    tx.chainId === 84532 &&
      equal(tx.hash, receipt.transactionHash) &&
      tx.blockNumber === receipt.blockNumber &&
      equal(tx.blockHash, receipt.blockHash),
    "transaction identity or chain mismatch",
  );
  requireProof(
    block.number === receipt.blockNumber &&
      equal(block.hash, receipt.blockHash) &&
      block.transactions.some((t) =>
        equal(typeof t === "string" ? t : t.hash, receipt.transactionHash),
      ) &&
      head >= receipt.blockNumber + 1n,
    "canonical block or confirmations missing",
  );
  requireProof(
    options.requireAction === false ||
      (tx.to && tx.input !== "0x" && tx.value === 0n),
    "unrelated account upgrade or nonzero ETH value",
  );
  const seen = new Set<number>();
  for (const l of receipt.logs) {
    requireProof(
      !l.removed &&
        l.blockNumber === receipt.blockNumber &&
        equal(l.blockHash, receipt.blockHash) &&
        equal(l.transactionHash, receipt.transactionHash) &&
        Number.isSafeInteger(l.logIndex) &&
        l.logIndex >= 0 &&
        !seen.has(l.logIndex),
      "invalid receipt log identity",
    );
    seen.add(l.logIndex);
  }
  return tx;
}
export type ProofEvent = {
  address: Address;
  name: string;
  args: Record<string, unknown>;
};
export function expectedEvents(
  receipt: TransactionReceipt,
  n: ReceiptNetwork,
): ProofEvent[] {
  return receipt.logs.flatMap((l) => {
    const abi = sameAddress(l.address, n.operator)
      ? operatorAbi
      : sameAddress(l.address, n.escrow)
        ? escrowAbi
        : sameAddress(l.address, n.collector)
          ? collectorAbi
          : sameAddress(l.address, n.usdc)
            ? erc20Abi
            : undefined;
    if (!abi) return []; // Auxiliary wallet events are not authorization evidence.
    const event = decodeEventLog({ abi, ...l, strict: true });
    return [
      {
        address: l.address,
        name: event.eventName,
        args: event.args as Record<string, unknown>,
      },
    ];
  });
}
function exact(events: ProofEvent[], wanted: ProofEvent[]) {
  // CPP lazily deploys the operator TokenStore on the first outbound transfer.
  requireProof(
    equal(events, wanted),
    "missing, additional or mismatched action events",
  );
}
export function verifyActionEffects({
  action,
  actor,
  before,
  after,
  proof,
  receipt,
  network: n,
}: {
  action: Action;
  actor: Address;
  before: OrderSnapshot;
  after: OrderSnapshot;
  proof: Hash;
  receipt: TransactionReceipt;
  network: ReceiptNetwork;
}) {
  const p = before.order.payment,
    id = before.id,
    h = before.order.paymentHash,
    amount = p.maxAmount;
  requireProof(
    equal(after.id, id) &&
      equal({ ...after.order, status: before.order.status }, before.order),
    "order terms changed",
  );
  requireProof(
    after.block === receipt.blockNumber,
    "post-state is not pinned to the receipt block",
  );
  requireProof(
    sameAddress(after.tokenStore, before.tokenStore) &&
      sameAddress(p.operator, n.operator) &&
      sameAddress(p.token, n.usdc),
    "custody or payment configuration mismatch",
  );
  const event = (
    address: Address,
    name: string,
    args: Record<string, unknown>,
  ): ProofEvent => ({ address, name, args });
  const op = (name: string, args: Record<string, unknown>) =>
    event(n.operator, name, { orderId: id, ...args });
  const cpp = (name: string, args: Record<string, unknown>) =>
    event(n.escrow, name, { paymentInfoHash: h, ...args });
  const transfer = (to: Address) =>
    event(n.usdc, "Transfer", { from: before.tokenStore, to, value: amount });
  const samePaymentState = () =>
    requireProof(
      equal(
        [after.collected, after.held, after.captured],
        [before.collected, before.held, before.captured],
      ),
      "unexpected protocol state change",
    );
  const status = (value: number) =>
    requireProof(
      after.order.status === value && after.derived === value,
      "wrong resulting order status",
    );
  const events = expectedEvents(receipt, n);
  const wanted: ProofEvent[] = [];
  if (action === "approve" || action === "revoke") {
    requireProof(sameAddress(actor, p.payer), "approval owner is not payer");
    const allowance = action === "approve" ? amount : 0n;
    wanted.push(
      event(n.usdc, "Approval", {
        owner: actor,
        spender: n.collector,
        value: allowance,
      }),
    );
    requireProof(
      after.allowance === allowance &&
        after.order.status === before.order.status,
      "wrong resulting allowance or order state",
    );
    samePaymentState();
  } else if (action === "preApprove") {
    requireProof(
      sameAddress(actor, p.payer) && before.order.status === 1,
      "preapproval actor/state mismatch",
    );
    wanted.push(
      event(n.collector, "PaymentPreApproved", { paymentInfoHash: h }),
    );
    requireProof(
      after.preApproved && after.order.status === before.order.status,
      "preapproval not set",
    );
    samePaymentState();
  } else if (action === "fund") {
    requireProof(
      sameAddress(actor, p.payer) && before.order.status === 1,
      "funding actor/state mismatch",
    );
    wanted.push(
      cpp("PaymentAuthorized", {
        paymentInfo: p,
        amount,
        tokenCollector: n.collector,
      }),
      event(n.usdc, "Transfer", {
        from: p.payer,
        to: before.tokenStore,
        value: amount,
      }),
      op("OrderFunded", { paymentHash: h }),
    );
    status(2);
    requireProof(
      after.collected &&
        after.held === amount &&
        after.captured === 0n &&
        after.storeBalance >= amount,
      "reserve not held in CPP custody",
    );
  } else if (action === "delivery" || action === "dispute") {
    requireProof(
      action === "delivery"
        ? sameAddress(actor, p.receiver)
        : sameAddress(actor, p.payer) || sameAddress(actor, p.receiver),
      "evidence actor mismatch",
    );
    requireProof(
      action === "delivery"
        ? [2, 3].includes(before.order.status)
        : before.order.status === 2,
      "evidence state mismatch",
    );
    wanted.push(
      op(
        action === "delivery" ? "DeliveryNoted" : "DisputeOpened",
        action === "delivery"
          ? { evidenceHash: proof }
          : { by: actor, evidenceHash: proof },
      ),
    );
    status(action === "delivery" ? before.order.status : 3);
    samePaymentState();
  } else if (action === "sync") {
    requireProof(before.derived === 7, "payment is not reclaimed");
    wanted.push(op("RecoverySynced", {}));
    status(7);
    samePaymentState();
  } else {
    const release = action === "release" || action === "resolveRelease";
    const review = action === "resolveRelease" || action === "resolveVoid";
    const pendingCancel = action === "cancel" && before.order.status === 1;
    const reclaim = action === "reclaim";
    requireProof(
      review
        ? sameAddress(actor, before.order.reviewer) && before.order.status === 3
        : action === "release"
          ? sameAddress(actor, p.payer) && before.order.status === 2
          : reclaim
            ? sameAddress(actor, p.payer) && before.derived === 6
            : action === "cancel" &&
              (pendingCancel
                ? sameAddress(actor, p.payer) || sameAddress(actor, p.receiver)
                : sameAddress(actor, p.receiver) &&
                  [2, 3].includes(before.order.status)),
      "settlement actor/state mismatch",
    );
    if (!pendingCancel) {
      requireProof(
        before.collected && before.held === amount && before.captured === 0n,
        "wrong pre-settlement authorization",
      );
      wanted.push(
        cpp(
          release
            ? "PaymentCaptured"
            : reclaim
              ? "PaymentReclaimed"
              : "PaymentVoided",
          release
            ? {
                amount,
                feeAmount: 0n,
                feeReceiver: "0x0000000000000000000000000000000000000000",
              }
            : { amount },
        ),
      );
      const created = events.filter((e) => e.name === "TokenStoreCreated");
      if (created.length)
        wanted.push(
          event(n.escrow, "TokenStoreCreated", {
            operator: n.operator,
            tokenStore: before.tokenStore,
          }),
        );
      wanted.push(transfer(release ? p.receiver : p.payer));
      requireProof(
        after.collected &&
          after.held === 0n &&
          after.captured === (release ? amount : 0n),
        "capture/return accounting mismatch",
      );
    } else samePaymentState();
    if (!reclaim) {
      wanted.push(
        op(release ? "OrderReleased" : "OrderVoided", { authorizedBy: actor }),
      );
      status(release ? 4 : 5);
    } else
      requireProof(
        after.derived === 7 && after.order.status === before.order.status,
        "expiry recovery state mismatch",
      );
    if (review)
      wanted.push(
        op("DisputeResolved", {
          releaseToSeller: release,
          decisionHash: proof,
        }),
      );
  }
  exact(events, wanted);
}
export function verifyCreationEffects(
  receipt: TransactionReceipt,
  n: ReceiptNetwork,
  actor: Address,
  terms: CreateTerms,
): { id: Hash; paymentHash: Hash; payment: OrderSnapshot["order"]["payment"] } {
  const events = expectedEvents(receipt, n);
  requireProof(
    events.length < 2,
    "Multiple matching orders or additional events require inspection",
  );
  requireProof(
    events.length === 1 &&
      sameAddress(events[0].address, n.operator) &&
      events[0].name === "OrderCreated",
    "new order could not be verified from its events",
  );
  const e = events[0].args,
    p = e.payment as OrderSnapshot["order"]["payment"],
    id = e.orderId as Hash;
  requireProof(
    sameAddress(e.seller as string, actor) &&
      sameAddress(e.buyer as string, terms.buyer) &&
      sameAddress(e.reviewer as string, terms.reviewer) &&
      equal(e.descriptionHash, descriptionHash(terms.description)),
    "created terms do not match your request",
  );
  requireProof(
    equal(p, {
      operator: n.operator,
      payer: terms.buyer,
      receiver: actor,
      token: n.usdc,
      maxAmount: terms.amount,
      preApprovalExpiry: terms.fundingCutoff,
      authorizationExpiry: terms.expiry,
      refundExpiry: terms.expiry,
      minFeeBps: 0,
      maxFeeBps: 0,
      feeReceiver: "0x0000000000000000000000000000000000000000",
      salt: BigInt(id),
    }),
    "created payment terms do not match your request",
  );
  return { id, paymentHash: e.paymentHash as Hash, payment: p };
}
