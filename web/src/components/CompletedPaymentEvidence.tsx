import { explorerTx } from "../lib/config";
import { genuineJourneys } from "./genuineJourneys";
export { completedPaymentReceipts } from "./genuineJourneys";

// Archived genuine links supplement current verified state; never a seeded feed.
export function CompletedPaymentEvidence({ id }: { id: string }) {
  const journey = genuineJourneys.find((item) => item.id === id.toLowerCase());
  if (!journey) return null;
  const settlement = journey.receipts[journey.receipts.length - 1];
  return (
    <section
      className="recorded-receipts"
      aria-labelledby="recorded-receipts-title"
    >
      <h3 id="recorded-receipts-title">Genuine transaction receipts</h3>
      <a
        className="settlement-receipt"
        aria-label={`${journey.receiptLabel} on Base Sepolia explorer (opens a new tab)`}
        href={explorerTx(settlement[1])}
        target="_blank"
        rel="noreferrer"
      >
        {journey.receiptLabel}
        <span className="sr-only">
          {" "}
          on Base Sepolia explorer (opens a new tab)
        </span>{" "}
        ↗
      </a>
      <p>
        Recorded controlled-test transactions. Payment state is read separately
        above. No physical delivery occurred.
      </p>
      <details>
        <summary>All six transaction receipts</summary>
        <ol>
          {journey.receipts.map(([label, hash]) => (
            <li key={hash}>
              <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
                {label}
                <span className="sr-only">
                  {" "}
                  receipt on Base Sepolia explorer (opens a new tab)
                </span>
                <span aria-hidden="true"> ↗</span>
              </a>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
