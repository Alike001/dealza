import type { Hash } from "viem";
import type { Activity, OrderSnapshot } from "../lib/domain";
import { money, shareLink, shortAddress } from "../lib/domain";
import { explorerTx, network } from "../lib/config";
import type { useHistory } from "../lib/useHistory";
import { AddressLink, CopyButton, dateTime, Icon } from "./common";
import { CompletedPaymentEvidence } from "./CompletedPaymentEvidence";

export const eventNames: Record<string, string> = {
  OrderCreated: "Order terms recorded",
  OrderFunded: "Reservation recorded",
  PaymentAuthorized: "USDC reserved in the protocol",
  DeliveryNoted: "Seller submitted a delivery claim",
  DisputeOpened: "Dispute opened",
  DisputeResolved: "Reviewer decision recorded",
  PaymentCaptured: "USDC paid to seller",
  OrderReleased: "Release recorded",
  PaymentVoided: "Reserved USDC returned by operator",
  OrderVoided: "Order closed — inspect payment state for any return",
  PaymentReclaimed: "Buyer reclaimed expired funds",
  RecoverySynced: "Recovery record updated",
};

export function OrderDetails({
  snapshot: s,
  description,
  matchedTerms,
}: {
  snapshot: OrderSnapshot;
  description: string;
  matchedTerms: boolean;
}) {
  return (
    <>
      <details className="panel checkout-disclosure" id="agreement-details">
        <summary>Agreement and participants</summary>
        <div className="disclosure-content">
          <h2>The agreed terms</h2>
          {matchedTerms ? (
            <p className="terms-text">{description}</p>
          ) : (
            <p>
              Obtain the original agreement from the seller and compare its
              fingerprint. Linked text is not verified.
            </p>
          )}
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
            <dt>Amount</dt>
            <dd>
              {money(s.order.payment.maxAmount)} test USDC · Platform fee 0 USDC
            </dd>
            <dt>Terms fingerprint</dt>
            <dd className="mono">{s.order.descriptionHash}</dd>
            <dt>Reserve before</dt>
            <dd>{dateTime(s.order.payment.preApprovalExpiry)}</dd>
            <dt>Release or resolve before</dt>
            <dd>{dateTime(s.order.payment.authorizationExpiry)}</dd>
          </dl>
          <p className="field-help">
            These terms, participants, amount and deadlines cannot be changed.
            The reviewer is trusted and cannot be replaced.
          </p>
        </div>
      </details>
      <details className="panel checkout-disclosure">
        <summary>Payment verification and custody</summary>
        <div className="disclosure-content">
          <dl className="details">
            <dt>Order ID</dt>
            <dd className="mono">{s.id}</dd>
            {s.order.status === 5 && (
              <>
                <dt>Contract state</dt>
                <dd>Voided (5)</dd>
              </>
            )}
            <dt>Payment hash</dt>
            <dd className="mono">{s.order.paymentHash}</dd>
            <dt>Reserved in protocol</dt>
            <dd>{money(s.held)} USDC</dd>
            <dt>Captured (accounting)</dt>
            <dd>{money(s.captured)} USDC</dd>
            <dt>Operator</dt>
            <dd>
              <AddressLink value={s.order.payment.operator} full />
            </dd>
            <dt>USDC token</dt>
            <dd>
              <AddressLink value={s.order.payment.token} full />
            </dd>
            <dt>Collector / approval spender</dt>
            <dd>
              <AddressLink value={network.collector} full />
            </dd>
            <dt>CPP escrow</dt>
            <dd>
              <AddressLink value={network.escrow} full />
            </dd>
            <dt>Protocol TokenStore</dt>
            <dd>
              <AddressLink value={s.tokenStore} full />
            </dd>
          </dl>
          <p className="field-help">
            The TokenStore’s shared balance is {money(s.storeBalance)} USDC
            across this operator’s orders. This order’s reserve is listed
            separately above. Dealza does not hold the USDC.
          </p>
        </div>
      </details>
      <details className="panel checkout-disclosure">
        <summary>Deadlines and expiry safeguards</summary>
        <div className="disclosure-content">
          <dl className="details">
            <dt>Reserve before</dt>
            <dd>{dateTime(s.order.payment.preApprovalExpiry)}</dd>
            <dt>Release or reviewer decision before</dt>
            <dd>{dateTime(s.order.payment.authorizationExpiry)}</dd>
            <dt>Buyer recovery available from</dt>
            <dd>{dateTime(s.order.payment.authorizationExpiry)}</dd>
          </dl>
          <p>
            Disputes do not pause expiry. After expiry, the buyer can recover
            uncaptured funds with a transaction and gas; recovery is not
            automatic. Captured funds cannot be recovered this way.
          </p>
          <p className="field-help">
            No automatic delivery check, guaranteed reviewer decision,
            insurance, or guaranteed refund after capture.
          </p>
        </div>
      </details>
    </>
  );
}

