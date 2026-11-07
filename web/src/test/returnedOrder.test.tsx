import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Address, Hash, TransactionReceipt } from "viem";
import recorded from "./recorded/checkpoint8-return.json";
import {
  checkoutStatus,
  StateExplanation,
} from "../components/PaymentGuidance";
import { CheckoutFeedback } from "../components/CheckoutFeedback";
import { OrderPage } from "../components/OrderPage";
import {
  allowedActions,
  financialStatus,
  type OrderSnapshot,
} from "../lib/domain";
import {
  verifyActionEffects,
  verifyCanonicalReceipt,
  type CanonicalReader,
  type ReceiptNetwork,
} from "../lib/receiptProof";
import { WalletContext } from "../lib/wallet";
import { api, session, wallet } from "./fixtures";

// Frozen genuine receipt and B-1/B state reads from two independent RPCs.
// No network request, signing client, or broadcast is used by these regressions.
function state(raw: typeof recorded.before): OrderSnapshot {
  return {
    ...raw,
    id: raw.id as Hash,
    order: {
      ...raw.order,
      payment: {
        ...raw.order.payment,
        maxAmount: BigInt(raw.order.payment.maxAmount),
        salt: BigInt(raw.order.payment.salt),
      },
    } as OrderSnapshot["order"],
    held: BigInt(raw.held),
    captured: BigInt(raw.captured),
    allowance: BigInt(raw.allowance),
    buyerBalance: BigInt(raw.buyerBalance),
    buyerGas: BigInt(raw.buyerGas),
    storeBalance: BigInt(raw.storeBalance),
    tokenStore: raw.tokenStore as Address,
    block: BigInt(raw.block),
  };
}
function receipt(): TransactionReceipt {
  return {
    ...recorded.receipt,
    blockNumber: BigInt(recorded.receipt.blockNumber),
    logs: recorded.receipt.logs.map((l) => ({
      ...l,
      blockNumber: BigInt(l.blockNumber),
    })),
  } as unknown as TransactionReceipt;
}
function verify(r = receipt(), actor = recorded.reviewer as Address) {
  return verifyActionEffects({
    action: "resolveVoid",
    actor,
    before: state(recorded.before),
    after: state(recorded.after),
    receipt: r,
    network: recorded.network as ReceiptNetwork,
    proof: recorded.decisionHash as Hash,
  });
}

