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
  validateAgreement,
  validatePeople,
  type CreateTerms,
  type TxState,
} from "../lib/domain";
import {
  readDraftStage,
  writeDraftStage,
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
  const [stage, setStage] = useState(() => {
    const hint = restored ? readDraftStage(draftKey) : 0;
    if (hint > 0) {
      try {
        validateAgreement(form);
      } catch {
        return 0;
      }
    }
    if (hint > 1) {
      try {
        validatePeople(form, wallet.session?.account);
      } catch {
        return 1;
      }
    }
    return hint;
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const progress = useRef<HTMLElement>(null);
  const previousStage = useRef(stage);
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
        validateAgreement(restored);
        if (stage >= 1) validatePeople(restored, wallet.session?.account);
        if (stage >= 2) validateTerms(restored, wallet.session?.account);
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
  const go = (next: number) => {
    setTerms(null);
    setError("");
    setStage(next);
    try {
      writeDraftStage(draftKey, next);
    } catch {
      setSaved(
        "Progress could not be saved. Keep a separate copy of your terms.",
      );
    }
  };
  useEffect(() => {
    heading.current?.focus({
      preventScroll: previousStage.current !== stage || !!created,
    });
    if (previousStage.current !== stage || created) {
      progress.current?.scrollIntoView?.({
        block: "start",
        behavior: "instant",
      });
    }
    previousStage.current = stage;
  }, [stage, created]);
  const review = (event: FormEvent) => {
    event.preventDefault();
    setTerms(null);
    setError("");
    try {
      if (stage === 0) validateAgreement(form);
      if (stage === 1) validatePeople(form, wallet.session?.account);
      if (stage === 2) {
        const reviewed = validateTerms(form, wallet.session?.account);
        go(3);
        setTerms(reviewed);
      } else go(stage + 1);
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
      setStage(0);
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
  useEffect(() => {
    if (terms)
      document.getElementById("review-heading")?.focus({ preventScroll: true });
  }, [terms]);
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
      setTx((old) => ({
        phase: "error",
        hash: (e as { hash?: Hash }).hash ?? old.hash,
        message: friendlyError(e),
      }));
    } finally {
      inFlight.current = false;
    }
  };
  const steps = [
    "Agreement details",
    "People involved",
    "Payment deadlines",
    "Review and create",
    "Confirmed and sharing",
  ];
  const currentStep = created ? 4 : stage;
  const draftControls = (
    <div className="draft-controls">
      <p role="status" className="field-help">
        {saved ||
          "Drafts save automatically for the connected wallet and network on this device. Keep private information out of the terms."}
      </p>
      <details>
        <summary>Draft options</summary>
        <div className="button-row">
          <button
            type="button"
            className="text-button"
            onClick={save}
            disabled={busy}
          >
            Save draft
          </button>
          <button
            type="button"
            className="text-button"
            onClick={clear}
            disabled={busy}
          >
            Clear draft
          </button>
        </div>
      </details>
    </div>
  );
  return (
    <main id="main" tabIndex={-1} className="page narrow-page">
      <a className="back" href="#/orders">
        ← All orders
      </a>
      <SectionTitle eyebrow="FOR THE SELLER" title="Start with clear terms.">
        <p>
          One agreement. One payment link. Choose who pays, what they’re paying
          for, and who can help if there’s a disagreement.
        </p>
      </SectionTitle>
      {!api.deployment && <PendingIntegration />}
      <nav
        ref={progress}
        aria-label="Agreement progress"
        className="wizard-progress"
      >
        <p className="wizard-status" role="status">
          <strong>
            {created
              ? "Agreement confirmed"
              : `Step ${currentStep + 1} of 5 · ${steps[currentStep]}`}
          </strong>
          <span>
            {created
              ? "5 of 5 steps complete"
              : `${currentStep} of 5 steps complete`}
          </span>
        </p>
        <ol>
          {steps.map((label, index) => (
            <li
              key={label}
              aria-current={currentStep === index ? "step" : undefined}
              data-complete={!!created || index < currentStep}
            >
              <button
                type="button"
                disabled={!!created || busy || index >= stage}
                onClick={() => go(index)}
                aria-label={
                  index < currentStep && !created
                    ? `Return to ${label}, complete`
                    : `${label}, ${created ? "complete" : index === currentStep ? "current step" : "upcoming"}`
                }
              >
                <span aria-hidden="true">
                  {created || index < currentStep ? "✓" : index + 1}
                </span>
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {created ? (
        <section className="panel success-panel">
          <span className="round-icon">
            <Icon name="check" />
          </span>
          <h2 ref={heading} tabIndex={-1}>
            Your order link is ready.
          </h2>
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
      ) : stage < 3 ? (
        <div className="create-layout">
          <form className="panel order-form" onSubmit={review} noValidate>
            <div className="panel-heading">
              <span className="step-number">0{stage + 1}</span>
              <h2 ref={heading} tabIndex={-1}>
                {
                  ["Agreement details", "People involved", "Payment deadlines"][
                    stage
                  ]
                }
              </h2>
            </div>
            {stage === 0 && (
              <>
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
                  These terms travel in the share link. Only their fingerprint
                  goes onchain. Don’t include home addresses or private delivery
                  details.
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
                  Platform fee: 0 USDC. Wallet transactions may also require
                  test ETH for gas.
                </p>
              </>
            )}
            {stage === 1 && (
              <>
                <p className="field-help">
                  You are the seller. You set the terms and record delivery
                  evidence; a delivery claim never releases payment.
                </p>
                <p className="mono">
                  {wallet.session?.account ||
                    "Connect the seller wallet to continue."}
                </p>
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
                <label htmlFor="reviewer">
                  Agreed reviewer’s wallet address
                </label>
                <input
                  id="reviewer"
                  {...field("reviewer")}
                  required
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="0x…"
                />
                <p className="field-help">
                  Agree on this person together. They can release or return
                  disputed funds before expiry. You can’t replace them after
                  creation.
                </p>
              </>
            )}
            {stage === 2 && (
              <>
                <label htmlFor="funding">Buyer must reserve by</label>
                <input
                  id="funding"
                  type="datetime-local"
                  {...field("fundingCutoff")}
                  required
                />
                <label htmlFor="expiry">
                  Payment release & review deadline
                </label>
                <input
                  id="expiry"
                  type="datetime-local"
                  {...field("expiry")}
                  required
                />
                <p className="field-help">
                  Device timezone:{" "}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}. Allow time
                  for delivery and review. Expiry must be within 30 days.
                </p>
                <dl className="details" aria-live="polite">
                  <dt>Reserve by</dt>
                  <dd>
                    {form.fundingCutoff
                      ? new Date(form.fundingCutoff).toString()
                      : "Choose a deadline"}
                  </dd>
                  <dt>Release / review before</dt>
                  <dd>
                    {form.expiry
                      ? new Date(form.expiry).toString()
                      : "Choose a deadline"}
                  </dd>
                </dl>
              </>
            )}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="button-row">
              {stage > 0 && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => go(stage - 1)}
                >
                  Back
                </button>
              )}
              <button className="button" disabled={busy} type="submit">
                {stage === 2 ? "Review order" : "Continue"}{" "}
                <Icon name="arrow" size={17} />
              </button>
            </div>
            {draftControls}
          </form>
          <aside className="create-aside">
            <section
              className="draft-preview"
              aria-label="Agreement summary"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="eyebrow">YOUR AGREEMENT SO FAR</span>
              <h2>
                {form.amount || "0"} <small>test USDC</small>
              </h2>
              <p className="terms-text">
                {form.description ||
                  "Your agreement starts here. Describe what you’ll deliver and how the buyer will review it."}
              </p>
              <dl className="preview-details">
                <dt>Buyer</dt>
                <dd className="preview-address" title={form.buyer || undefined}>
                  {form.buyer || "Add in People involved"}
                </dd>
                <dt>Agreed reviewer</dt>
                <dd
                  className="preview-address"
                  title={form.reviewer || undefined}
                >
                  {form.reviewer || "Add in People involved"}
                </dd>
                {form.fundingCutoff && (
                  <>
                    <dt>Reserve by</dt>
                    <dd>{new Date(form.fundingCutoff).toLocaleString()}</dd>
                  </>
                )}
                {form.expiry && (
                  <>
                    <dt>Release / review before</dt>
                    <dd>{new Date(form.expiry).toLocaleString()}</dd>
                  </>
                )}
              </dl>
            </section>
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
      ) : null}
      {stage === 3 && terms && !created && (
        <section
          className="panel review-panel"
          aria-labelledby="review-heading"
        >
          <span className="eyebrow">REVIEW BEFORE YOU CREATE</span>
          <h2 id="review-heading" ref={heading} tabIndex={-1}>
            {money(terms.amount)} test USDC
          </h2>
          <section className="review-group" aria-labelledby="agreement-review">
            <h3 id="agreement-review">Agreement details</h3>
            <p className="terms-text">{terms.description}</p>
            <dl className="details">
              <dt>Terms fingerprint</dt>
              <dd className="mono">{descriptionHash(terms.description)}</dd>
            </dl>
          </section>
          <section
            className="review-group"
            aria-labelledby="participants-review"
          >
            <h3 id="participants-review">Participants</h3>
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
            </dl>
          </section>
          <section className="review-group" aria-labelledby="deadlines-review">
            <h3 id="deadlines-review">Deadlines</h3>
            <dl className="details">
              <dt>Reserve by</dt>
              <dd>{dateTime(terms.fundingCutoff)}</dd>
              <dt>Release / review before</dt>
              <dd>{dateTime(terms.expiry)}</dd>
            </dl>
          </section>
          <section className="review-group" aria-labelledby="safeguards-review">
            <h3 id="safeguards-review">Financial safeguards</h3>
            <dl className="details">
              <dt>Platform fee</dt>
              <dd>0 USDC</dd>
              <dt>Buyer funds</dt>
              <dd>No buyer funds move on creation.</dd>
              <dt>Release or return</dt>
              <dd>
                The buyer can release payment. The agreed reviewer can decide a
                dispute before expiry. Expired funds require buyer recovery.
              </dd>
            </dl>
            <RiskNote />
          </section>
          <p className="field-help">
            These terms, participants, amount and deadlines are immutable after
            creation. Device timezone:{" "}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}.
          </p>
          <div className="button-row">
            {["Agreement details", "People involved", "Payment deadlines"].map(
              (label, i) => (
                <button
                  className="text-button"
                  disabled={busy}
                  key={label}
                  onClick={() => go(i)}
                >
                  Edit {label}
                </button>
              ),
            )}
          </div>
          {draftControls}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => go(2)}
          >
            Back
          </button>{" "}
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
      {!created && stage === 3 && error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {!created && <TransactionNotice tx={tx} />}
    </main>
  );
}
