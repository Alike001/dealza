import type { Action, OrderSnapshot } from "../lib/domain";
import { financialStatus, money } from "../lib/domain";
import { network } from "../lib/config";
import { AddressLink, dateTime } from "./common";

// Copy only: the underlying verified contract/financial status and permissions stay unchanged.
export function checkoutStatus(snapshot: OrderSnapshot): string {
  const verified = financialStatus(snapshot);
  return verified === "Cancelled" && snapshot.collected
    ? "Returned to buyer"
    : verified;
}

// Presentation only: these indicators never enable or disable protocol actions.
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
  if (s.order.status === 1 && s.derived === 6)
    return (
      <p className="state-explanation">
        The reserve deadline has passed. This unfunded order can no longer
        receive a payment.
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
        Reserved · The seller has not been paid.
      </p>
    );
  if (s.order.status === 5)
    return (
      <p className="state-explanation">
        {checkoutStatus(s) === "Returned to buyer"
          ? "Returned to buyer · The previously reserved USDC was returned. No reserve or captured payment remains. Contract state: Voided (5)."
          : "Cancelled · No funds were reserved for this order. Contract state: Voided (5)."}
      </p>
    );
  return (
    <p className="state-explanation">
      Created · Review the agreement before authorizing any payment.
    </p>
  );
}

export function CheckoutProgress({ snapshot: s }: { snapshot: OrderSnapshot }) {
  const reserved = s.collected;
  const terminal = [4, 5, 7].includes(s.derived);
  const closed = s.chainTime >= s.order.payment.preApprovalExpiry;
  const complete = [
    reserved || s.allowance === s.order.payment.maxAmount,
    reserved || s.preApproved,
    reserved,
  ];
  const current =
    terminal || closed || reserved ? -1 : complete.findIndex((done) => !done);
  const steps = [
    "Allow exact USDC amount",
    "Authorize payment terms",
    "Reserve funds",
  ];
  return (
    <section className="checkout-progress" aria-label="Payment progress">
      <h3>Reserve in three wallet steps</h3>
      <ol>
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={i === current ? "step" : undefined}
            data-complete={complete[i]}
          >
            <span className="step-number" aria-hidden="true">
              {complete[i] ? "✓" : i + 1}
            </span>
            <div>
              <strong>{label}</strong>
              <span className="step-state">
                {complete[i]
                  ? "Verified"
                  : terminal || closed
                    ? "Not completed"
                    : i === current
                      ? "Next step"
                      : "Not completed"}
              </span>
            </div>
          </li>
        ))}
      </ol>
      <p className="field-help">
        {terminal
          ? "This payment has reached its verified financial outcome. No active reserve deadline remains."
          : s.chainTime >= s.order.payment.authorizationExpiry
            ? "Expiry has passed. Uncaptured funds require buyer recovery; release and reviewer decisions are closed."
            : reserved
              ? "All three funding steps are verified."
              : closed
                ? "The reserve deadline has passed. This agreement can no longer be funded."
                : "Progress comes from verified chain reads. A submitted request does not complete a step."}
      </p>
    </section>
  );
}

// Ranking changes emphasis only. All other independently permitted actions stay available.
export function recommendedAction(
  actions: Action[],
  s: OrderSnapshot,
): Action | undefined {
  if (s.order.status === 1) {
    if (actions.includes("approve")) return "approve";
    if (s.allowance !== s.order.payment.maxAmount && actions.includes("revoke"))
      return "revoke";
    if (actions.includes("preApprove")) return "preApprove";
    if (actions.includes("fund")) return "fund";
    return undefined;
  }
  return (["reclaim", "delivery", "release", "sync"] as Action[]).find(
    (action) => actions.includes(action),
  );
}
