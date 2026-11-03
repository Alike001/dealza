import { explorerTx } from "../lib/config";
import { useEffect, useRef, useState } from "react";
import type { Hash } from "viem";
import { useWallet, type Session } from "../lib/wallet";
import type { PaymentGateway } from "../lib/gateway";
import { pendingIntent, type Intent } from "../lib/pendingTransaction";
import { friendlyError, idleTx, type TxState } from "../lib/domain";
import { TransactionNotice } from "./common";
export function PendingTransaction({ api }: { api: PaymentGateway }) {
  const { session } = useWallet();
  if (!session || !api.deployment) return null;
  return (
    <ScopedPending
      key={`${session.account}:${session.chainId}:${api.deployment.operator}`}
      api={api}
      session={session}
    />
  );
}
function ScopedPending({
  api,
  session,
}: {
  api: PaymentGateway;
  session: Session;
}) {
  const [intent, setIntent] = useState<Intent | null>(null),
    [error, setError] = useState(""),
    [hash, setHash] = useState(""),
    [tx, setTx] = useState<TxState>(idleTx),
    [created, setCreated] = useState<Hash>();
  const active = useRef(true),
    inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    const read = () => {
      try {
        setIntent(pendingIntent(session.account, api.deployment!.operator));
      } catch (e) {
        setError(friendlyError(e));
      }
    };
    read();
    window.addEventListener("dealza:pending", read);
    window.addEventListener("storage", read);
    return () => {
      active.current = false;
      window.removeEventListener("dealza:pending", read);
      window.removeEventListener("storage", read);
    };
  }, [session.account, api]);
  const recheck = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    try {
      const id = await api.resumePending(
        session,
        (s) => {
          if (active.current) setTx(s);
        },
        hash.trim() ? (hash.trim() as Hash) : undefined,
      );
      if (active.current) setCreated(id);
    } catch (e) {
      if (active.current) {
        setError(friendlyError(e));
        setTx((old) => ({
          phase: "error",
          message: friendlyError(e),
          hash: (e as { hash?: Hash }).hash ?? old.hash ?? intent?.hash,
        }));
      }
    } finally {
      inFlight.current = false;
    }
  };
  if (!intent && !error && tx.phase === "idle") return null;
  return (
    <section className="page panel" aria-label="Saved transaction">
      <h2>{intent ? "Check your saved transaction" : "Transaction check"}</h2>
      {intent && (
        <>
          <p>
            This wallet has an unresolved {intent.action} request. Checking its
            receipt requests no signature and cannot spend funds. Do not submit
            it again.
          </p>
          {!intent.hash && (
            <p>
              The wallet did not return a hash before the page closed. Inspect
              its history and paste the transaction hash if it was submitted.
            </p>
          )}
          {intent.hashes?.length ? (
            <ul aria-label="Submitted transaction hashes">
              {intent.hashes.map((value) => (
                <li key={value}>
                  <a
                    className="address"
                    href={explorerTx(value)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {value} (explorer)
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <label htmlFor="saved-transaction-hash">
            Transaction hash (optional replacement)
          </label>
          <input
            id="saved-transaction-hash"
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            placeholder={intent.hash ?? "0x…"}
            spellCheck={false}
          />
          <button
            className="button secondary"
            disabled={tx.phase === "pending" || session.chainId !== 84532}
            onClick={() => void recheck()}
          >
            Recheck saved transaction — no signature
          </button>
          {session.chainId !== 84532 && (
            <p>Switch to Base Sepolia to recheck this transaction.</p>
          )}
        </>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <TransactionNotice tx={tx} />
      {created && (
        <a className="button" href={`#/order/${created}`}>
          Open verified order
        </a>
      )}
    </section>
  );
}
