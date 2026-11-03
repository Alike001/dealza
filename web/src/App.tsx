import { PendingTransaction } from "./components/PendingTransaction";
import { useHistory } from "./lib/useHistory";
import { useEffect, useState, type FormEvent } from "react";
import type { Address } from "viem";
import { gateway, type PaymentGateway } from "./lib/gateway";
import {
  friendlyError,
  isOrderId,
  money,
  sameAddress,
  shortAddress,
} from "./lib/domain";
import { useWallet } from "./lib/wallet";
import { explorerAddress, network } from "./lib/config";
import { CreateOrder } from "./components/CreateOrder";
import { OrderPage } from "./components/OrderPage";
import {
  AddressLink,
  eth,
  Icon,
  PendingIntegration,
  RiskNote,
  SectionTitle,
} from "./components/common";

function routeFromHash() {
  const [path, query = ""] = window.location.hash.slice(1).split("?");
  const description =
    new URLSearchParams(query).get("terms")?.slice(0, 1600) || "";
  return { path: path || "/", description };
}
function WalletControl({ api }: { api: PaymentGateway }) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [balances, setBalances] = useState<{
    usdc: bigint;
    eth: bigint;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let ignore = false;
    setBalances(null);
    setError("");
    if (wallet.session)
      void api
        .balances(wallet.session.account)
        .then((result) => {
          if (!ignore) setBalances(result);
        })
        .catch((e) => {
          if (!ignore) setError(friendlyError(e));
        });
    return () => {
      ignore = true;
    };
  }, [
    api,
    wallet.session?.account,
    wallet.session?.chainId,
    wallet.session?.provider,
  ]);
  return (
    <div className="wallet-control">
      <button
        className="button wallet-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="wallet" size={17} />
        {wallet.session
          ? shortAddress(wallet.session.account)
          : "Connect wallet"}
      </button>
      {open && (
        <section className="wallet-popover" aria-label="Wallet connection">
          <h2>{wallet.session ? "Your wallet" : "Choose your wallet"}</h2>
          {!wallet.choices.length && (
            <p>
              No injected wallet found. Install{" "}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noreferrer"
              >
                MetaMask
              </a>{" "}
              or another compatible browser wallet, then reload. On mobile, open
              this page inside your wallet’s browser.
            </p>
          )}
          {!wallet.session && wallet.choices.length > 0 && (
            <>
              <label htmlFor="wallet-choice">Browser wallet</label>
              <select
                id="wallet-choice"
                value={wallet.selected}
                onChange={(e) => wallet.select(e.target.value)}
              >
                {wallet.choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.name}
                  </option>
                ))}
              </select>
              <button
                className="button"
                disabled={wallet.connecting}
                onClick={() => void wallet.connect()}
              >
                {wallet.connecting
                  ? "Waiting for wallet…"
                  : "Connect selected wallet"}
              </button>
              <p className="field-help">
                Connection shares your public address. It does not sign or pay
                anything.
              </p>
            </>
          )}
          {wallet.session && (
            <>
              <AddressLink value={wallet.session.account} full />
              <p className="field-help">
                {wallet.session.chainId === 84532
                  ? "Connected to Base Sepolia"
                  : "Wrong network — Base Sepolia is required"}
              </p>
              {wallet.session.chainId !== 84532 && (
                <button
                  className="button"
                  onClick={() => void wallet.switchNetwork()}
                >
                  Switch to Base Sepolia
                </button>
              )}
              <dl className="wallet-balances">
                <dt>Test USDC on Base Sepolia</dt>
                <dd>{balances ? money(balances.usdc) : "—"}</dd>
                <dt>Test ETH for gas</dt>
                <dd>{balances ? eth(balances.eth) : "—"}</dd>
              </dl>
              {error && (
                <p role="alert" className="inline-error">
                  Balance read failed: {error}
                </p>
              )}
              <button
                className="button secondary"
                onClick={() => {
                  wallet.disconnect();
                  setOpen(false);
                }}
              >
                Disconnect this session
              </button>
              <p className="field-help">
                You can revoke this site’s access separately in your wallet.
              </p>
            </>
          )}
          {wallet.error && (
            <p role="alert" className="inline-error">
              {wallet.error}
            </p>
          )}
          <button
            className="text-button close-wallet"
            onClick={() => setOpen(false)}
          >
            Close wallet panel
          </button>
        </section>
      )}
    </div>
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
          <a href={`#/order/${order.id}`} className="order-row" key={order.id}>
            <div className="order-symbol">
              <Icon name="link" size={19} />
            </div>
            <div>
              <strong>Order {shortAddress(order.id)}</strong>
              <small>
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
function Home({ api }: { api: PaymentGateway }) {
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
    <main id="main" className="page home-page">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-dot" /> FOR DEALS THAT START IN A CONVERSATION
          </span>
          <h1>
            A little more trust.
            <br />
            <em>A much better deal.</em>
          </h1>
          <p>
            Turn “I’ll send it” into a clear agreement. Share an order, reserve
            USDC, and let the buyer decide when to release payment.
          </p>
          <div className="button-row">
            <a className="button" href="#/create">
              Create an order <Icon name="arrow" size={18} />
            </a>
            <a href="#/help" className="underlined-link">
              How it works
            </a>
          </div>
          <div className="hero-assurance">
            <Icon name="shield" size={16} />
            <span>Your wallets · Clear terms · No automatic release</span>
          </div>
        </div>
        <div
          className="hero-art"
          aria-label="An agreement connects the buyer, seller, and reviewer"
        >
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <div className="agreement-card">
            <div className="mini-wordmark">
              d<span>·</span>
            </div>
            <span className="eyebrow">A DEAL, IN AGREEMENT</span>
            <div className="agreement-line">
              <span>Buyer</span>
              <span className="line-dots" />
              <Icon name="check" size={15} />
            </div>
            <div className="agreement-line">
              <span>Seller</span>
              <span className="line-dots" />
              <Icon name="check" size={15} />
            </div>
            <div className="agreement-line">
              <span>Agreed reviewer</span>
              <span className="line-dots" />
              <Icon name="check" size={15} />
            </div>
            <div className="agreement-bottom">
              <Icon name="shield" size={20} />
              <span>
                Clear terms.
                <br />
                <strong>People stay in control.</strong>
              </span>
            </div>
          </div>
          <div className="floating-note">
            <Icon name="link" size={17} />
            <span>Made to share anywhere</span>
          </div>
        </div>
      </section>
      {!api.deployment && <PendingIntegration />}
      <section className="workspace panel">
        <div className="workspace-heading">
          <div>
            <span className="eyebrow">YOUR SPACE</span>
            <h2>Every order, on the same page.</h2>
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
      <section className="how-strip" aria-label="How Dealza works">
        <article>
          <span>01 / AGREE</span>
          <h3>Put the terms in writing.</h3>
          <p>
            Name the buyer, set the amount and deadlines, and agree on a
            reviewer.
          </p>
        </article>
        <article>
          <span>02 / RESERVE</span>
          <h3>Set the payment aside.</h3>
          <p>
            The buyer reserves USDC inside the payment protocol. The seller
            isn’t paid yet.
          </p>
        </article>
        <article>
          <span>03 / DECIDE</span>
          <h3>Release with intention.</h3>
          <p>
            The buyer approves payment, or the reviewer decides a dispute before
            expiry.
          </p>
        </article>
      </section>
      <RiskNote />
    </main>
  );
}
function Help({ api }: { api: PaymentGateway }) {
  return (
    <main id="main" className="page narrow-page">
      <a className="back" href="#/">
        ← All orders
      </a>
      <SectionTitle
        eyebrow="BEFORE YOU MAKE A DEAL"
        title="Know what you’re agreeing to."
      >
        <p>
          Dealza makes payment permissions clear. It can’t make a stranger
          trustworthy or verify that a package arrived.
        </p>
      </SectionTitle>
      <section className="panel help-content">
        <h2>For sellers</h2>
        <p>
          Create an agreement for a specific buyer wallet. You choose a reviewer
          before payment, with the buyer’s agreement. Share the link through
          WhatsApp, Telegram, X, or anywhere else. A delivery notice records
          your evidence; it never releases funds.
        </p>
        <h2>For buyers</h2>
        <p>
          You need an injected wallet such as MetaMask, Base Sepolia test ETH
          for gas, and Circle test USDC. You sign three separate transactions:
          an exact USDC allowance to the collector, authorization of the payment
          terms, and reservation. None of these pays the seller. Your later
          release transaction does.
        </p>
        <h2>If there’s a disagreement</h2>
        <p>
          Either party can open a dispute before expiry. Ordinary buyer release
          is then blocked. The agreed reviewer can pay the full amount to the
          seller or return the full reserve to the buyer. The reviewer is
          trusted, can make an incorrect decision, and cannot be replaced. No
          platform administrator can override the agreement.
        </p>
        <RiskNote />
        <h2>Cancellation and recovery</h2>
        <p>
          Either party can cancel an unfunded order. Once funded, the seller can
          voluntarily return the reserve. A buyer seeking an early return needs
          seller cooperation or a reviewer decision. At expiry the buyer can
          reclaim uncaptured funds directly from CPP; this is not automatic and
          still needs gas.
        </p>
        <h2>After release</h2>
        <p>
          The seller owns the captured payment. Dealza does not guarantee a
          refund or provide chargebacks or insurance. The protocol’s captured
          accounting amount is not retained refund liquidity. Circle can pause,
          blacklist, or upgrade USDC, which can prevent transfers or recovery.
        </p>
        <h2>Testnet only</h2>
        <p>
          This version uses Base Sepolia, chain 84532. Test assets are for
          testing. Use the{" "}
          <a
            href="https://docs.base.org/get-started/get-funds"
            target="_blank"
            rel="noreferrer"
          >
            official faucet guide
          </a>{" "}
          for test ETH and{" "}
          <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">
            Circle’s faucet
          </a>{" "}
          for test USDC; select Base Sepolia.
        </p>
        <h2>Privacy and records</h2>
        <p>
          Order terms travel in the checkout link and are matched to an
          immutable hash. Don’t put private delivery details in the agreement.
          Evidence and decisions are committed as hashes; keep their original
          content available for the reviewer. Wallet addresses, amounts, hashes,
          and events are public. Drafts stay in this browser and do not create
          orders.
        </p>
        <h2>Verify the protocol</h2>
        <p>
          Reserved USDC stays in Base Commerce Payments Protocol, not
          DealzaOperator.{" "}
          <a
            href={explorerAddress(network.escrow)}
            target="_blank"
            rel="noreferrer"
          >
            Inspect the escrow
          </a>
          ,{" "}
          <a
            href={explorerAddress(network.collector)}
            target="_blank"
            rel="noreferrer"
          >
            pre-approval collector
          </a>
          , or{" "}
          <a
            href={explorerAddress(network.usdc)}
            target="_blank"
            rel="noreferrer"
          >
            Circle test USDC
          </a>
          .{" "}
          {api.deployment ? (
            <>
              DealzaOperator: <AddressLink value={api.deployment.operator} />
              .{" "}
            </>
          ) : (
            <>DealzaOperator is currently awaiting verified deployment. </>
          )}
          The application checks its configured code before enabling any
          payment.
        </p>
      </section>
    </main>
  );
}
export default function App({ api = gateway }: { api?: PaymentGateway }) {
  const wallet = useWallet();
  const [route, setRoute] = useState(routeFromHash);
  useEffect(() => {
    const change = () => {
      setRoute(routeFromHash());
      window.scrollTo?.({ top: 0 });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const orderId = route.path.startsWith("/order/") ? route.path.slice(7) : "";
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          const main = document.getElementById("main");
          main?.setAttribute("tabindex", "-1");
          main?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="testnet-bar">
        <span className="tiny-dot" /> BASE SEPOLIA TESTNET{" "}
        <span className="bar-divider">/</span> Test assets only. Real
        permissions.
      </div>
      <header className="site-header">
        <a href="#/" className="wordmark" aria-label="Dealza home">
          dealza<span>·</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#/" aria-current={route.path === "/" ? "page" : undefined}>
            Your orders
          </a>
          <a
            href="#/create"
            aria-current={route.path === "/create" ? "page" : undefined}
          >
            Create an order
          </a>
          <a
            href="#/help"
            aria-current={route.path === "/help" ? "page" : undefined}
          >
            How it works
          </a>
        </nav>
        <WalletControl api={api} />
      </header>
      {wallet.session && wallet.session.chainId !== 84532 && (
        <div className="network-banner" role="alert">
          <span>
            You’re connected to another network. Dealza only uses Base Sepolia.
          </span>
          <button onClick={() => void wallet.switchNetwork()}>
            Switch to Base Sepolia →
          </button>
        </div>
      )}
      <PendingTransaction api={api} />
      {route.path === "/" ? (
        <Home api={api} />
      ) : route.path === "/create" ? (
        <CreateOrder api={api} />
      ) : route.path === "/help" ? (
        <Help api={api} />
      ) : isOrderId(orderId) ? (
        <OrderPage
          key={orderId}
          id={orderId}
          description={route.description}
          api={api}
        />
      ) : (
        <main id="main" className="page">
          <SectionTitle title="This link doesn’t look right.">
            <p>
              Ask the seller for the complete Dealza checkout link. No payment
              has been started.
            </p>
          </SectionTitle>
          <a className="button" href="#/">
            Return to your orders
          </a>
        </main>
      )}
      <footer className="site-footer">
        <div>
          <a href="#/" className="wordmark">
            dealza<span>·</span>
          </a>
          <p>Clear agreements. Human decisions.</p>
        </div>
        <div className="footer-links">
          <a href="#/help">Safeguards & limitations</a>
          <a
            href="https://github.com/base/commerce-payments/tree/v1.1.0"
            target="_blank"
            rel="noreferrer"
          >
            Built on Base Payments ↗
          </a>
          <span>Base Sepolia · Zero platform fee</span>
        </div>
      </footer>
    </>
  );
}
