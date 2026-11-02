# Paste this task to your coding agent after setting up ~/Desktop/vibeathon/dealza

Implement **checkpoint 1 only** for Dealza, a protected USDC order-payment app for Vibestarter Vibeathon 02. The entry has been accepted. Working name Dealza. No AI or chat features. Read README and all docs in this handoff before changing files.

Architecture and security requirements:
- Research and pin https://github.com/base/commerce-payments v1.1.0. Verify the deployed Base Sepolia `AuthCaptureEscrow` at `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c`, and use exact ABI from that version. Circle USDC Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
- Create a Foundry project and minimal restricted operator contract. All held money must remain in Commerce Payments Protocol, not the Dealza contract. `PaymentInfo.operator` must be our operator contract.
- Seller creates offer/order with exact amount, seller address, intended reviewer, expiry, description hash. Buyer accepts signed terms and pays; ensure exact CPP payment hash bound to order and verify fee/collector/expiry.
- Capture ONLY after the buyer explicitly authorizes release (and only to the pre-agreed seller) or the agreed reviewer resolves a dispute before CPP expiry. Seller delivery indication is NOT permission to capture. Do NOT allow seller-only release or operator-admin bypass. Explicitly handle operator-only `void` vs payer-only expired `reclaim`.
- Initially focus on unit tests that demonstrate prohibited seller capture, authorized buyer release, no replay/duplicate claim, no wrong beneficiary, expiry and dispute logic. Add protocol-compatible integration tests, not only a mock of expected behavior.
- For checkpoint 1, do not call any wallet payment method, sign a transaction, move any funds, broadcast a deployment, push to GitHub, or create mainnet configuration. Do not fake tests. End with `forge build`, `forge test`, changed file list, security risks, and exact next steps. Only report passing tests that actually executed.
- Place code under `contracts/`, prepare a concise `README.md` with `How to Test` at top. Keep user research under `../vibestarter-vibeathon-context/` or document links; do not copy upstream licenses incorrectly.

Before writing contract code, list the real CPP `PaymentInfo`, authorize/capture/void/reclaim signatures and explain how the operator contract's `msg.sender` constraint will be satisfied. If there is a blocker, stop that transaction flow and report the smallest safe alternative; do not pretend the integration works.
