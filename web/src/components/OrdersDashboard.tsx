import { completedPaymentHref } from "../lib/completedPayment";
import { useState, type FormEvent } from "react";
import type { Address } from "viem";
import type { PaymentGateway } from "../lib/gateway";
import { isOrderId, money, sameAddress, shortAddress } from "../lib/domain";
import { useHistory } from "../lib/useHistory";
import { useWallet } from "../lib/wallet";
import { Icon, PendingIntegration, RiskNote, SectionTitle } from "./common";

// Presentation only: status strings come from the existing verified gateway.
function orderTone(status: string) {
  return (
    (
      {
        "Paid to seller": "order-released",
        Cancelled: "order-voided",
        "In review": "order-disputed",
        "Payment reserved": "order-reserved",
        "Recovery available": "order-recoverable",
        "Recovered by buyer": "order-recovered",
        "Awaiting payment": "order-created",
        "Payment window closed": "order-voided",
      } as Record<string, string>
    )[status] || ""
  );
}

function OrderList({
  api,
  account,
  chainId,
}: {
  api: PaymentGateway;
  account: Address;
  chainId: number;
}) {
  const { page, loading, error, older, retry, refresh } = useHistory(
    `${account}:${chainId}:${api.deployment?.operator}`,
    (before, signal) => api.listOrders(account, before, signal),
    (item) => item.id.toLowerCase(),
  );
  return (
    <>
      {loading && (
        <p role="status">Reading your order events from Base Sepolia…</p>
      )}
      {error && (
        <div className="notice danger" role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={() => void retry()}>
            Retry order history
          </button>
        </div>
      )}
      {page && page.items.length === 0 && (
        <div className="empty-state">
          <span className="round-icon">
            <Icon name="link" />
          </span>
          <h3>No orders in this block range.</h3>
          <p>
            Create your first order, open a shared link, or load earlier
            records.
          </p>
        </div>
      )}
      <div className="order-list">
        {page?.items.map((order) => (
          <a
            href={`#/order/${order.id}`}
            className={`order-row ${orderTone(order.status)}`}
            key={order.id}
          >
            <div className="order-symbol" aria-hidden="true">
              <Icon name="link" size={19} />
            </div>
            <div>
              <strong>Order {shortAddress(order.id)}</strong>
              <small className="order-role">
                {sameAddress(order.seller, account)
                  ? "You are selling"
                  : sameAddress(order.buyer, account)
                    ? "You are buying"
                    : "You are reviewing"}{" "}
                · {order.status}
              </small>
            </div>
            <span>
              {money(order.amount)} <small>USDC</small>
            </span>
            <span className="sr-only">Open agreement</span>
            <Icon name="arrow" size={19} />
          </a>
        ))}
      </div>
      {page?.next !== undefined && (
        <button
          className="button secondary"
          onClick={() => void older()}
          disabled={loading}
        >
          Load earlier orders
        </button>
      )}
      {page && (
        <p className="field-help" role="status">
          {error
            ? "History is incomplete. Retry the failed page."
            : page.next !== undefined
              ? "Recent orders only. Older blocks have not been checked yet."
              : "End of order history — checked back to the verified deployment."}{" "}
          Latest checked block: {page.through.toString()}. Status is read from
          the current contract state.
        </p>
      )}
      <button className="text-button" onClick={refresh} disabled={loading}>
        Refresh order history
      </button>
    </>
  );
}
export function OrdersDashboard({ api }: { api: PaymentGateway }) {
  const wallet = useWallet();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const open = (event: FormEvent) => {
    event.preventDefault();
    const found = input
      .trim()
      .match(/(?:\/order\/)?(0x[0-9a-fA-F]{64})(?:\?|$)/);
    if (!found || !isOrderId(found[1])) {
      setError("Paste the complete Dealza order ID or checkout link.");
      return;
    }
    let terms = "";
    try {
      terms = new URL(input).hash.split("?")[1] || "";
    } catch {
      /* Plain order ID. */
    }
    location.hash = `/order/${found[1]}${terms ? "?" + terms : ""}`;
  };
  return (
    <main id="main" tabIndex={-1} className="page dashboard-page">
      <SectionTitle eyebrow="YOUR AGREEMENTS" title="Every deal, in view.">
        <p>
          Manage the orders you’re buying, selling, or reviewing. These are real
          records from Base Sepolia.
        </p>
      </SectionTitle>
      <p className="judge-entry">
        First visit?{" "}
        <a href={completedPaymentHref}>View a real completed payment</a> without
        connecting, or paste a shared checkout link below.
      </p>
      {!api.deployment && <PendingIntegration />}
      <section className="workspace panel">
        <div className="workspace-heading">
          <div>
            <span className="eyebrow">YOUR SPACE</span>
            <h2>Your order activity</h2>
          </div>
          <a className="button secondary" href="#/create">
            <Icon name="plus" size={17} />
            New order
          </a>
        </div>
        <div className="workspace-grid">
          <div className="orders-area">
            {api.deployment && wallet.session ? (
              <OrderList
                key={`${wallet.session.account}:${wallet.session.chainId}`}
                api={api}
                account={wallet.session.account}
                chainId={wallet.session.chainId}
              />
            ) : (
              <div className="empty-state">
                <span className="round-icon">
                  <Icon name="link" size={24} />
                </span>
                <h3>
                  {api.deployment
                    ? "Your orders begin here."
                    : "A good agreement is the first step."}
                </h3>
                <p>
                  {api.deployment
                    ? "Connect a buyer, seller, or reviewer wallet to find your orders. You can also open a link without connecting."
                    : "Prepare your terms now. Confirmed orders will appear here once the testnet integration is available."}
                </p>
                <a href="#/create" className="underlined-link">
                  {api.deployment
                    ? "Create an order"
                    : "Prepare your first order"}{" "}
                  →
                </a>
              </div>
            )}
          </div>
          <form className="open-order" onSubmit={open}>
            <span className="eyebrow">ALREADY HAVE A LINK?</span>
            <h3>
              Pick up where
              <br />
              the conversation left off.
            </h3>
            <label htmlFor="order-link">Order link or ID</label>
            <input
              id="order-link"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError("");
              }}
              placeholder="Paste a checkout link or 0x…"
              required
              spellCheck={false}
            />
            <button className="button" type="submit">
              Open order <Icon name="arrow" size={17} />
            </button>
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            <p className="field-help">No wallet needed to view an agreement.</p>
          </form>
        </div>
      </section>
      <RiskNote />
    </main>
  );
}
