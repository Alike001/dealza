import { financialStatus, type Action, type TxState } from "../lib/domain";
import { TransactionNotice } from "./common";

const names: Record<Action, string> = {
  approve: "USDC allowance",
  preApprove: "Payment terms authorization",
  fund: "Funds reservation",
  release: "Release to seller",
  delivery: "Delivery evidence",
  dispute: "Dispute request",
  resolveRelease: "Reviewer release decision",
  resolveVoid: "Reviewer return decision",
  cancel: "Cancellation or return",
  reclaim: "Expired funds recovery",
  sync: "Recovery record update",
  revoke: "Allowance revocation",
};

// Copy describes receipt-verified effects only. It never changes transaction state.
export function CheckoutFeedback({
  tx,
  action,
}: {
  tx: TxState;
  action: Action | null;
}) {
  if (tx.phase === "idle") return null;
  if (!action)
    return (
      <TransactionNotice
        tx={
          tx.phase === "confirmed"
            ? {
                ...tx,
                phase: "pending",
                message:
                  "Checking transaction. Recheck its verified effects before retrying.",
              }
            : tx
        }
        title="Checking transaction"
      />
    );
  const name = names[action];
  let title: string;
  let message = tx.message;
  if (tx.phase === "signature") {
    title = "Wallet confirmation requested";
    message = `${name}: review the request in your wallet. ${tx.message}`;
  } else if (tx.phase === "pending") {
    title = "Transaction submitted";
    message = `${name}. Checking transaction and onchain effects. Do not submit again. ${tx.message}`;
  } else if (tx.phase === "confirmed") {
    const s = tx.snapshot;
    let verified = false;
    try {
      if (s && tx.hash) {
        financialStatus(s);
        verified = {
          approve: s.allowance === s.order.payment.maxAmount,
          preApprove: s.preApproved,
          fund: s.order.status === 2 && s.held === s.order.payment.maxAmount,
          release: s.order.status === 4,
          delivery: [2, 3].includes(s.order.status),
          dispute: s.order.status === 3,
          resolveRelease: s.order.status === 4,
          resolveVoid: s.order.status === 5,
          cancel: s.order.status === 5,
          reclaim: s.derived === 7,
          sync: s.order.status === 7,
          revoke: s.allowance === 0n,
        }[action];
      }
    } catch {
      /* Inconsistent effects cannot be presented as successful. */
    }
    if (!verified)
      return (
        <TransactionNotice
          tx={{
            ...tx,
            phase: "pending",
            message:
              "Checking transaction. Verified receipt effects are not available here; recheck before retrying.",
          }}
          title="Checking transaction"
        />
      );
    const outcomes: Record<Action, [string, string]> = {
      approve: [
        "Allowance confirmed",
        "This transaction set the exact USDC spending cap. No USDC moved. Your next step follows the verified state.",
      ],
      preApprove: [
        "Payment terms authorized",
        "This transaction authorized the exact payment terms. No USDC moved. Funding readiness follows the verified state.",
      ],
      fund: [
        "Funds reserved",
        "This transaction reserved USDC in the protocol. It did not pay the seller.",
      ],
      release: [
        "Funds released",
        "This transaction paid the full amount to the seller. Its receipt effects are verified.",
      ],
      delivery: [
        "Delivery evidence recorded",
        "The reference is verified onchain. It does not prove delivery or release payment.",
      ],
      dispute: [
        "Dispute opened",
        "This transaction opened the dispute. Current status and the review deadline are shown above.",
      ],
      resolveRelease: [
        "Reviewer decision confirmed",
        "Funds released to the seller. The full payment and decision are verified.",
      ],
      resolveVoid: [
        "Reviewer decision confirmed",
        "Funds returned to the buyer. The full return and decision are verified.",
      ],
      cancel: [
        s?.collected ? "Funds returned" : "Order cancelled",
        s?.collected
          ? "The return of the uncaptured reserve to the buyer is verified."
          : "The unfunded order is closed. No reserved USDC was transferred.",
      ],
      reclaim: [
        "Funds returned",
        "Recovery of the expired reserve to the buyer is verified.",
      ],
      sync: [
        "Recovery record updated",
        "The record matches the verified recovery. This action did not send another payment.",
      ],
      revoke: [
        "Allowance revoked",
        "This transaction set the collector allowance to zero. It did not move reserved funds.",
      ],
    };
    [title, message] = outcomes[action];
  } else if (tx.phase === "error") {
    title = "Action failed or remains unverified";
    if (tx.hash)
      message +=
        " Verify this transaction before retrying. Do not submit again while it remains unresolved.";
  } else {
    title = "Checking transaction";
    message = `${name}: checking the wallet and verified payment state.`;
  }
  return <TransactionNotice tx={{ ...tx, message }} title={title} />;
}
