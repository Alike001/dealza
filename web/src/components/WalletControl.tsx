import { useEffect, useRef, useState } from "react";
import type { PaymentGateway } from "../lib/gateway";
import { useWallet } from "../lib/wallet";
import { friendlyError, money, shortAddress } from "../lib/domain";
import { AddressLink, eth, Icon } from "./common";

export function WalletControl({ api }: { api: PaymentGateway }) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const navigate = () => setOpen(false);
    window.addEventListener("keydown", escape);
    window.addEventListener("hashchange", navigate);
    return () => {
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
  ]);
  return (
    <div className="wallet-control">
      <button
        ref={trigger}
        className="button wallet-button"
        aria-controls="wallet-panel"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="wallet" size={17} />
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
                You can revoke this site’s access separately in your wallet.
              </p>
            </>
          )}
          {wallet.error && (
            <p role="alert" className="inline-error">
              {wallet.error}
            </p>
          )}
          <button className="text-button close-wallet" onClick={close}>
            Close wallet panel
          </button>
        </section>
      )}
    </div>
  );
}
