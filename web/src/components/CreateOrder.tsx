import { usePendingRequest } from "../lib/usePendingRequest";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Hash } from "viem";
import {
  descriptionHash,
  friendlyError,
  idleTx,
  money,
  shareLink,
  validateTerms,
  type CreateTerms,
  type TxState,
} from "../lib/domain";
import {
  emptyOrderForm,
  orderDraftKey,
  readOrderDraft,
  writeOrderDraft,
  removeOrderDraft,
} from "../lib/orderDraft";
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

// Remount all review/transaction state when the account, chain or deployment changes.
export function CreateOrder({ api }: { api: PaymentGateway }) {
  const wallet = useWallet();
  const key = orderDraftKey(wallet.session, api.deployment);
  return (
    <ScopedCreateOrder key={key ?? "disconnected"} api={api} draftKey={key} />
  );
}
function ScopedCreateOrder({
  api,
  draftKey,
}: {
  api: PaymentGateway;
  draftKey: string | null;
}) {
  const wallet = useWallet();
  const pending = usePendingRequest(wallet.session, api.deployment?.operator);
  const [restored] = useState(() => readOrderDraft(draftKey));
  const [form, setForm] = useState(restored ?? emptyOrderForm());
  const [terms, setTerms] = useState<CreateTerms | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(
    restored
      ? "Incomplete draft restored on this device. If you already submitted a transaction, check My orders before retrying. Review all fields and deadlines."
      : "",
  );
  const [tx, setTx] = useState<TxState>(idleTx);
  const [created, setCreated] = useState("");
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    if (restored) {
      try {
        validateTerms(restored, wallet.session?.account);
      } catch (e) {
        setError(friendlyError(e));
      }
    }
    return () => {
      active.current = false;
    };
  }, []);
  const persist = (value: typeof form) => {
    try {
      writeOrderDraft(draftKey, value);
      setSaved(
        "Draft saved on this device. No order or payment has been created.",
      );
      return true;
    } catch (e) {
      setSaved("");
      setError(
        draftKey
          ? "Your browser could not save this draft. Keep a separate copy of your terms."
          : friendlyError(e),
      );
      return false;
    }
  };
  const busy = ["checking", "signature", "pending"].includes(tx.phase);
  const field = (name: keyof typeof form) => ({
    value: form[name],
    disabled: busy,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const next = { ...form, [name]: e.target.value };
      setForm(next);
      setTerms(null);
      setError("");
      // Save during the edit, before a refresh or wallet navigation can unmount us.
      if (draftKey) persist(next);
    },
  });
  const review = (event: FormEvent) => {
    event.preventDefault();
    setTerms(null);
    setError("");
    try {
      setTerms(validateTerms(form, wallet.session?.account));
    } catch (e) {
      setError(friendlyError(e));
    }
  };
  const save = () => {
    persist(form);
  };
  const clear = () => {
    try {
      removeOrderDraft(draftKey);
      setForm(emptyOrderForm());
      setTerms(null);
      setError("");
      setTx(idleTx);
      setSaved("Draft cleared on this device.");
    } catch {
      setError(
        "Your browser could not clear this draft. Try again before leaving this device.",
      );
    }
  };
  const create = async () => {
    if (
      !terms ||
      !wallet.session ||
      !api.deployment ||
      wallet.session.chainId !== 84532 ||
      busy ||
      pending ||
      inFlight.current
    )
      return;
    inFlight.current = true;
    setTx({
      phase: "checking",
      message: "Checking your wallet, deployment, and order terms…",
    });
    try {
      // Review is not authorization to use stale deadlines or edited storage.
      const currentTerms = validateTerms(form, wallet.session.account);
      persist(form);
      const id = await api.create(currentTerms, wallet.session, (state) => {
        if (active.current) setTx(state);
      });
      if (!active.current) return;
      setCreated(shareLink(id, currentTerms.description));
      try {
        removeOrderDraft(draftKey);
      } catch {
        /* Financial state does not depend on browser storage. */
      }
      setTx((old) => ({
        ...old,
        message:
          "Your order was confirmed and its terms were read back from the contract. Share the checkout link with your buyer.",
      }));
    } catch (e) {
      if (!active.current) return;
      setTerms(null);
      setTx((old) => ({
        phase: "error",
        hash: (e as { hash?: Hash }).hash ?? old.hash,
        message: friendlyError(e),
      }));
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <main id="main" className="page narrow-page">
      <a className="back" href="#/">
        ← All orders
      </a>
      <SectionTitle eyebrow="FOR THE SELLER" title="Start with clear terms.">
        <p>
          One agreement. One payment link. Choose who pays, what they’re paying
          for, and who can help if there’s a disagreement.
        </p>
      </SectionTitle>
      {!api.deployment && <PendingIntegration />}
      {created ? (
        <section className="panel success-panel">
          <span className="round-icon">
            <Icon name="check" />
          </span>
          <h2>Your order link is ready.</h2>
          <p>
            Only the named buyer can reserve funds. They’ll see and accept the
            reviewer before paying.
          </p>
          <label htmlFor="created-link">Shareable checkout link</label>
          <input
            id="created-link"
            readOnly
            value={created}
            onFocus={(e) => e.target.select()}
          />
          <div className="button-row">
            <CopyButton value={created} />
            <a className="button" href={created}>
              Open order <Icon name="arrow" />
            </a>
          </div>
          <TransactionNotice tx={tx} />
        </section>
      ) : (
        <div className="create-layout">
          <form className="panel order-form" onSubmit={review}>
            <div className="panel-heading">
              <span className="step-number">01</span>
              <h2>The agreement</h2>
            </div>
            <label htmlFor="description">What is this order for?</label>
            <textarea
              id="description"
              {...field("description")}
              maxLength={1600}
              required
              rows={4}
              placeholder="Describe the item or service, delivery expectations, and agreed review terms."
              aria-describedby="description-help"
            />
            <p id="description-help" className="field-help">
              These terms travel in the share link. Only their fingerprint goes
              onchain. Don’t include home addresses or private delivery details.
            </p>
            <label htmlFor="amount">
              Order amount <span>USDC</span>
            </label>
            <div className="amount-input">
              <span className="coin">$</span>
              <input
                id="amount"
                {...field("amount")}
                required
                inputMode="decimal"
                placeholder="0.00"
                autoComplete="off"
              />
              <span>test USDC</span>
            </div>
            <p className="field-help">
              Platform fee: 0 USDC. Wallet transactions may also require test
              ETH for gas.
            </p>
            <div className="panel-heading sub">
              <span className="step-number">02</span>
              <h2>The people</h2>
            </div>
            <label htmlFor="buyer">Buyer’s wallet address</label>
            <input
              id="buyer"
              {...field("buyer")}
              required
              spellCheck={false}
              autoComplete="off"
              placeholder="0x…"
            />
            <p className="field-help">
              Only this wallet can reserve the payment and approve ordinary
              release.
            </p>
            <label htmlFor="reviewer">Agreed reviewer’s wallet address</label>
            <input
              id="reviewer"
              {...field("reviewer")}
              required
              spellCheck={false}
              autoComplete="off"
              placeholder="0x…"
            />
            <p className="field-help">
              Agree on this person together. They can release or return disputed
              funds before expiry. You can’t replace them after creation.
            </p>
            <div className="panel-heading sub">
              <span className="step-number">03</span>
              <h2>The time window</h2>
            </div>
            <label htmlFor="funding">Buyer must reserve by</label>
            <input
              id="funding"
              type="datetime-local"
              {...field("fundingCutoff")}
              required
            />
            <label htmlFor="expiry">Payment release & review deadline</label>
            <input
              id="expiry"
              type="datetime-local"
              {...field("expiry")}
              required
            />
            <p className="field-help">
              Times use your device’s timezone. Allow time for delivery and
              review. Expiry must be within 30 days.
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="button-row">
              <button className="button" disabled={busy} type="submit">
                Review order <Icon name="arrow" size={17} />
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={save}
                disabled={busy}
              >
                Save draft
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={clear}
                disabled={busy}
              >
                Clear draft
              </button>
            </div>
            <p role="status" className="field-help">
              {saved ||
                "Drafts save automatically for the connected wallet and network on this device. Keep private information out of the terms."}
            </p>
          </form>
          <aside className="create-aside">
            <div className="aside-note">
              <Icon name="shield" size={30} />
              <h2>Your wallet. Your agreement.</h2>
              <p>
                Dealza never holds the reserved USDC. It stays in Base’s payment
                protocol until an allowed release or return.
              </p>
              <ol>
                <li>Buyer reserves test USDC.</li>
                <li>Seller shares delivery evidence.</li>
                <li>
                  Buyer releases payment, or the reviewer decides a dispute.
                </li>
              </ol>
              <a href="#/help">Understand the safeguards ↗</a>
            </div>
            <RiskNote />
          </aside>
        </div>
      )}
      {terms && !created && (
        <section
          className="panel review-panel"
          aria-labelledby="review-heading"
        >
          <span className="eyebrow">REVIEW BEFORE YOU CREATE</span>
          <h2 id="review-heading">{money(terms.amount)} test USDC</h2>
          <p className="terms-text">{terms.description}</p>
          <dl className="details">
            <dt>Seller receives</dt>
            <dd>
              {wallet.session && (
                <AddressLink value={wallet.session.account} full />
              )}
            </dd>
            <dt>Named buyer</dt>
            <dd>
              <AddressLink value={terms.buyer} full />
            </dd>
            <dt>Reviewer</dt>
            <dd>
              <AddressLink value={terms.reviewer} full />
            </dd>
            <dt>Reserve by</dt>
            <dd>{dateTime(terms.fundingCutoff)}</dd>
            <dt>Release / review before</dt>
            <dd>{dateTime(terms.expiry)}</dd>
            <dt>Platform fee</dt>
            <dd>0 USDC</dd>
            <dt>Terms fingerprint</dt>
            <dd className="mono">{descriptionHash(terms.description)}</dd>
          </dl>
          <RiskNote />
          <button
            className="button"
            onClick={() => void create()}
            disabled={
              !api.deployment ||
              wallet.session?.chainId !== 84532 ||
              busy ||
              pending
            }
          >
            {busy
              ? "Waiting for your transaction…"
              : api.deployment
                ? "Create order on Base Sepolia"
                : "Testnet integration pending"}
          </button>
          <p className="field-help">
            Creation needs one wallet transaction. No buyer funds move when an
            order is created.
          </p>
        </section>
      )}
      {!created && <TransactionNotice tx={tx} />}
    </main>
  );
}
