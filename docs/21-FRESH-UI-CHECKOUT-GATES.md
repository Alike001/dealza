# Fresh UI checkout — separate authorization gates

**LOCAL DRAFT ONLY. No new order exists, no allowance/preapproval was granted, and no funds were reserved or paid.** The creation button was not clicked. This packet prepares a genuine MetaMask run after separate authorization; it does not authorize signing or broadcasting.

[Exact local proposal, calldata and read-only checks](verification/checkpoint-6/fresh-ui-checkout-proposal.json). [Browser draft/review](verification/checkpoint-6/fresh-draft-ui.json). [Receipt-compatibility audit](20-CHECKPOINT-6-RECEIPT-COMPATIBILITY.md).

## Proposed terms

| Field                     | Proposed value                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Network                   | Base Sepolia **84532** only                                                                       |
| Operator                  | `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`                                                      |
| Seller                    | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`                                                      |
| Named buyer               | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`                                                      |
| Fixed reviewer            | `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548`                                                      |
| Circle test USDC          | `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals                                          |
| Payment                   | **1 test USDC**, exactly **1000000 raw**                                                          |
| Platform fee              | **0**; min/max fee bps 0; fee receiver zero address                                               |
| Reserve/preapprove before | **2026-11-04T11:00:00.000Z** — November 4 at **11:00 UTC / 12:00 WAT**; Unix **1793790000**       |
| Release/review before     | **2026-11-06T11:00:00.000Z** — November 6 at **11:00 UTC / 12:00 WAT**; Unix **1793962800**       |
| Description               | `Dealza Checkpoint 6: fresh UI-only 1 test-USDC checkout; controlled test, no physical delivery.` |
| Description hash          | `0x43f2dcc0b9930bc16b3b0d560a08dd7c00dae3949d2355e22b4387541d73b4c8`                              |

Snapshot block **53913103**, `0xb64226efefcc70d966ed8ab72fc58015c0b5400d167f28a9ddc1da99d99b9f1c`, **2026-11-03T11:14:49.000Z**. Official Base RPC and PublicNode agreed on the block, seller nonce **2**, buyer **20 USDC**, seller **1 USDC**, buyer ETH **0.0001**, and collector allowance **0**. The proposed payment is uncollected `(false,0,0)` and not preapproved. These balances are historical readbacks, not guarantees at a future confirmation.

Predicted fresh order ID: `0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd`.

Proposed CPP hash: `0x146b39003d621a9f7dbfc083bb8ce77c6ddb00022a5a384681114cc6cefcf1e6`.

**Both are proposals, not evidence of creation.** The order ID depends on the current seller nonce and can change before mining. The actual `OrderCreated` event/storage and CPP hash must be verified after Gate 1. The completed original and Voided duplicate are prohibited for this test. Regenerate deadlines if delayed or expired; do not submit stale calldata or treat the prediction as a live order.

The verification browser saved a seller/account/network-scoped draft and rendered its review panel. HTML date fields were checked back to these exact Unix deadlines using the browser's timezone. The read-only identity adapter owns no keys and cannot sign. This draft is local to that verification browser; a real-wallet user must enter/review these terms in their own browser.

## Manual gates — no automatic signing or spending

For the real run use the application, a genuine MetaMask account on Base Sepolia, and the intended buyer/seller wallets. Review the current gas quote in MetaMask; wallet/relayer sponsorship can change who pays. No Foundry transaction commands are required. Each gate needs separate explicit authorization before its wallet confirmation.

| Gate         | Separately authorized action                                                                                                                                                               | Required evidence before the next gate                                                                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — next** | Seller opens Create an order, enters/reviews the fresh terms and manually confirms **only `createOrder`**, 0 native ETH value plus wallet gas. This authorizes no buyer USDC movement.     | Canonical successful receipt; one exact operator `OrderCreated`; seller/buyer/reviewer/amount/deadlines/hash/zero fees match; actual fresh ID/hash read back; Pending/uncollected. Save the checkout link and transaction hash.                                                          |
| **2**        | Buyer opens that actual fresh link and confirms **only exact USDC allowance 1000000** to `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea`.                                                     | Genuine Circle test-USDC `Approval`, owner buyer, spender collector, exact value; resulting allowance 1000000, no payment transfer.                                                                                                                                                      |
| **3**        | Buyer confirms **only CPP preapproval of the exact fresh PaymentInfo**.                                                                                                                    | Collector `PaymentPreApproved` for the actual fresh hash; `isPreApproved` true, immutable terms unchanged, no token transfer.                                                                                                                                                            |
| **4**        | Buyer confirms **only reservation of 1 test USDC** before the reserve cutoff.                                                                                                              | Exact `PaymentAuthorized`, buyer → TokenStore 1000000 transfer and `OrderFunded`; Reserved, CPP `(true,1000000,0)`; seller remains unpaid for this order. Expected buyer 20 → 19 if no unrelated activity.                                                                               |
| **5**        | Seller enters a new controlled-test acknowledgment identifying this fresh order/reservation and confirms **only delivery notice**. State explicitly that no physical delivery is asserted. | Exact order/evidence-hash `DeliveryNoted`; no money movement; still Reserved. Delivery notice does not authorize release.                                                                                                                                                                |
| **6**        | Buyer reviews the fresh order and confirms **only explicit release of 1 test USDC**.                                                                                                       | Exact zero-fee `PaymentCaptured`, TokenStore → seller 1000000 transfer, buyer-authorized `OrderReleased`; Released, held zero, captured accounting 1000000. Expected seller 1 → 2 and buyer remains 19 if no unrelated activity. Never describe refundable accounting as retained funds. |

After each confirmation, record the canonical hash and let the application verify the receipt. If the browser refreshes or the UI cannot verify an outcome, use **Recheck saved transaction — no signature**. Supply the actual hash from wallet history when necessary. Do not submit the transaction again on the strength of a timeout/error alone. An upgrade-only wallet transaction does not establish the requested action; stop and inspect history if one is reported.

At every gate stop on a wrong chain/account, changed recipient/amount/reviewer/deadline/hash, nonzero platform fee, unexpected token transfer/approval, unrelated upgrade, duplicate creation, expiry or failed receipt proof. Authorization of one gate never authorizes the next. No new delegation change is requested by Dealza.

The remaining funded-cancellation, reviewer-decision and expiry-recovery live branches require their own fresh orders and separate authorizations. Do not try them on a Released order. A dispute does not pause expiry; physical delivery, reviewer fairness and post-capture refunds are not guaranteed.

## After the fresh signed UI run

Retain its new receipts, balance transitions, pending/rejection/replacement observations, real wallet account/network switches and physical mobile results. Only then mark signed checkout PASS. Obtain separate deployment/push authorization before publishing. This packet is preparation for the November 9, 2026 target, not a claim of public availability or submission.
