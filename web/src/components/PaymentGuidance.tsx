import type { Action, OrderSnapshot } from "../lib/domain";
import { money } from "../lib/domain";
import { network } from "../lib/config";
import { AddressLink, dateTime } from "./common";

// These components explain already-verified state. They never enable an action.
export function FundingSteps({ snapshot: s }: { snapshot: OrderSnapshot }) {
  const amount = money(s.order.payment.maxAmount);
  return (
    <div className="funding-steps">
      <ol>
        <li>
          <span className="step-number">1</span>
          <div>
            <h4>Allow exactly {amount} USDC</h4>
            <p>
              Set the collector’s allowance cap. This does not reserve funds or
              pay the seller.
            </p>
            <p className="step-state">
              {s.allowance === s.order.payment.maxAmount
                ? "Exact allowance read onchain"
                : s.allowance > 0n
                  ? "Existing allowance: review or revoke before continuing"
                  : "No allowance currently set"}
            </p>
          </div>
        </li>
        <li>
          <span className="step-number">2</span>
          <div>
            <h4>Authorize this agreement’s payment</h4>
            <p>
              Approve the exact payment terms for this buyer, recipient, amount,
              and deadlines. No USDC moves yet.
            </p>
            <p className="step-state">
              {s.preApproved
                ? "Payment authorization read onchain"
                : "Payment terms not yet authorized"}
            </p>
          </div>
        </li>
        <li>
          <span className="step-number">3</span>
          <div>
            <h4>Reserve {amount} USDC</h4>
            <p>
              Move the payment into the protocol’s TokenStore. Buyer release or
              a permitted reviewer decision is still needed to pay the seller.
            </p>
          </div>
        </li>
      </ol>
      <details>
        <summary>Verify approval spender and cap</summary>
        <ApprovalDetails amount={amount} />
      </details>
    </div>
  );
}

function ApprovalDetails({ amount }: { amount: string }) {
  return (
    <dl className="details approval-details">
      <dt>Network</dt>
      <dd>Base Sepolia · 84532</dd>
      <dt>Token</dt>
      <dd>
        <AddressLink value={network.usdc} full />
      </dd>
      <dt>Spender (existing collector)</dt>
      <dd>
        <AddressLink value={network.collector} full />
      </dd>
      <dt>Approval cap</dt>
      <dd>{amount} USDC · exact amount, not unlimited</dd>
    </dl>
  );
}

export function ActionExplanation({
  action,
  snapshot: s,
}: {
  action: Action;
  snapshot: OrderSnapshot;
}) {
  const amount = money(s.order.payment.maxAmount);
  if (action === "approve")
    return (
      <>
        <p>
          This sets the existing collector’s allowance to exactly {amount} USDC.
          It does not move USDC. Your wallet may show the raw token approval
          amount.
        </p>
        <ApprovalDetails amount={amount} />
      </>
    );
  if (action === "preApprove")
    return (
      <>
        <p>
          Authorize this agreement’s exact payment terms in the collector. This
          transaction does not reserve USDC or pay the seller.
        </p>
        <dl className="details">
          <dt>Payment amount</dt>
          <dd>{amount} USDC</dd>
          <dt>Recipient</dt>
          <dd>
            <AddressLink value={s.order.payment.receiver} full />
          </dd>
          <dt>Authorization target</dt>
          <dd>
            <AddressLink value={network.collector} full />
          </dd>
          <dt>Reserve before</dt>
          <dd>{dateTime(s.order.payment.preApprovalExpiry)}</dd>
          <dt>Payment fingerprint</dt>
          <dd className="mono">{s.order.paymentHash}</dd>
        </dl>
      </>
    );
  if (action === "delivery")
    return (
      <p>
        This records a hash of the seller’s delivery claim. It does not verify
        delivery, change the reserve, or release payment. Keep the original
        evidence available to the buyer and reviewer.
      </p>
    );
  if (action === "dispute")
    return (
      <p>
        This asks the fixed reviewer to decide the disagreement and blocks
        ordinary buyer release. It does not extend expiry. The reviewer must
        decide before {dateTime(s.order.payment.authorizationExpiry)}.
      </p>
    );
  if (action === "resolveRelease" || action === "resolveVoid")
    return (
      <p>
        You are deciding as the named reviewer: the full {amount} USDC{" "}
        {action === "resolveRelease"
          ? "is paid to the seller"
          : "reserve returns to the buyer"}
        . This decision must complete before expiry. A release is not a
        guarantee of a refund later.
      </p>
    );
  if (action === "release")
    return (
      <p>
        This sends {amount} USDC to the seller. After capture, Dealza cannot
        guarantee a refund. Review the recipient and agreement before
        continuing.
      </p>
    );
  if (action === "fund")
    return (
      <p>
        This reserves {amount} USDC in the payment protocol. It does not release
        payment to the seller.
      </p>
    );
  if (action === "reclaim")
    return (
      <p>
        This asks CPP to return uncaptured expired funds to the recorded buyer,
        including during an unresolved dispute. It requires a buyer transaction
        and test ETH for gas. Captured funds cannot be recovered through this
        action.
      </p>
    );
  if (action === "cancel")
    return (
      <p>
        This cancels an unfunded order or returns any uncaptured reserve to the
        recorded buyer when permitted. Already captured funds cannot be returned
        through this action.
      </p>
    );
  if (action === "revoke")
    return (
      <p>
        This sets the collector’s unused USDC allowance to zero. It does not
        cancel an order or move reserved funds.
      </p>
    );
  return (
    <p>
      This updates the order’s recovery record after a verified protocol return.
      It does not send another payment.
    </p>
  );
}

export function StateExplanation({ snapshot: s }: { snapshot: OrderSnapshot }) {
  if (s.order.status === 4)
    return (
      <p className="state-explanation">
        Released · The payment record shows the seller was paid. No reserve
        remains for this agreement.
      </p>
    );
  if (s.derived === 7)
    return (
      <p className="state-explanation">
        The buyer’s expired reserve was recovered. This is a payment record, not
        a delivery outcome.
      </p>
    );
  if (s.derived === 6 && s.held > 0n)
    return (
      <p className="state-explanation">
        Recovery is available to the named buyer. Expiry has passed; recovery
        still requires a wallet transaction and gas.
      </p>
    );
  if (s.order.status === 3)
    return (
      <p className="state-explanation">
        Disputed · Ordinary buyer release is paused. The fixed reviewer may
        decide a full release or return before expiry. The deadline keeps
        running.
      </p>
    );
  if (s.order.status === 2)
    return (
      <p className="state-explanation">
        Reserved · The seller has not been paid. Recording delivery evidence
        does not release the reserve.
      </p>
    );
  if (s.order.status === 5)
    return (
      <p className="state-explanation">
        Voided · This agreement has no reserved payment remaining.
      </p>
    );
  return (
    <p className="state-explanation">
      Created · Review the agreement before authorizing any payment.
    </p>
  );
}
