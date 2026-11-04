import { completedPaymentId } from "../lib/completedPayment";
import { explorerTx } from "../lib/config";

// Curated links to existing canonical receipts, never a replacement for live state.
// Source: docs/27-COMPLETE-REAL-UI-CHECKOUT.md and its gate 1–6 evidence.
export const completedPaymentReceipts = [
  [
    "Agreement created",
    "0x057a937ac93132743a53276eefcd7023d3ae72210410fbcee6dc6fdf4fb84567",
  ],
  [
    "Exact USDC allowance",
    "0x7807edd5f7838a287a8723268b0f5b3aba7d7e87a44a87a032ccb6359b7b7133",
  ],
  [
    "Payment terms preapproved",
    "0x3bdd6c65eea5c193abc0dce78b0a92314d459f9cfb38615469977977652ee62c",
  ],
  [
    "USDC reserved",
    "0xcb162300071bc1ae68e081045050fd50d495de93d7651dfc45fe291b4912802b",
  ],
  [
    "Seller acknowledgment",
    "0x2dec3e64944f1bc6db00051079e8f86edf671d454de99977cdacf3a8b081e0c0",
  ],
  [
    "Buyer release",
    "0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023",
  ],
] as const;

export function CompletedPaymentEvidence({ id }: { id: string }) {
  if (id.toLowerCase() !== completedPaymentId) return null;
  return (
    <section
      className="panel recorded-receipts"
      aria-labelledby="recorded-receipts-title"
    >
      <span className="eyebrow">GENUINE CONTROLLED TEST</span>
      <h2 id="recorded-receipts-title">Inspect the six payment receipts</h2>
      <p>
        These are the recorded transactions for this completed 1 test-USDC
        checkout. No physical delivery occurred. Current payment state is read
        from Base Sepolia above; these historical links remain available while
        recent history loads.
      </p>
      <ol>
        {completedPaymentReceipts.map(([label, hash]) => (
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
    </section>
  );
}
