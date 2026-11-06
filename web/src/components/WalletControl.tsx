import { useEffect, useRef, useState } from "react";
import type { PaymentGateway } from "../lib/gateway";
import { useWallet } from "../lib/wallet";
import { friendlyError, money, shortAddress } from "../lib/domain";
import { AddressLink, CopyButton, eth, Icon } from "./common";

export function WalletControl({ api }: { api: PaymentGateway }) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const requested = useRef(false);
  const [balanceAttempt, setBalanceAttempt] = useState(0);
  useEffect(() => {
    if (requested.current && !wallet.connecting) {
      requested.current = false;
      if (wallet.session && open) {
        setOpen(false);
        trigger.current?.focus();
      }
    }
  }, [wallet.connecting, wallet.session, open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    if (panel.current) panel.current.scrollTop = 0;
    panel.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const focusAway = (event: FocusEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const navigate = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusAway);
    window.addEventListener("keydown", escape);
    window.addEventListener("hashchange", navigate);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", focusAway);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("hashchange", navigate);
    };
  }, [open]);
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
    balanceAttempt,
  ]);
  return (
    <div className="wallet-control" ref={container}>
      <button
        ref={trigger}
        className="button wallet-button"
        aria-label={
          wallet.session
            ? `Wallet connected: ${wallet.session.account}. Open wallet details`
            : "Connect wallet"
        }
        aria-controls="wallet-panel"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {wallet.session ? (
          <span
            className={`wallet-dot ${wallet.session.chainId !== 84532 ? "wrong-network" : ""}`}
          />
        ) : (
          <Icon name="wallet" size={17} />
        )}
        {wallet.session
          ? shortAddress(wallet.session.account)
          : "Connect wallet"}
      </button>
      {open && (
        <section
          id="wallet-panel"
          ref={panel}
          tabIndex={-1}
          className="wallet-popover"
          aria-label="Wallet connection"
        >
          <div className="wallet-panel-heading">
            <h2>{wallet.session ? "Your wallet" : "Choose your wallet"}</h2>
            <button
              className="text-button"
              aria-label="Close wallet panel"
              onClick={close}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          {wallet.session && (
            <p className="wallet-connected" role="status">
              Connected ·{" "}
              {wallet.choices.find(
                (c) => c.provider === wallet.session?.provider,
              )?.name || "Browser wallet"}
            </p>
          )}
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
              or another compatible browser wallet, then reload. External
              mobile-wallet connection is not integrated. Wallet in-app browsers
              have not been verified.
            </p>
          )}
          {!wallet.session && wallet.choices.length > 0 && (
            <>
              <div
                className="wallet-choices"
                aria-label="Detected browser wallets"
              >
                {wallet.choices.map((choice) => (
                  <button
                    key={choice.id}
                    className="button secondary wallet-choice"
                    disabled={wallet.connecting}
                    onClick={() => {
                      requested.current = true;
                      void wallet.connect(choice.id);
                    }}
                  >
                    <Icon name="wallet" size={18} />
                    {wallet.connecting && wallet.selected === choice.id
                      ? `Connecting to ${choice.name}…`
                      : `Connect ${choice.name}`}
                  </button>
                ))}
              </div>
              {wallet.connecting && (
                <p role="status">
                  Choose an account in your wallet. Waiting for permission…
                </p>
              )}
              <p className="field-help">
                Connection shares your public address. It does not sign or pay
                anything.
              </p>
            </>
          )}
          {wallet.session && (
            <>
              <AddressLink value={wallet.session.account} full />
              <CopyButton
                key={wallet.session.account}
                value={wallet.session.account}
                label="Copy wallet address"
              />
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
              <p className="field-help" role="status">
                {error
                  ? "Balances unavailable."
                  : !balances
                    ? "Reading public testnet balances…"
                    : "Balances read from Base Sepolia."}
              </p>
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
              {error && (
                <button
                  className="text-button"
                  onClick={() => setBalanceAttempt((n) => n + 1)}
                >
                  Retry balances
                </button>
              )}
              <button
                className="button secondary"
                onClick={() => {
                  wallet.disconnect();
                  close();
                }}
              >
                Disconnect this session
              </button>
              <p className="field-help">
                To use another wallet, disconnect this session and choose again.
                You can revoke this site’s access separately in your wallet.
              </p>
            </>
          )}
          {wallet.error && (
            <p role="alert" className="inline-error">
              {wallet.error} You can choose a wallet and try again.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
