// Genuine controlled test. This link preserves the exact terms fingerprint.
// Payment state and receipts are always loaded by the existing onchain gateway.
export const completedPaymentId =
  "0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd";
export const completedPaymentTerms =
  "Dealza Checkpoint 6: fresh UI-only 1 test-USDC checkout; controlled test, no physical delivery.";
export const completedPaymentHref = `#/order/${completedPaymentId}?terms=${encodeURIComponent(completedPaymentTerms)}`;
