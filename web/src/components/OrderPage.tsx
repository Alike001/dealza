import { OrderDetails, OrderHistory, OrderShare } from "./OrderDetails";
import { CompletedPaymentEvidence } from "./CompletedPaymentEvidence";
import { CheckoutFeedback } from "./CheckoutFeedback";
import {
  ActionExplanation,
  CheckoutProgress,
  CompletedOutcome,
  completedOrderTitle,
  checkoutStatus,
  recommendedAction,
  StateExplanation,
} from "./PaymentGuidance";
import { usePendingRequest } from "../lib/usePendingRequest";
import { useHistory } from "../lib/useHistory";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hash } from "viem";
import {
  allowedActions,
  descriptionHash,
  friendlyError,
  idleTx,
  money,
  sameAddress,
  shortAddress,
  type Action,
  type OrderSnapshot,
  type TxState,
} from "../lib/domain";
import type { PaymentGateway } from "../lib/gateway";
import { useWallet } from "../lib/wallet";
import {
  AddressLink,
  dateTime,
  Icon,
  PendingIntegration,
  RiskNote,
  SectionTitle,
} from "./common";

const labels: Record<Action, string> = {
  approve: "1. Allow exactly this USDC amount",
  preApprove: "2. Authorize these payment terms",
  fund: "3. Reserve the USDC",
  release: "Approve release to seller",
  delivery: "Record delivery evidence",
  dispute: "Open a dispute",
  resolveRelease: "Decide: pay the seller",
  resolveVoid: "Decide: return to buyer",
  cancel: "Cancel / return reserved payment",
  reclaim: "Recover expired funds",
  sync: "Update recovery record",
  revoke: "Revoke unused USDC allowance",
};
export function OrderPage({
  id,
  description,
  api,
}: {
  id: Hash;
  description: string;
  api: PaymentGateway;
}) {
  const wallet = useWallet();
  const pending = usePendingRequest(wallet.session, api.deployment?.operator);
  const scope = `${id}:${wallet.session?.account}:${wallet.session?.chainId}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const [snapshot, setSnapshot] = useState<OrderSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const historyScope =
    snapshot?.id === id
      ? `${id}:${wallet.session?.account ?? "public"}:${wallet.session?.chainId ?? 84532}`
      : null;
  const orderHistory = useHistory(
    historyScope,
    (before, signal) => api.activity(snapshot!, before, signal),
    (event) => `${event.hash.toLowerCase()}:${event.logIndex}`,
  );
  const { page: history, refresh: refreshHistory } = orderHistory;
  const [feedbackAction, setFeedbackAction] = useState<Action | null>(null);
  const [reviewerChoice, setReviewerChoice] = useState<Action | null>(null);
  const actionHeading = useRef<HTMLHeadingElement>(null);
  const [tx, setTx] = useState<TxState>(idleTx);
  const [acknowledged, setAcknowledged] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [proposed, setProposed] = useState<Action | null>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (proposed) confirmationHeading.current?.focus();
  }, [proposed]);
  const inFlight = useRef(false);
  const readRevision = useRef(0);
  const busy = ["checking", "signature", "pending"].includes(tx.phase);
  const applyVerified = useCallback(
    (verified: OrderSnapshot) => {
      if (verified.id !== id) return;
      readRevision.current++;
      setSnapshot((old) =>
        !old || verified.block >= old.block ? verified : old,
      );
      setError("");
    },
    [id],
  );
  useEffect(() => {
    const confirmed = (event: Event) => {
      applyVerified((event as CustomEvent<OrderSnapshot>).detail);
    };
    window.addEventListener("dealza:confirmed-order", confirmed);
    return () =>
      window.removeEventListener("dealza:confirmed-order", confirmed);
  }, [applyVerified]);
  const refresh = useCallback(async () => {
    const revision = ++readRevision.current;
    if (!api.deployment) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await api.loadOrder(id);
      if (revision === readRevision.current)
        setSnapshot((old) => (!old || next.block >= old.block ? next : old));
    } catch (e) {
      if (revision === readRevision.current) {
        setError(friendlyError(e));
      }
    } finally {
      if (revision === readRevision.current) setLoading(false);
    }
  }, [api, id]);
  useEffect(() => {
    let ignore = false;
    setSnapshot(null);
    setAcknowledged(false);
    setReviewerChoice(null);
    setFeedbackAction(null);
    setEvidence("");
    setProposed(null);
    setTx(idleTx);
    setError("");
    setLoading(!!api.deployment);
    const read = async () => {
      if (!api.deployment) return;
      const revision = ++readRevision.current;
      try {
        const s = await api.loadOrder(id);
        if (!ignore && revision === readRevision.current) {
          setSnapshot((old) => (!old || s.block >= old.block ? s : old));
          setError("");
        }
      } catch (e) {
        if (!ignore && revision === readRevision.current) {
          setError(friendlyError(e));
        }
      } finally {
        if (!ignore && revision === readRevision.current) setLoading(false);
      }
    };
    void read();
    const interval = window.setInterval(() => void read(), 15_000);
    return () => {
      ignore = true;
      readRevision.current++;
      clearInterval(interval);
    };
  }, [id, api]);
  useEffect(() => {
    setAcknowledged(false);
    setReviewerChoice(null);
    setFeedbackAction(null);
    setEvidence("");
    setProposed(null);
    setTx(idleTx);
  }, [wallet.session?.account, wallet.session?.chainId]);
  const execute = async () => {
    const action = proposed;
    if (
      !action ||
      !wallet.session ||
      !snapshot ||
      !acknowledged ||
      busy ||
      pending ||
      inFlight.current
    )
      return;
    inFlight.current = true;
    const submittedScope = activeScope.current;
    const safeUpdate = (state: TxState) => {
      if (activeScope.current !== submittedScope) return;
      if (state.phase === "confirmed" && state.snapshot?.id === id) {
        // Receipt verification already read these exact financial effects.
        // Invalidate older in-flight reads before exposing the confirmation.
        applyVerified(state.snapshot);
      }
      setTx(state);
    };
    setTx({
      phase: "checking",
      message: "Checking your wallet and the latest payment state…",
    });
    setProposed(null);
    try {
      await api.act(action, id, wallet.session, safeUpdate, evidence);
      if (activeScope.current !== submittedScope) return;
      await refresh();
      refreshHistory();
      setEvidence("");
    } catch (e) {
      if (activeScope.current !== submittedScope) return;
      setTx((old) => ({
        phase: "error",
        message: friendlyError(e),
        hash: (e as { hash?: Hash }).hash ?? old.hash,
      }));
      await refresh();
    } finally {
      inFlight.current = false;
    }
  };
  const s = snapshot;
  const matchedTerms =
    !!s &&
    !!description &&
    descriptionHash(description) === s.order.descriptionHash;
  let actions: Action[] = [];
  let status = "";
  let verifiedState = false;
  if (s) {
    try {
      status = checkoutStatus(s);
      verifiedState = true;
      actions = error ? [] : allowedActions(s, wallet.session?.account);
    } catch (e) {
      status = friendlyError(e);
    }
  }
  const completed = !!s && verifiedState && [4, 5, 7].includes(s.derived);
  const buyer =
    !!s && sameAddress(wallet.session?.account, s.order.payment.payer);
  const seller =
    !!s && sameAddress(wallet.session?.account, s.order.payment.receiver);
  const reviewer =
    !!s && sameAddress(wallet.session?.account, s.order.reviewer);
  const nextAction = s ? recommendedAction(actions, s) : undefined;
  const deciding =
    actions.includes("resolveRelease") && actions.includes("resolveVoid");
  const recommended = deciding
    ? reviewerChoice && actions.includes(reviewerChoice)
      ? reviewerChoice
      : undefined
    : nextAction;
  const otherActions = actions.filter(
    (a) =>
      a !== recommended &&
      !["resolveRelease", "resolveVoid", "dispute"].includes(a),
  );
  const blocked =
    !acknowledged ||
    pending ||
    busy ||
    loading ||
    wallet.session?.chainId !== 84532;
  const needsEvidence = (a: Action) =>
    ["delivery", "dispute", "resolveRelease", "resolveVoid"].includes(a);
  const actionLabels = {
    ...labels,
    cancel:
      s?.order.status === 1
        ? "Cancel unfunded order"
        : "Return reserve to buyer",
  };
  const propose = (action: Action) => {
    setFeedbackAction(action);
    setTx(idleTx);
    setProposed(action);
  };
  const openDetails = (id: string) => {
    const element = document.getElementById(id) as HTMLDetailsElement | null;
    if (element) {
      element.open = true;
      element.querySelector("summary")?.focus();
    }
  };
  return (
    <main id="main" tabIndex={-1} className="page guided-checkout">
      <a href="#/orders" className="back">
        ← All orders
      </a>
      <SectionTitle
        eyebrow="SHARED ORDER"
        title={completed ? "Payment outcome." : "Your payment, step by step."}
      />
      {!api.deployment ? (
        <>
          <PendingIntegration />
          <div className="panel">
            <h2>This order can’t be verified yet.</h2>
            <p>
              No order or financial status is assumed until the verified
              operator is configured.
            </p>
            <p className="mono">Order ID: {id}</p>
          </div>
          <RiskNote />
        </>
      ) : (
        <>
          {loading && !s && (
            <div role="status" className="panel loading">
              Reading the order and payment protocol…
            </div>
          )}
          {error && (
            <div className="notice danger" role="alert">
              <strong>
                {s
                  ? "Latest update unavailable."
                  : "We couldn’t verify this order."}
              </strong>
              {s && (
                <p>
                  Showing the last verified payment record. Actions are paused
                  until a fresh read succeeds. Retrying automatically.
                </p>
              )}
              <p>{error}</p>
              <button
                className="button secondary"
                onClick={() => void refresh()}
              >
                Try again
              </button>
            </div>
          )}
          {s && (
            <>
              <div className="checkout-layout">
                <section
                  className="panel payment-sheet"
                  aria-label="Order summary"
                >
                  <div className="sheet-heading">
                    <span className="eyebrow">ORDER {shortAddress(id)}</span>
                    <span
                      className={`badge ${status === "Paid to seller" ? "green" : ""}`}
                    >
                      {status}
                    </span>
                  </div>
                  <div className="price">
                    {money(s.order.payment.maxAmount)} <span>USDC</span>
                  </div>
                  <p className="price-caption">
                    Test USDC on Base Sepolia · Platform fee 0 USDC
                  </p>
                  <dl className="summary-seller">
                    <dt>Seller</dt>
                    <dd>
                      <AddressLink value={s.order.payment.receiver} />
                    </dd>
                  </dl>
                  {[4, 5, 7].includes(s.derived) ? (
                    <p className="settled-deadline">
                      No active payment deadline.
                    </p>
                  ) : (
                    <div className="checkout-deadline">
                      <Icon name="clock" size={18} />
                      <div>
                        <span>
                          {s.order.status === 1
                            ? "Reserve before"
                            : s.derived === 6
                              ? "Review deadline passed · buyer recovery"
                              : "Release or resolve before"}
                        </span>
                        <strong>
                          {dateTime(
                            s.order.status === 1
                              ? s.order.payment.preApprovalExpiry
                              : s.order.payment.authorizationExpiry,
                          )}
                        </strong>
                      </div>
                    </div>
                  )}
                  {!error &&
                    verifiedState &&
                    (s.order.status !== 1 || s.derived === 6) && (
                      <StateExplanation snapshot={s} />
                    )}
                  {!matchedTerms && (
                    <div className="notice warning">
                      <strong>
                        {description
                          ? "These linked terms do not match the order."
                          : "The description isn’t included in this link."}
                      </strong>
                      <p>
                        {description
                          ? "This linked text is unverified. Ask the seller for the original full agreement link and compare its fingerprint. Do not rely on mismatched text."
                          : "This link contains the order ID but no agreement text. Only the fingerprint is onchain. Ask the seller for the original full link; you can still verify the payment outcome and receipts."}
                      </p>
                    </div>
                  )}
                  <button
                    className="text-button agreement-link"
                    onClick={() => openDetails("agreement-details")}
                  >
                    Read agreement and participants{" "}
                    <Icon name="arrow" size={16} />
                  </button>
                </section>
                <section
                  className="panel action-panel"
                  aria-labelledby="next-action-heading"
                >
                  <span className="eyebrow">
                    {completed
                      ? error
                        ? "LAST VERIFIED OUTCOME"
                        : "COMPLETED ORDER"
                      : "YOUR NEXT STEP"}
                  </span>
                  <h2
                    id="next-action-heading"
                    ref={actionHeading}
                    tabIndex={-1}
                  >
                    {completed
                      ? completedOrderTitle(s)
                      : !wallet.session
                        ? "Connect to take part."
                        : buyer
                          ? "You’re the buyer."
                          : seller
                            ? "You’re the seller."
                            : reviewer
                              ? "You’re the reviewer."
                              : "Viewing this order."}
                  </h2>
                  {!wallet.session && !completed && (
                    <p>
                      You can read this order without connecting. Use the named
                      buyer, seller, or reviewer wallet to take its permitted
                      actions.
                    </p>
                  )}
                  {wallet.session && wallet.session.chainId !== 84532 && (
                    <div className="notice warning">
                      <p>Switch to Base Sepolia to continue.</p>
                      <button
                        className="button"
                        onClick={() => void wallet.switchNetwork()}
                      >
                        Switch network
                      </button>
                    </div>
                  )}
                  {buyer && s.order.status === 1 && nextAction && (
                    <p>
                      {nextAction === "approve"
                        ? `Allow exactly ${money(s.order.payment.maxAmount)} USDC. This sets a spending cap; no USDC moves.`
                        : nextAction === "preApprove"
                          ? "Authorize this agreement’s exact payment terms. No USDC moves."
                          : nextAction === "fund"
                            ? "Reserve funds in the protocol. The seller is not paid until an allowed release."
                            : "Clear the existing allowance before setting an exact spending cap."}
                    </p>
                  )}
                  {buyer && s.order.status === 1 && (
                    <p className="field-help">
                      Buyer balance: {money(s.buyerBalance)} test USDC.{" "}
                      {s.buyerGas === 0n
                        ? "You need test ETH for gas."
                        : "Your wallet estimates the ETH gas fee."}
                      {s.buyerBalance < s.order.payment.maxAmount && (
                        <>
                          {" "}
                          Insufficient test USDC.{" "}
                          <a
                            href="https://faucet.circle.com/"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Get free test USDC ↗
                          </a>
                        </>
                      )}
                      {s.allowance > 0n &&
                        s.allowance !== s.order.payment.maxAmount &&
                        " Review or revoke the existing allowance before setting an exact cap."}
                    </p>
                  )}
                  {seller && s.order.status === 1 && s.derived !== 6 && (
                    <p>
                      Waiting for the buyer to reserve funds. Share this order
                      link with the named buyer.
                    </p>
                  )}
                  {seller && nextAction === "delivery" && (
                    <p>
                      Record delivery evidence for the buyer and reviewer.
                      Evidence does not release payment.
                    </p>
                  )}
                  {seller && s.derived === 6 && (
                    <p>
                      {s.held > 0n
                        ? "The review deadline has passed. You may still return the reserve to the buyer using the controls below."
                        : "The reserve window is closed. This order cannot be funded."}
                    </p>
                  )}
                  {buyer && s.order.status === 2 && s.derived === 2 && (
                    <p>
                      Review delivery before releasing funds. If there’s a
                      problem, open a dispute for the agreed reviewer.
                    </p>
                  )}
                  {buyer && s.order.status === 3 && s.derived === 3 && (
                    <p>
                      The agreed reviewer must decide the dispute. Share your
                      original evidence with them before the deadline.
                    </p>
                  )}
                  {reviewer && !deciding && ![4, 5, 7].includes(s.derived) && (
                    <p>
                      {s.derived === 6
                        ? "The review window is closed. A reviewer decision is no longer permitted."
                        : "A decision becomes available only when this order is disputed."}
                    </p>
                  )}
                  {completed && (
                    <>
                      <CompletedOutcome snapshot={s} />
                      <CompletedPaymentEvidence id={id} />
                      <button
                        className="text-button"
                        onClick={() => openDetails("history-events")}
                      >
                        View verified order history
                      </button>
                    </>
                  )}
                  {s.held > 0n && <RiskNote />}
                  {s.order.status === 3 && (
                    <div className="dispute-context">
                      <h3>Dispute and evidence</h3>
                      <p>
                        Ask both parties for the original evidence. Onchain
                        references do not prove delivery.
                      </p>
                      {history?.items
                        .filter((event) =>
                          ["DisputeOpened", "DeliveryNoted"].includes(
                            event.name,
                          ),
                        )
                        .slice(0, 3)
                        .map((event) => (
                          <p
                            className="mono"
                            key={`${event.hash}-${event.logIndex}`}
                          >
                            <span>
                              {event.name === "DisputeOpened"
                                ? "Dispute reference: "
                                : "Delivery evidence: "}
                            </span>
                            {event.detail}
                          </p>
                        ))}
                      <p className="field-help">
                        {[4, 5, 6, 7].includes(s.derived)
                          ? "The review window is closed. Evidence references remain available for inspection."
                          : history?.next !== undefined ||
                              !history ||
                              orderHistory.error
                            ? "Evidence history is partial or unavailable. Check earlier activity before deciding."
                            : "Review the recorded references and originals before deciding."}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => openDetails("history-events")}
                      >
                        Read dispute and evidence history
                      </button>
                    </div>
                  )}
                  {actions.length > 0 && (
                    <>
                      {!proposed && deciding && (
                        <fieldset className="reviewer-choices">
                          <legend>Choose the full payment outcome</legend>
                          {(["resolveVoid", "resolveRelease"] as Action[]).map(
                            (action) => (
                              <label key={action}>
                                <input
                                  type="radio"
                                  name="reviewer-decision"
                                  checked={reviewerChoice === action}
                                  disabled={busy || pending || loading}
                                  onChange={() => setReviewerChoice(action)}
                                />
                                {actionLabels[action]}
                              </label>
                            ),
                          )}
                        </fieldset>
                      )}
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={acknowledged}
                          disabled={busy || pending}
                          onChange={(e) => setAcknowledged(e.target.checked)}
                        />
                        <span>
                          I reviewed the{" "}
                          {matchedTerms
                            ? "verified order terms"
                            : "original offchain agreement and its fingerprint"}
                          , recipient, reviewer, and expiry. I understand this
                          action uses a wallet transaction.
                        </span>
                      </label>
                      {(proposed
                        ? needsEvidence(proposed)
                        : nextAction === "delivery" || deciding) && (
                        <>
                          <label htmlFor="evidence">
                            Evidence or decision reference
                          </label>
                          <textarea
                            id="evidence"
                            value={evidence}
                            disabled={busy || pending}
                            onChange={(e) => setEvidence(e.target.value)}
                            maxLength={1600}
                            rows={3}
                            placeholder="A reference you can share with the buyer and reviewer…"
                          />
                          <p className="field-help">
                            Only a hash is recorded. Keep and share the original
                            separately. Do not include private personal
                            information.
                          </p>
                        </>
                      )}
                      {!proposed && (
                        <>
                          {recommended && (
                            <button
                              className="button recommended-action"
                              disabled={blocked}
                              onClick={() => propose(recommended)}
                            >
                              {deciding
                                ? "Review reviewer decision"
                                : actionLabels[recommended]}
                            </button>
                          )}
                          {deciding && !recommended && (
                            <p className="field-help">
                              Choose release or return above. Neither outcome is
                              selected for you.
                            </p>
                          )}
                          {actions.includes("dispute") && (
                            <button
                              className="text-button dispute-action"
                              disabled={blocked}
                              onClick={() => propose("dispute")}
                            >
                              Open a dispute
                            </button>
                          )}
                          {otherActions.length > 0 && (
                            <details className="secondary-actions">
                              <summary>
                                {s.order.status === 1
                                  ? "Other permitted actions · cancellation and allowance"
                                  : "Cancellation, allowance and recovery controls"}
                              </summary>
                              <p className="field-help">
                                These are independently permitted actions.
                                Review their effects before continuing.
                              </p>
                              <div className="action-buttons">
                                {otherActions.map((action) => (
                                  <button
                                    className="text-button"
                                    key={action}
                                    disabled={blocked}
                                    onClick={() => propose(action)}
                                  >
                                    {actionLabels[action]}
                                  </button>
                                ))}
                              </div>
                            </details>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {pending && !busy && (
                    <p className="notice warning">
                      A saved wallet request is unresolved. Use the transaction
                      recheck above before submitting again.
                    </p>
                  )}
                  {wallet.session && !actions.length && !error && (
                    <p className="field-help">
                      No payment action is available to this wallet in the
                      current order state.
                    </p>
                  )}
                  {proposed && (
                    <div
                      className="confirm-action"
                      role="region"
                      aria-label="Review wallet action"
                    >
                      <h3 ref={confirmationHeading} tabIndex={-1}>
                        {actionLabels[proposed]}
                      </h3>
                      <ActionExplanation action={proposed} snapshot={s} />
                      {[
                        "resolveRelease",
                        "resolveVoid",
                        "release",
                        "cancel",
                        "reclaim",
                        "fund",
                      ].includes(proposed) && (
                        <dl className="details decision-details">
                          <dt>Exact amount</dt>
                          <dd>{money(s.order.payment.maxAmount)} USDC</dd>
                          <dt>
                            {["resolveRelease", "release"].includes(proposed)
                              ? "Pay seller"
                              : proposed === "fund"
                                ? "Reserve in protocol TokenStore"
                                : "Return to buyer (if reserved)"}
                          </dt>
                          <dd>
                            <AddressLink
                              value={
                                ["resolveRelease", "release"].includes(proposed)
                                  ? s.order.payment.receiver
                                  : proposed === "fund"
                                    ? s.tokenStore
                                    : s.order.payment.payer
                              }
                              full
                            />
                          </dd>
                          <dt>Outcome</dt>
                          <dd>
                            {proposed === "resolveRelease"
                              ? "Reviewer releases the full reserve. This cannot be undone by Dealza."
                              : proposed === "resolveVoid"
                                ? "Reviewer returns the full reserve and closes the agreement. This decision cannot be undone."
                                : proposed === "reclaim"
                                  ? "Protocol expiry recovery; a later sync only updates the order record."
                                  : proposed === "cancel"
                                    ? "Cancel the agreement; this is not a refund of captured funds."
                                    : proposed === "fund"
                                      ? "Funds are reserved; seller is not paid."
                                      : "Seller receives the payment. Dealza cannot reverse capture."}
                          </dd>
                        </dl>
                      )}
                      {proposed === "dispute" && (
                        <div className="notice warning">
                          <strong>Expiry keeps running</strong>
                          <p>
                            Share your original evidence with the agreed
                            reviewer. You trust this wallet to make a final
                            decision; the evidence hash alone does not prove
                            delivery.
                          </p>
                          <AddressLink value={s.order.reviewer} full />
                        </div>
                      )}
                      <div className="button-row">
                        <button
                          className="button"
                          disabled={
                            blocked ||
                            !actions.includes(proposed) ||
                            (needsEvidence(proposed) && !evidence.trim())
                          }
                          onClick={() => void execute()}
                        >
                          Continue to wallet
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            setProposed(null);
                            actionHeading.current?.focus();
                          }}
                        >
                          Go back
                        </button>
                      </div>
                    </div>
                  )}

                  <CheckoutFeedback tx={tx} action={feedbackAction} />
                  {verifiedState &&
                    !error &&
                    (buyer || (!wallet.session && s.order.status === 1)) &&
                    ![4, 5, 7].includes(s.derived) && (
                      <CheckoutProgress snapshot={s} />
                    )}
                </section>
              </div>
              <div className="checkout-meta">
                <OrderShare
                  id={id}
                  description={matchedTerms ? description : ""}
                />
                <p className="field-help verified-at">
                  Last verified: {dateTime(s.chainTime)} · Block{" "}
                  {s.block.toString()}.{" "}
                  {loading ? "Refreshing…" : "Refreshes every 15 seconds."}
                </p>
              </div>
              <div className="checkout-details">
                <OrderDetails
                  snapshot={s}
                  description={description}
                  matchedTerms={matchedTerms}
                />
                <OrderHistory state={orderHistory} />
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
