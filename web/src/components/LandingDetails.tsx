import { explorerAddress, network } from "../lib/config";
import { Icon } from "./common";

const questions = [
  [
    "Does Dealza check that my order arrived?",
    "No. A seller’s evidence records a claim, not proof of physical delivery. You and your reviewer assess the agreement and the evidence yourselves.",
  ],
  [
    "Why does reserving need three transactions?",
    "Allowance lets the existing collector use a capped USDC amount. Terms authorization approves this specific payment. Reservation moves that amount into the protocol. None of these pays the seller.",
  ],
  [
    "Who can release the payment?",
    "The buyer can authorize ordinary release. Once disputed, only the named reviewer can decide a full payment to the seller or a full return to the buyer before expiry. The seller cannot unilaterally capture the reserve.",
  ],
  [
    "What happens if the reviewer doesn’t decide?",
    "A dispute does not extend expiry. At expiry, the buyer may reclaim uncaptured funds directly from the protocol. Recovery needs a buyer transaction and gas; it is not automatic. A seller who delivered may remain unpaid.",
  ],
  [
    "Which wallet and assets do I need?",
    "Use MetaMask or a compatible injected wallet on Base Sepolia, test USDC, and test ETH for transaction fees. You can browse agreements without a wallet. This version does not accept mainnet funds.",
  ],
  [
    "Can I cancel or get a refund?",
    "Either party can cancel before funding. After funding, the seller may return the reserve, or the reviewer may decide a disputed return before expiry. After capture there is no guaranteed refund, insurance, or chargeback.",
  ],
];

export function LandingDetails() {
  return (
    <>
      <section
        className="benefits-layout landing-section"
        aria-label="Benefits for buyers and sellers"
      >
        <article>
          <p className="eyebrow">FOR THE BUYER</p>
          <h2>
            Know what you’re
            <br />
            <em>authorizing.</em>
          </h2>
          <ul>
            <li>
              Review the exact amount, recipient, reviewer, and deadlines.
            </li>
            <li>Reserve funds without paying the seller immediately.</li>
            <li>
              Choose to release, or raise a dispute for the agreed reviewer.
            </li>
          </ul>
          <p className="benefit-note">
            A named reviewer is a person you trust, not a guarantee of a fair
            outcome.
          </p>
        </article>
        <article>
          <p className="eyebrow">FOR THE SELLER</p>
          <h2>
            Put the agreement
            <br />
            <em>on the record.</em>
          </h2>
          <ul>
            <li>Share one checkout for the terms you actually agreed.</li>
            <li>
              See the buyer’s reservation through verifiable onchain records.
            </li>
            <li>
              Record evidence and refer disagreements to the named reviewer.
            </li>
          </ul>
          <p className="benefit-note">
            Reservation is not guaranteed payment. Expiry and reviewer decisions
            still apply.
          </p>
        </article>
      </section>

      <section
        className="protocol-section landing-section"
        aria-labelledby="protocol-title"
      >
        <div>
          <p className="eyebrow">USDC PAYMENTS ON BASE</p>
          <h2 id="protocol-title">
            Human agreements.
            <br />
            <em>Verifiable payment records.</em>
          </h2>
          <p>
            Dealza uses Base’s Commerce Payments Protocol. Reserved USDC stays
            in the protocol’s TokenStore, not in DealzaOperator. The seller
            cannot capture it without the authorization the agreement permits.
          </p>
          <a
            className="underlined-link"
            href="https://github.com/base/commerce-payments/tree/v1.1.0"
            target="_blank"
            rel="noreferrer"
          >
            Explore Commerce Payments Protocol ↗
          </a>
        </div>
        <div className="protocol-record">
          <span className="eyebrow">WHAT YOU CAN VERIFY</span>
          <dl>
            <dt>Agreement</dt>
            <dd>Immutable terms fingerprint</dd>
            <dt>Reservation</dt>
            <dd>Confirmed protocol events</dd>
            <dt>Release or return</dt>
            <dd>Onchain receipt and payment state</dd>
          </dl>
          <p>
            Receipts prove payment activity. They do not prove physical
            delivery.
          </p>
          <a
            href={explorerAddress(network.escrow)}
            target="_blank"
            rel="noreferrer"
          >
            Inspect the Base Sepolia escrow ↗
          </a>
        </div>
      </section>

      <section
        className="safeguards-section landing-section"
        aria-labelledby="safeguards-title"
      >
        <div>
          <p className="eyebrow">CLEAR LIMITS ARE PART OF THE AGREEMENT</p>
          <h2 id="safeguards-title">
            Choose the person.
            <br />
            <em>Understand the clock.</em>
          </h2>
          <p>
            Both parties should agree on the reviewer before funding. That
            person can decide a disputed full release or full return before
            expiry. They cannot be replaced, and there is no admin override.
          </p>
        </div>
        <div className="safeguard-notes">
          <article>
            <Icon name="clock" />
            <div>
              <h3>A dispute does not pause expiry.</h3>
              <p>
                Uncaptured funds become reclaimable by the buyer at expiry, even
                during review. Recovery requires a transaction and gas.
              </p>
            </div>
          </article>
          <article>
            <Icon name="link" />
            <div>
              <h3>Evidence is a claim, not delivery verification.</h3>
              <p>
                No delivery guarantee, insurance, chargeback, or guaranteed
                refund after capture. USDC issuer controls can block transfers.
              </p>
            </div>
          </article>
          <a className="underlined-link" href="#/help">
            Read all safeguards & limitations <Icon name="arrow" size={16} />
          </a>
        </div>
      </section>

      <section
        className="faq-section landing-section"
        aria-labelledby="faq-title"
      >
        <div>
          <p className="eyebrow">BEFORE YOUR FIRST AGREEMENT</p>
          <h2 id="faq-title">
            Good questions.
            <br />
            <em>Clear answers.</em>
          </h2>
        </div>
        <dl className="faq-list">
          {questions.map(([question, answer]) => (
            <div key={question}>
              <dt>{question}</dt>
              <dd>{answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
