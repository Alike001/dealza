import { useEffect, useState } from "react";
import { PendingTransaction } from "./components/PendingTransaction";
import { WalletControl } from "./components/WalletControl";
import { OrdersDashboard } from "./components/OrdersDashboard";
import { LandingPage } from "./components/LandingPage";
import { gateway, type PaymentGateway } from "./lib/gateway";
import { isOrderId } from "./lib/domain";
import { useWallet } from "./lib/wallet";
import { explorerAddress, network } from "./lib/config";
import { CreateOrder } from "./components/CreateOrder";
import { OrderPage } from "./components/OrderPage";
import { AddressLink, RiskNote, SectionTitle } from "./components/common";

function routeFromHash() {
  const [path, query = ""] = window.location.hash.slice(1).split("?");
  const description =
    new URLSearchParams(query).get("terms")?.slice(0, 1600) || "";
  return { path: path || "/", description };
}
function Help({ api }: { api: PaymentGateway }) {
  return (
    <main id="main" tabIndex={-1} className="page narrow-page">
      <a className="back" href="#/orders">
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
      window.requestAnimationFrame(() =>
        document.getElementById("main")?.focus(),
      );
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
            Home
          </a>
          <a
            href="#/orders"
            aria-current={route.path === "/orders" ? "page" : undefined}
          >
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
        <LandingPage api={api} />
      ) : route.path === "/orders" ? (
        <OrdersDashboard api={api} />
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
        <main id="main" tabIndex={-1} className="page">
          <SectionTitle title="This link doesn’t look right.">
            <p>
              Ask the seller for the complete Dealza checkout link. No payment
              has been started.
            </p>
          </SectionTitle>
          <a className="button" href="#/orders">
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
          <a href="#/orders">Your orders</a>
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