export function OrderShare({
  id,
  description,
}: {
  id: Hash;
  description: string;
}) {
  const link = shareLink(id, description);
  return (
    <div className="share-row">
      <CopyButton value={link} />
      <details>
        <summary>Show share link</summary>
        <input
          readOnly
          aria-label="Share link"
          value={link}
          onFocus={(e) => e.target.select()}
        />
      </details>
    </div>
  );
}

export function OrderHistory({
  id,
  state,
}: {
  id: Hash;
  state: ReturnType<typeof useHistory<Activity>>;
}) {
  const { page: history, loading, error } = state;
  return (
    <section
      className="panel order-history"
      id="order-history"
      aria-labelledby="order-history-title"
    >
      <h2 id="order-history-title">Verifiable order history</h2>
      <p className="field-help">
        {error
          ? "History is incomplete."
          : history?.next !== undefined
            ? "Partial history — older blocks have not been checked."
            : !history
              ? "History coverage has not been verified yet."
              : "History checked back to the verified deployment."}{" "}
        Current payment status comes from the verified state above.
      </p>
      {error && (
        <p className="inline-error" role="alert">
          History could not load: {error}
          <button
            className="text-button"
            onClick={() => void state.retry()}
            disabled={loading}
          >
            Retry history
          </button>
        </p>
      )}
      <details className="checkout-disclosure" id="history-events">
        <summary>View events and earlier activity</summary>
        <div className="disclosure-content">
          <p className="field-help">
            Confirmed order and protocol events. Evidence references record
            claims; they do not verify delivery. An empty block range does not
            mean no transactions occurred.
          </p>
          {loading && <p role="status">Reading confirmed activity…</p>}
          {history && !history.items.length && (
            <p>
              {history.next !== undefined || error
                ? "No matching events in the queried blocks. Older or unavailable blocks may contain activity."
                : "No matching order events found back to the verified deployment."}
            </p>
          )}
          <ol className="activity-list">
            {history?.items.map((event) => (
              <li key={`${event.hash}-${event.logIndex}`}>
                <div>
                  <strong>{eventNames[event.name] || event.name}</strong>
                  <p className="mono">{event.detail}</p>
                  <small>
                    {dateTime(event.timestamp)} · Block {event.block.toString()}
                  </small>
                </div>
                <a
                  href={explorerTx(event.hash)}
                  aria-label={`${eventNames[event.name] || event.name} transaction on Base Sepolia explorer (opens a new tab)`}
                  target="_blank"
                  rel="noreferrer"
                  className="address"
                >
                  {shortAddress(event.hash)} <Icon name="external" size={13} />
                </a>
              </li>
            ))}
          </ol>
          {history?.next !== undefined && (
            <button
              className="button secondary"
              onClick={() => void state.older()}
              disabled={loading}
            >
              Load earlier activity
            </button>
          )}
          {history && (
            <p className="field-help" role="status">
              {error
                ? "This history is incomplete; the failed page has not been skipped."
                : history.next !== undefined
                  ? "Recent activity only. Load earlier activity to check older blocks."
                  : "End of history — checked back to the verified deployment."}{" "}
              Latest checked block: {history.through.toString()}.
            </p>
          )}
          <button
            className="text-button"
            onClick={state.refresh}
            disabled={loading}
          >
            Refresh history
          </button>
          <CompletedPaymentEvidence id={id} />
        </div>
      </details>
    </section>
  );
}
