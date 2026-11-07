import { useState, type ReactNode } from "react";
import { formatEther } from "viem";
import { explorerAddress, explorerTx } from "../lib/config";
import { shortAddress, type TxState } from "../lib/domain";

export function Icon({
  name,
  size = 20,
}: {
  name:
    | "arrow"
    | "shield"
    | "link"
    | "wallet"
    | "check"
    | "clock"
    | "copy"
    | "external"
    | "plus";
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    arrow: (
      <>
        <path d="M4 12h15M13 6l6 6-6 6" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    link: (
      <>
        <path d="m10 14 4-4M9 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M15 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 8H4V5l13-2v5M4 8v12h16V8M16 12h5v5h-5z" />
      </>
    ),
    check: <path d="m5 12 5 5L20 7" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7M21 3l-12 12M11 5H4v15h15v-7" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function AddressLink({
  value,
  full = false,
}: {
  value: string;
  full?: boolean;
}) {
  return (
    <a
      className="address"
      href={explorerAddress(value)}
      target="_blank"
      rel="noreferrer"
      title={value}
    >
      {full ? value : shortAddress(value)}
      <span className="sr-only">
        {" "}
        on Base Sepolia explorer (opens a new tab)
      </span>
      <Icon name="external" size={12} />
    </a>
  );
}
export function CopyButton({
  value,
  label = "Copy link",
}: {
  value: string;
  label?: string;
}) {
  const [message, setMessage] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied");
    } catch {
      setMessage(
        "Copy is unavailable. Select and copy the displayed address or link.",
      );
    }
  };
  return (
    <>
      <button className="button secondary" onClick={() => void copy()}>
        <Icon name="copy" size={16} />
        {label}
      </button>
      <span className="copy-message" role="status">
        {message}
      </span>
    </>
  );
}
export function TransactionNotice({
  tx,
  title,
}: {
  tx: TxState;
  title?: string;
}) {
  if (tx.phase === "idle") return null;
  return (
    <div
      className={`notice ${tx.phase === "error" ? "danger" : "info"}`}
      role={tx.phase === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <strong>
        {title ??
          (tx.phase === "error"
            ? /declined|reject/i.test(tx.message)
              ? "Wallet request rejected"
              : "Action not completed — failed or unverified"
            : tx.phase === "confirmed"
              ? tx.hash
                ? "Receipt and effects verified"
                : "Agreement verified"
              : tx.phase === "pending"
                ? "Transaction submitted — verification pending"
                : tx.phase === "signature"
                  ? "Review in your wallet"
                  : "Checking before continuing")}
      </strong>
      <p>{tx.message}</p>
      {tx.hash && (
        <a
          href={explorerTx(tx.hash)}
          target="_blank"
          rel="noreferrer"
          className="address"
        >
          View transaction {shortAddress(tx.hash)}{" "}
          <Icon name="external" size={14} />
        </a>
      )}
    </div>
  );
}
export function PendingIntegration() {
  return (
    <div className="notice pending" role="status">
      <span className="status-dot" />
      <div>
        <strong>Testnet integration pending</strong>
        <p>
          DealzaOperator hasn’t been deployed yet. You can explore the app and
          prepare order terms. Payments will become available after the verified
          deployment is configured.
        </p>
      </div>
    </div>
  );
}
export function RiskNote() {
  return (
    <div className="notice warning">
      <Icon name="clock" />
      <div>
        <strong>A dispute does not pause the clock.</strong>
        <p>
          The reviewer must decide before payment expiry. At expiry, the buyer
          can reclaim uncaptured funds directly from the payment protocol, even
          during an unresolved dispute.
        </p>
      </div>
    </div>
  );
}
export const dateTime = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
export const eth = (value: bigint) => formatEther(value);
export function SectionTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-title">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {children}
    </div>
  );
}