describe("genuine Checkpoint 8 reviewer return", () => {
  it("replays the canonical routed receipt and its exact return effects", async () => {
    const r = receipt();
    const reader: CanonicalReader = {
      getChainId: async () => recorded.transaction.chainId,
      getTransactionReceipt: async () => r,
      getTransaction: async () => ({
        ...recorded.transaction,
        hash: recorded.transaction.hash as Hash,
        blockHash: recorded.transaction.blockHash as Hash,
        blockNumber: BigInt(recorded.transaction.blockNumber),
        from: recorded.transaction.from as Address,
        to: recorded.transaction.to as Address,
        input: recorded.transaction.input as Hash,
        value: BigInt(recorded.transaction.value),
      }),
      getBlock: async () => ({
        hash: recorded.blockHeader.hash as Hash,
        number: BigInt(recorded.blockHeader.number),
        transactions: recorded.blockHeader.transactions as Hash[],
      }),
      getBlockNumber: async () => BigInt(recorded.head),
    };
    await verifyCanonicalReceipt(reader, r);
    expect(() => verify(r)).not.toThrow();
    expect(recorded.transaction.type).toBe("eip7702");
    expect(recorded.transaction.from.toLowerCase()).not.toBe(
      recorded.reviewer.toLowerCase(),
    );
    expect(
      BigInt(recorded.after.balances.buyer) -
        BigInt(recorded.before.balances.buyer),
    ).toBe(1000000n);
    expect(recorded.after.balances.buyer).toBe("19000000");
    expect(recorded.after.balances.seller).toBe(
      recorded.before.balances.seller,
    );
    expect(recorded.after.balances.seller).toBe("2000000");
    expect(recorded.after.balances.tokenStore).toBe("0");
  });
  it("rejects a missing return transfer, a duplicate settlement event and the wrong authorizer", () => {
    const missing = receipt();
    missing.logs = missing.logs.filter(
      (l) => l.address.toLowerCase() !== recorded.network.usdc.toLowerCase(),
    );
    expect(() => verify(missing)).toThrow();
    const duplicate = receipt();
    duplicate.logs.push({
      ...duplicate.logs.find(
        (l) =>
          l.address.toLowerCase() === recorded.network.escrow.toLowerCase(),
      )!,
      logIndex: 99,
    });
    expect(() => verify(duplicate)).toThrow();
    expect(() =>
      verify(receipt(), recorded.before.order.payment.payer as Address),
    ).toThrow("settlement actor/state mismatch");
  });
  it("keeps the contract state and permission rules unchanged while clarifying the label", () => {
    const after = state(recorded.after);
    expect(after.order.status).toBe(5);
    expect(after.derived).toBe(5);
    expect(financialStatus(after)).toBe("Cancelled");
    expect(checkoutStatus(after)).toBe("Returned to buyer");
    expect(after.held).toBe(0n);
    expect(after.captured).toBe(0n);
    expect(after.allowance).toBe(0n);
    for (const account of [
      after.order.payment.payer,
      after.order.payment.receiver,
      after.order.reviewer,
    ])
      expect(allowedActions(after, account)).toEqual([]);
  });
  it("shows a precise verified return receipt and the retained Voided state", () => {
    const after = state(recorded.after);
    render(
      <>
        <CheckoutFeedback
          action="resolveVoid"
          tx={{
            phase: "confirmed",
            hash: recorded.receipt.transactionHash as Hash,
            snapshot: after,
            message: "Verified",
          }}
        />
        <StateExplanation snapshot={after} />
      </>,
    );
    expect(screen.getByText("Reviewer decision confirmed")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Funds returned to the buyer",
    );
    expect(screen.getByText(/Returned to buyer ·/)).toHaveTextContent(
      "Contract state: Voided (5)",
    );
    expect(
      screen.getByRole("link", { name: /View transaction/ }),
    ).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/tx/${recorded.receipt.transactionHash}`,
    );
  });
  it("renders the refreshed real order as returned without requesting another wallet action", async () => {
    const after = state(recorded.after),
      gateway = api({
        deployment: {
          operator: recorded.network.operator as Address,
          block: 53676176n,
        },
        loadOrder: vi.fn(async () => after),
      });
    render(
      <WalletContext.Provider
        value={wallet(session(after.order.payment.payer))}
      >
        <OrderPage
          id={after.id}
          description="Dealza Checkpoint 8: buyer dispute and reviewer return; controlled test, no physical delivery."
          api={gateway}
        />
      </WalletContext.Provider>,
    );
    await screen.findByText("Returned to buyer");
    expect(screen.getByText("Voided (5)")).toBeInTheDocument();
    expect(document.querySelector(".recommended-action")).toBeNull();
    expect(gateway.act).not.toHaveBeenCalled();
    expect(gateway.create).not.toHaveBeenCalled();
  });
});

describe("funded return versus unfunded cancellation copy", () => {
  it("retains Cancelled for an order that was never funded", () => {
    const unfunded = { ...state(recorded.after), collected: false };
    expect(checkoutStatus(unfunded)).toBe("Cancelled");
    render(<StateExplanation snapshot={unfunded} />);
    expect(screen.getByText(/No funds were reserved/)).toBeInTheDocument();
    expect(
      screen.queryByText(/previously reserved USDC was returned/),
    ).not.toBeInTheDocument();
  });
  it("does not describe inconsistent payment accounting as a return", () => {
    const inconsistent = { ...state(recorded.after), captured: 1n };
    expect(() => checkoutStatus(inconsistent)).toThrow(
      "Payment records do not agree",
    );
  });
});
