import {
  ActionExplanation,
  FundingSteps,
  StateExplanation,
} from "./PaymentGuidance";
import { usePendingRequest } from "../lib/usePendingRequest";
import { useHistory } from "../lib/useHistory";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hash } from "viem";
import { explorerTx } from "../lib/config";
import {
  allowedActions,
  descriptionHash,
  financialStatus,
  friendlyError,
  idleTx,
  money,
  sameAddress,
  shareLink,
  shortAddress,
  type Action,
  type OrderSnapshot,
  type TxState,
} from "../lib/domain";
import type { PaymentGateway } from "../lib/gateway";
import { useWallet } from "../lib/wallet";
import {
  AddressLink,
  CopyButton,
  dateTime,
  Icon,
  PendingIntegration,
  RiskNote,
  SectionTitle,
  TransactionNotice,
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
const eventNames: Record<string, string> = {
  OrderCreated: "Order terms recorded",
  OrderFunded: "Reservation recorded",
  PaymentAuthorized: "USDC reserved in the protocol",
  DeliveryNoted: "Seller submitted a delivery claim",
  DisputeOpened: "Dispute opened",
  DisputeResolved: "Reviewer decision recorded",
  PaymentCaptured: "USDC paid to seller",
  OrderReleased: "Release recorded",
  PaymentVoided: "Reserved USDC returned by operator",
  OrderVoided: "Order cancelled",
  PaymentReclaimed: "Buyer reclaimed expired funds",
  RecoverySynced: "Recovery record updated",
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
  const {
    page: history,
    loading: historyLoading,
    error: historyError,
    older: moreHistory,
    retry: retryHistory,
    refresh: refreshHistory,
  } = useHistory(
    historyScope,
    (before, signal) => api.activity(snapshot!, before, signal),
    (event) => `${event.hash.toLowerCase()}:${event.logIndex}`,
  );
  const [tx, setTx] = useState<TxState>(idleTx);
  const [acknowledged, setAcknowledged] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [proposed, setProposed] = useState<Action | null>(null);
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
  if (s) {
    try {
      status = financialStatus(s);
      actions = error ? [] : allowedActions(s, wallet.session?.account);
    } catch (e) {
      status = friendlyError(e);
    }
  }
  return (
    <main id="main" tabIndex={-1} className="page">
      <a href="#/orders" className="back">
        ← All orders
      </a>
      <SectionTitle
        eyebrow="SHARED ORDER"
        title="One agreement. A clear next step."
      >
        <p>
          Review the terms and the people involved before making a wallet
          transaction.
        </p>
      </SectionTitle>
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
            <div className="checkout-layout">
              <div>
                <section className="panel payment-sheet">
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
                  <div className="checkout-deadline">
                    <Icon name="clock" size={18} />
                    <div>
                      <span>Release / review deadline</span>
                      <strong>
                        {dateTime(s.order.payment.authorizationExpiry)}
                      </strong>
                    </div>
                  </div>
                  {!error &&
                    [
                      "Paid to seller",
                      "Cancelled",
                      "Recovered by buyer",
                      "Recovery available",
                      "In review",
                      "Payment reserved",
                      "Payment window closed",
                      "Awaiting payment",
                    ].includes(status) && <StateExplanation snapshot={s} />}
                  <div className="terms-block">
                    <h2>The agreed terms</h2>
                    {matchedTerms ? (
                      <p className="terms-text">{description}</p>
                    ) : (
                      <div className="notice warning">
                        <strong>
                          {description
                            ? "These linked terms do not match the order."
                            : "The description isn’t included in this link."}
                        </strong>
                        <p>
                          Ask the seller for the original agreement and compare
                          its fingerprint below. Do not rely on unverified text.
                        </p>
                      </div>
                    )}
                    <details>
                      <summary>View immutable terms fingerprint</summary>
                      <p className="mono">{s.order.descriptionHash}</p>
                    </details>
                  </div>
                  <dl className="details">
                    <dt>Seller receives</dt>
                    <dd>
                      <AddressLink value={s.order.payment.receiver} full />
                    </dd>
                    <dt>Named buyer</dt>
                    <dd>
                      <AddressLink value={s.order.payment.payer} full />
                    </dd>
                    <dt>Agreed reviewer</dt>
                    <dd>
                      <AddressLink value={s.order.reviewer} full />
                    </dd>
                    <dt>Reserved in protocol</dt>
                    <dd>{money(s.held)} USDC</dd>
                    <dt>Captured (accounting)</dt>
                    <dd>{money(s.captured)} USDC</dd>
                    <dt>Payment hash</dt>
                    <dd className="mono">{s.order.paymentHash}</dd>
                  </dl>
                  <details>
                    <summary>Verify where the reserve is held</summary>
                    <p>
                      The protocol’s TokenStore for this operator:{" "}
                      <AddressLink value={s.tokenStore} full />.
                    </p>
                    <p className="field-help">
                      Its current shared balance is {money(s.storeBalance)} USDC
                      across all this operator’s orders. This order’s authorized
                      reserve is shown separately above.
                    </p>
                  </details>
                  <div className="share-row">
                    <CopyButton
                      value={shareLink(id, matchedTerms ? description : "")}
                    />
                    <details>
                      <summary>Show share link</summary>
                      <input
                        readOnly
                        aria-label="Share link"
                        value={shareLink(id, matchedTerms ? description : "")}
                        onFocus={(e) => e.target.select()}
                      />
                    </details>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <Icon name="clock" />
                    <h2>The payment timeline</h2>
                  </div>
                  <ol className="timeline">
                    <li>
                      <span className="timeline-dot" />
                      <div>
                        <h3>
                          Reserve before{" "}
                          {dateTime(s.order.payment.preApprovalExpiry)}
                        </h3>
                        <p>
                          The named buyer allows USDC, authorizes these terms,
                          and reserves funds. Reservation does not pay the
                          seller.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span className="timeline-dot" />
                      <div>
                        <h3>
                          Release or resolve before{" "}
                          {dateTime(s.order.payment.authorizationExpiry)}
                        </h3>
                        <p>
                          The buyer can approve release while undisputed. During
                          a dispute, only the agreed reviewer can decide.
                          Delivery evidence alone never pays.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span className="timeline-dot" />
                      <div>
                        <h3>
                          Buyer recovery from{" "}
                          {dateTime(s.order.payment.authorizationExpiry)}
                        </h3>
                        <p>
                          Uncaptured funds become reclaimable directly from the
                          protocol, including during an unresolved dispute.
                          Recovery needs a buyer transaction and test ETH.
                        </p>
                      </div>
                    </li>
                  </ol>
                  <p className="field-help">
                    Chain time at last read: {dateTime(s.chainTime)} · Block{" "}
                    {s.block.toString()}.{" "}
                    {loading ? "Refreshing…" : "Refreshes every 15 seconds."}
                  </p>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <Icon name="link" />
                    <h2>Verifiable order history</h2>
                  </div>
                  <p className="field-help">
                    Confirmed contract events from the configured operator and
                    protocol, including direct expiry recovery. Delivery claims
                    are evidence submissions, not delivery verification.
                  </p>
                  {historyLoading && (
                    <p role="status">Reading confirmed activity…</p>
                  )}
                  {historyError && (
                    <p className="inline-error" role="alert">
                      History is incomplete. History could not load:{" "}
                      {historyError}
                      <button
                        className="text-button"
                        onClick={() => void retryHistory()}
                        disabled={historyLoading}
                      >
                        Retry history
                      </button>
                    </p>
                  )}
                  {history && !history.items.length && (
                    <p>No matching activity in this block range.</p>
                  )}
                  <ol className="activity-list">
                    {history?.items.map((event) => (
                      <li key={`${event.hash}-${event.logIndex}`}>
                        <div>
                          <strong>
                            {eventNames[event.name] || event.name}
                          </strong>
                          <p className="mono">{event.detail}</p>
                          <small>
                            {dateTime(event.timestamp)} · Block{" "}
                            {event.block.toString()}
                          </small>
                        </div>
                        <a
                          href={explorerTx(event.hash)}
                          aria-label={`${eventNames[event.name] || event.name} transaction on Base Sepolia explorer (opens a new tab)`}
                          target="_blank"
                          rel="noreferrer"
                          className="address"
                        >
                          {shortAddress(event.hash)}{" "}
                          <Icon name="external" size={13} />
                        </a>
                      </li>
                    ))}
                  </ol>
                  {history?.next !== undefined && (
                    <button
                      className="button secondary"
                      onClick={() => void moreHistory()}
                      disabled={historyLoading}
                    >
                      Load earlier activity
                    </button>
                  )}
                  {history && (
                    <p className="field-help" role="status">
                      {historyError
                        ? "This history is incomplete; the failed page has not been skipped."
                        : history.next !== undefined
                          ? "Recent activity only. Load earlier activity to check older blocks."
                          : "End of history — checked back to the verified deployment."}{" "}
                      Latest checked block: {history.through.toString()}.
                    </p>
                  )}
                  <button
                    className="text-button"
                    onClick={refreshHistory}
                    disabled={historyLoading}
                  >
                    Refresh history
                  </button>
                </section>
              </div>
              <aside className="checkout-aside">
                <section className="panel action-panel">
                  <span className="eyebrow">YOUR NEXT STEP</span>
                  <h2>
                    {!wallet.session
                      ? "Connect to take part."
                      : sameAddress(
                            wallet.session.account,
                            s.order.payment.payer,
                          )
                        ? "You’re the buyer."
                        : sameAddress(
                              wallet.session.account,
                              s.order.payment.receiver,
                            )
                          ? "You’re the seller."
                          : sameAddress(
                                wallet.session.account,
                                s.order.reviewer,
                              )
                            ? "You’re the reviewer."
                            : "Viewing this order."}
                  </h2>
                  {!wallet.session && (
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
                  {sameAddress(
                    wallet.session?.account,
                    s.order.payment.payer,
                  ) &&
                    s.order.status === 1 && (
                      <div className="funding-checklist">
                        <h3>Reserve in three wallet steps</h3>
                        <FundingSteps snapshot={s} />
                        <p>
                          Buyer balance: {money(s.buyerBalance)} test USDC.{" "}
                          {s.buyerGas === 0n
                            ? "You need test ETH for gas."
                            : "Test ETH is available; your wallet estimates fees."}
                        </p>
                        {s.buyerBalance < s.order.payment.maxAmount && (
                          <a
                            href="https://faucet.circle.com/"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Get free test USDC ↗
                          </a>
                        )}
                        <p className="field-help">
                          If an old allowance remains, revoke it before setting
                          a new exact allowance.
                        </p>
                      </div>
                    )}
                  {actions.length > 0 && (
                    <>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={acknowledged}
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
                      {actions.some((a) =>
                        [
                          "delivery",
                          "dispute",
                          "resolveRelease",
                          "resolveVoid",
                        ].includes(a),
                      ) && (
                        <>
                          <label htmlFor="evidence">
                            Evidence or decision reference
                          </label>
                          <textarea
                            id="evidence"
                            value={evidence}
                            onChange={(e) => setEvidence(e.target.value)}
                            maxLength={1600}
                            rows={3}
                            placeholder="A reference to evidence you can share with the reviewer…"
                          />
                          <p className="field-help">
                            Only a hash is recorded. Keep and share the original
                            separately. Do not include private personal
                            information.
                          </p>
                        </>
                      )}
                      <div className="action-buttons">
                        {actions.map((action) => (
                          <button
                            key={action}
                            className={`button ${["revoke", "cancel", "dispute", "delivery", "sync"].includes(action) ? "secondary" : ""}`}
                            disabled={
                              !acknowledged ||
                              pending ||
                              busy ||
                              loading ||
                              wallet.session?.chainId !== 84532 ||
                              ([
                                "delivery",
                                "dispute",
                                "resolveRelease",
                                "resolveVoid",
                              ].includes(action) &&
                                !evidence.trim())
                            }
                            onClick={() => setProposed(action)}
                          >
                            {labels[action]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {wallet.session && !actions.length && !error && (
                    <p>
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
                      <h3>{labels[proposed]}</h3>
                      <ActionExplanation action={proposed} snapshot={s} />
                      <div className="button-row">
                        <button
                          className="button"
                          disabled={
                            !acknowledged ||
                            pending ||
                            busy ||
                            wallet.session?.chainId !== 84532
                          }
                          onClick={() => void execute()}
                        >
                          Continue to wallet
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setProposed(null)}
                        >
                          Go back
                        </button>
                      </div>
                    </div>
                  )}
                  <TransactionNotice tx={tx} />
                </section>
                <RiskNote />
                <div className="aside-note small">
                  <h3>What Dealza can’t promise</h3>
                  <p>
                    No automatic delivery check, guaranteed reviewer decision,
                    insurance, or guaranteed refund after capture. Your reviewer
                    is trusted and cannot be replaced.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </>
      )}
    </main>
  );
}
