# Complete six-gate real MetaMask UI checkout

**PASS: all six gates settled on Base Sepolia.** User reports every submission through the actual Dealza frontend and MetaMask. Independent receipt/state evidence and production frontend reconciliation support each financial outcome. This is a controlled test: **no physical delivery occurred**. It proves the happy path, not live acceptance of every dispute/recovery branch.

## Exact checkout identity

- Order: **0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd**.
- Payment hash: **0x146b39003d621a9f7dbfc083bb8ce77c6ddb00022a5a384681114cc6cefcf1e6**.
- Operator: **0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8**.
- Buyer: **0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25**.
- Seller/receiver: **0xF74aD341e10187073a0eef55356D136F1be5E3Cf**.
- CPP escrow: **0xf96815976523E00e65Be8f34cA5e64b4f41EB19c**.
- Collector: **0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea**.
- Operator TokenStore: **0x57EC2910410C3Ef888c6127A3684d04171D5a11a**.
- Test USDC: **0x036CbD53842c5426634e7929541eC2318f3dCF7e**, 6 decimals. Amount **1000000 raw = 1 USDC**. Fee **0**.

## The six confirmed transactions

| Gate                                | Exact transaction                                                                                                                                                        | Block    | Authentic effects                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Seller creates order             | [0x057a937ac93132743a53276eefcd7023d3ae72210410fbcee6dc6fdf4fb84567](https://sepolia.basescan.org/tx/0x057a937ac93132743a53276eefcd7023d3ae72210410fbcee6dc6fdf4fb84567) | 53938394 | OrderCreated; exact immutable terms. Buyer 20 / seller 1 / custody 0.                                                                    |
| 2. Buyer exact allowance            | [0x7807edd5f7838a287a8723268b0f5b3aba7d7e87a44a87a032ccb6359b7b7133](https://sepolia.basescan.org/tx/0x7807edd5f7838a287a8723268b0f5b3aba7d7e87a44a87a032ccb6359b7b7133) | 53979603 | USDC Approval(owner=buyer, spender=collector, value=1000000). No Transfer.                                                               |
| 3. Buyer terms authorization        | [0x3bdd6c65eea5c193abc0dce78b0a92314d459f9cfb38615469977977652ee62c](https://sepolia.basescan.org/tx/0x3bdd6c65eea5c193abc0dce78b0a92314d459f9cfb38615469977977652ee62c) | 53987356 | Collector PaymentPreApproved(exact payment hash). No Transfer.                                                                           |
| 4. Buyer reservation                | [0xcb162300071bc1ae68e081045050fd50d495de93d7651dfc45fe291b4912802b](https://sepolia.basescan.org/tx/0xcb162300071bc1ae68e081045050fd50d495de93d7651dfc45fe291b4912802b) | 53991659 | PaymentAuthorized + Transfer(buyer,TokenStore,1000000) + OrderFunded. Buyer 20 → 19; custody 0 → 1; allowance 1 → 0.                     |
| 5. Seller controlled acknowledgment | [0x2dec3e64944f1bc6db00051079e8f86edf671d454de99977cdacf3a8b081e0c0](https://sepolia.basescan.org/tx/0x2dec3e64944f1bc6db00051079e8f86edf671d454de99977cdacf3a8b081e0c0) | 54002282 | DeliveryNoted(exact order/evidence). Buyer 19 / seller 1 / custody 1, unchanged; Reserved.                                               |
| 6. Buyer release                    | [0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023](https://sepolia.basescan.org/tx/0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023) | 54007444 | PaymentCaptured(fee=0) + Transfer(TokenStore,seller,1000000) + OrderReleased(authorizedBy=buyer). Seller 1 → 2; custody 1 → 0; Released. |

Gate 2 was rediscovered with a bounded indexed USDC Approval query between this fresh creation and current settlement. Both RPCs agree on its canonical successful receipt; exact owner/spender/value and absence of Transfer are verified. Other gates retain their prior independent receipt evidence. [Machine-readable summary](verification/real-ui-gate6/summary.json).

## Final settlement proof

Both **https://sepolia.base.org** and **https://base-sepolia-rpc.publicnode.com** agree on the exact release transaction/receipt, canonical block inclusion, immutable order/payment, before/after/current balances and protocol state. Current snapshot **54009238**, **2026-11-03T16:35:16.000Z**, hash `0x7be17fb25cd51e5a76981699b28d73cfa04f002db8725ffd519fe904bd61eeb3`.

The actual type-2 relayed transaction carries exactly one default-mode zero-value `release(orderId)` call to the pinned operator through the verified delegation manager. Its `RedeemedDelegation` identifies the named buyer as root delegator. The outer relayer is not mistaken for the buyer. Operator/CPP/collector runtimes and bindings still match pins.

Authentic pinned-emitter settlement events:

- CPP **PaymentCaptured(paymentInfoHash,1000000,0,zeroAddress)**.
- USDC **Transfer(TokenStore,seller,1000000)** — exactly one token Transfer in the full receipt.
- Operator **OrderReleased(orderId,authorizedBy=buyer)**.

| Final value                               | Verified result          |
| ----------------------------------------- | ------------------------ |
| Order stored/derived                      | **Released (4)**         |
| Buyer balance                             | **19 USDC**              |
| Seller balance                            | **2 USDC**               |
| Specific payment capturable/reserved      | **0**                    |
| Operator TokenStore USDC                  | **0**                    |
| Captured                                  | **1000000 raw / 1 USDC** |
| Collector allowance                       | **0**                    |
| Operator / collector / CPP singleton USDC | **0 / 0 / 0**            |
| Platform/capture fee                      | **0**                    |

CPP `paymentState` is **(true,0,1000000)**. Its final third field is captured/refundable accounting, **not retained refund liquidity**. Full indexed history contains exactly one each of OrderCreated, PaymentPreApproved, PaymentAuthorized, OrderFunded, DeliveryNoted, PaymentCaptured and OrderReleased. No duplicate settlement, refund, dispute or unexpected payment event exists. Both RPCs independently reject a read-only duplicate `release(id)` with **InvalidState**. No duplicate transaction was broadcast.

The release mined **November 3, 2026, 16:29:17 UTC**, before the existing **November 6, 11:00 UTC** release/review deadline. Blockscout's independent public transaction API also reports the exact successful hash/block. [Raw chain evidence](verification/real-ui-gate6/evidence.json), [explorer response](verification/real-ui-gate6/explorer-release-response.json).

## Frontend diagnosis and correction

The initial user screenshot was reported after the verified receipt callback, before the separate page refresh completed. Previously the gateway verified exact receipt-block post-state but discarded it when notifying the UI; the old Reserved card remained until another RPC read. A lagging provider could return older state, and a failed refresh cleared the known record. The transaction confirmation was genuine; that stale card was not evidence of failed release.

**Fixed in `7ac9d4f`:** confirmation carries the already-verified receipt-block OrderSnapshot; the page applies it immediately, invalidates older in-flight reads and never rolls back to a lower block. Saved receipt reconciliation updates the visible order too. Failed refreshes retain the last verified record, explicitly label the unavailable latest update, pause actions and retry automatically. No optimistic financial state or Solidity change was introduced. Viem supports block-pinned reads via [`readContract.blockNumber`](https://viem.sh/docs/contract/readContract); receipt confirmation and later latest-block reads are separate operations.

Verified browser behavior:

- Live production gateway replay of the genuine final release emits confirmed with **Released snapshot at block 54007444**, clears the isolated intent and reads current held 0/captured 1.
- Public checkout shows **Paid to seller**, **0 USDC reserved**, **1 captured**; reload restores the same values.
- **Load earlier activity** reveals **Release recorded** and **USDC paid to seller**, both linking to the exact genuine final transaction. Recent history is explicitly bounded; older events requiring pagination is expected.
- Actual completed buyer OrderPage, with a read-only identity adapter and live RPC reads, shows **No payment action is available** and no release button. No wallet signing/sending is available in the adapter.
- Regression checks reproduce delayed confirmation refresh, lagging reads, failed post-confirmation reads, automatic polling and saved receipt reconciliation.

[Settled screenshot](verification/real-ui-gate6/settled-checkout.png), [history/links](verification/real-ui-gate6/browser-settlement-history.json), [reload](verification/real-ui-gate6/browser-refresh.json), [completed buyer](verification/real-ui-gate6/browser-completed-buyer.json), [actual release replay](verification/real-ui-gate6/frontend-release-replay.json). The built production preview also independently reads the settled order: [production preview](verification/real-ui-gate6/production-preview.json), [artifact/configuration check](verification/real-ui-gate6/production-config-check.json). Host-specific public-origin acceptance remains pending. Automation did not access the user's private browser/MetaMask session.

## Verification results

- **226 frontend tests**, including four new stale-settlement regressions: PASS.
- **46 default contract unit/fuzz/invariant tests**: PASS.
- **36 pinned-chain fork tests**, including reviewer/dispute/return/expiry enforcement: PASS. These alter an isolated fork only.
- **13 Python script tests**: PASS.
- ABI provenance, TypeScript and production build: PASS, Node **24.14.1**.
- Exact public-source evidence validator: PASS (creation/runtime/raw metadata, 15 source contents, ABI and dependency pins).
- Initial repository audit: all **19 existing local commits**, the sole `master` branch, **502 current files** and **440 historical blobs** reviewed with high-confidence credential patterns; no matches or sensitive local environment/key filenames found. No remote is configured. Pattern scanning is not a guarantee against every secret format.

[Web tests](verification/real-ui-gate6/web-tests.txt), [build](verification/real-ui-gate6/web-build.txt), [default contracts](verification/real-ui-gate6/contract-tests.txt), [fork tests](verification/real-ui-gate6/fork-tests.txt), [script tests](verification/real-ui-gate6/script-tests.txt), [repository inventory](verification/real-ui-gate6/repository-audit.json).

## Remaining public launch work and limits

No known failing core happy-path check remains. Public hosting, public-origin RPC/CORS/header acceptance, GitHub repository publication and demo/submission remain outstanding. Existing historical source/delegation evidence referenced by public docs is preserved; unreferenced diagnostic/draft files can remain local and do not enter a normal Git push.

Live signed UI paths for funded seller cancellation, both reviewer verdicts and unresolved-dispute expiry reclaim remain untested. Their contract/fork/fixture checks pass; do not market those as completed live UI acceptance or guarantee recovery. Physical mobile wallets and broader account/network/error-return behavior remain acceptance limits. The fixed reviewer cannot be replaced; disputes do not extend expiry; issuer controls can block USDC transfers; there is no guaranteed refund after capture.

Shortest path: use the existing static app and contracts, publish the reviewed Git commits when authorized, connect the repository to Vercel with root settings and Node 24, then verify the public settled-order link, history, CSP/RPC and wallet views. No backend, database, contract redeployment or extra payment is needed. [Exact launch runbook](28-PUBLIC-LAUNCH-RUNBOOK.md), [checklist](18-VIBEATHON-RELEASE-CHECKLIST.md).

Reproduce read-only settlement: `node web/scripts/verify-ui-gate6-settlement.mjs`. No signing, broadcast, token spending, financial Solidity edits, push or deployment occurred during this audit.
