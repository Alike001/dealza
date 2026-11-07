import { GenuineJourneys } from "./GenuineJourneys";
import type { PaymentGateway } from "../lib/gateway";
import { LandingDetails } from "./LandingDetails";
import { Icon, PendingIntegration } from "./common";

const steps = [
  [
    "01",
    "Agree before paying.",
    "The seller names the buyer, writes the terms, sets deadlines, and names a reviewer both people trust.",
  ],
  [
    "02",
    "Share one agreement.",
    "Send the checkout link in your conversation. The buyer can read the terms, amount, recipient, and reviewer without connecting a wallet.",
  ],
  [
    "03",
    "Reserve test USDC.",
    "The buyer allows the exact amount, authorizes the payment terms, then reserves funds in Base’s Commerce Payments Protocol. The seller is not paid yet.",
  ],
  [
    "04",
    "Make a human decision.",
    "The seller may record delivery evidence. The buyer can release payment while undisputed, or the agreed reviewer decides a dispute before expiry.",
  ],
];

export function LandingPage({ api }: { api: PaymentGateway }) {
  return (
    <main id="main" tabIndex={-1} className="page landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="eyebrow">
            <span className="tiny-dot" /> FOR DEALS THAT START IN A CONVERSATION
          </p>
          <h1 id="landing-title">
            Make online deals clearer <em>before money moves.</em>
          </h1>
          <p className="hero-description">
            Online deals made in DMs need clearer payment agreements and a way
            to resolve disputes. Agree on the terms and a trusted reviewer
            before reserving funds.
          </p>
          <div className="button-row">
            <a className="button" href="#/create">
              Create an agreement <Icon name="arrow" size={18} />
            </a>
            <a className="underlined-link" href="#/orders">
              Open your orders
            </a>
          </div>
          <GenuineJourneys />
          <p className="hero-caption">
            Base Sepolia demo · Test USDC only · No platform fee
          </p>
        </div>
        <div
          className="agreement-diagram"
          aria-label="An agreement names a buyer, seller and trusted reviewer. Reservation is separate from payment release."
        >
          <div className="diagram-heading">
            <span className="mini-wordmark">
              d<span>·</span>
            </span>
            <span>THE AGREEMENT COMES FIRST</span>
          </div>
          <div className="diagram-people">
            <span>Named buyer</span>
            <span className="diagram-connector" aria-hidden="true" />
            <span>Named seller</span>
          </div>
          <div className="diagram-terms">
            <p className="eyebrow">ONE SHARED CHECKOUT</p>
            <h2>
              Same terms.
              <br />
              Same understanding.
            </h2>
            <p>
              What’s agreed · USDC amount
              <br />
              Deadlines · Trusted reviewer
            </p>
          </div>
          <div className="diagram-reviewer">
            <Icon name="link" size={17} />
            <span>A reviewer chosen before funding</span>
          </div>
          <div className="diagram-money">
            <span>Reserve in protocol</span>
            <Icon name="arrow" size={18} />
            <span>Authorize release</span>
          </div>
          <p className="diagram-caption">
            Payment workflow illustration. No transaction is shown.
          </p>
        </div>
      </section>
      {!api.deployment && <PendingIntegration />}

      <section
        className="landing-problem landing-section"
        aria-labelledby="problem-title"
      >
        <div>
          <p className="eyebrow">THE GAP BETWEEN “AGREED” AND “PAID”</p>
          <h2 id="problem-title">
            A chat is a conversation.
            <br />
            <em>A deal needs clarity.</em>
          </h2>
        </div>
        <div className="editorial-copy">
          <p>
            You find a seller on WhatsApp, Telegram, or X. You agree a price.
            But who pays first? What happens if you disagree? And who gets to
            decide?
          </p>
          <p>
            Dealza turns those questions into explicit payment terms before
            funds move. Keep your conversation where it is. Share one agreement
            everyone can inspect.
          </p>
          <a className="underlined-link" href="#/help">
            Understand the payment rules <Icon name="arrow" size={16} />
          </a>
        </div>
      </section>

      <section
        className="landing-workflow landing-section"
        aria-labelledby="workflow-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">FROM CONVERSATION TO CHECKOUT</p>
            <h2 id="workflow-title">A clearer path to payment.</h2>
          </div>
          <p>
            Agree first. Reserve second.
            <br />
            Release with intention.
          </p>
        </div>
        <ol className="workflow-list">
          {steps.map(([number, title, body]) => (
            <li key={number}>
              <span className="workflow-number" aria-hidden="true">
                {number}
              </span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
              <Icon name="arrow" size={22} />
            </li>
          ))}
        </ol>
      </section>

      <LandingDetails />

      <section className="final-cta" aria-labelledby="cta-title">
        <p className="eyebrow">CLEAR AGREEMENTS. HUMAN DECISIONS.</p>
        <h2 id="cta-title">Start with the agreement.</h2>
        <p>
          Give your next online deal a shared set of terms.
          <br />
          Explore with test assets on Base Sepolia.
        </p>
        <a className="button" href="#/create">
          Create an agreement <Icon name="arrow" size={18} />
        </a>
        <a className="underlined-link" href="#/orders">
          Already have a checkout link? Open it here.
        </a>
      </section>
    </main>
  );
}
