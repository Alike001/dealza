# Final judge experience acceptance

Date: 7 November 2026. Baseline local HEAD and live origin/main: `97e887863e1a742389f9edf182d4b10416fcdf73`. Branch: `main`. Public baseline: https://dealza-drab.vercel.app. The existing reviewer-return label was already public. The improvements below were tested locally against the production build and are **not deployed**.

## Verdict

**PASS for both genuine completed journeys and the focused local UX changes.** Recommend publication after a separate release authorization. This task did not sign, broadcast, spend, create an order, push, or deploy. All browser sessions were disconnected. Existing audits [27](27-COMPLETE-REAL-UI-CHECKOUT.md) and [31](31-FIRST-LIVE-DISPUTE-AND-RETURN.md) remain original financial evidence; this report adds a fresh independent read-only verification.

## Problems and exact fixes

- Only the seller-payment example was readily discoverable. Home, orders, help and footer now link both genuine outcomes, clearly labelled as controlled Base Sepolia tests. These are navigation links and archived receipts, never seeded account history, fictional users or balances.
- The landing problem was indirect. It now says: “Online deals made in DMs need clearer payment agreements and a way to resolve disputes.” The terms/reviewer explanation remains concrete; delivery evidence is accurately optional.
- Completed orders still displayed “Your next step” and “Connect to take part.” Verified closed orders now show “Payment outcome”, an outcome-specific heading, the actual amount and recipient, and a visible settlement-receipt link. Read-only visitors need no wallet.
- Authentic receipts were buried in older history. The known genuine cases now have a prominent final receipt and expandable six-transaction archive above history. This archive supplements separately verified current state; unknown orders receive no invented archive.
- Missing description text was insufficiently explained. Wording now explains that the full link carries plaintext and the chain stores only its fingerprint. ID-only copies say that they exclude agreement text. Mismatches remain visibly unverified and are excluded from copied links.
- A delayed navigation animation frame could steal focus from a newly focused field or wallet control. The frame is cancelled on subsequent navigation/unmount and preserves active form/wallet focus. Test URL cleanup avoids a queued native hashchange leaking into another test.

The existing status derivation remains unchanged. Paid-to-seller, funded reserve return, unfunded cancellation, and expiry recovery receive distinct presentation. In particular, Voided does not imply a refund of a previously captured seller payment. The returned journey explicitly says the **uncaptured reserve** was returned and the seller was not paid for this order. Historical receipts do not prove physical delivery.

## Independently verified financial outcomes

Both `https://sepolia.base.org` and `https://base-sepolia-rpc.publicnode.com` independently agreed at block **55629721**, **2026-11-07T10:36:53.000Z**. Checks used chain ID 84532, pinned operator runtime, independently compared collector/escrow runtime hashes against existing deployment evidence, order/payment hashes, original description fingerprints, immutable actors, payment state, canonical receipt block membership and transaction index. All twelve known genuine receipts succeeded and had at least two confirmations. Raw decoded evidence, block hashes, timestamps and RPC methods are in [chain-acceptance.json](verification/final-judge-experience-2026-11-07/chain-acceptance.json). Reproduce with `node docs/verification/final-judge-experience-2026-11-07/acceptance.mjs /tmp/dealza-new-acceptance.json`; output uses exclusive creation, never overwriting existing evidence.

| Genuine case    | Contract status | Reserved | Captured | Verified final effect                      |
| --------------- | --------------- | -------- | -------- | ------------------------------------------ |
| Buyer release   | Released (4)    | 0 USDC   | 1 USDC   | Store transferred exactly 1 USDC to seller |
| Reviewer return | Voided (5)      | 0 USDC   | 0 USDC   | Store transferred exactly 1 USDC to buyer  |

USDC has six decimals: each verified settlement `Transfer.value` is `1000000`. Store: `0x57EC2910410C3Ef888c6127A3684d04171D5a11a`. Seller: `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`. Buyer: `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`. Reviewer: `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548`. Buyer balance was 19 USDC at the snapshot; this is not used as UI example data and can change through unrelated transfers. Both payment records were collected with zero current collector allowance. Persistent preapproval is not a remaining balance or allowance.

### Paid case

[Open original full agreement link](https://dealza-drab.vercel.app/#/order/0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd?terms=Dealza%20Checkpoint%206%3A%20fresh%20UI-only%201%20test-USDC%20checkout%3B%20controlled%20test%2C%20no%20physical%20delivery.).

Order: `0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd`.

Original exact description (from the original share link, not recovered from chain):

> Dealza Checkpoint 6: fresh UI-only 1 test-USDC checkout; controlled test, no physical delivery.

Fingerprint: `0x43f2dcc0b9930bc16b3b0d560a08dd7c00dae3949d2355e22b4387541d73b4c8`. It exactly matches the original URL text.

[Final settlement receipt](https://sepolia.basescan.org/tx/0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023): `0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023`; block **54007444**, **2026-11-03T16:29:17.000Z**.

`OrderReleased.authorizedBy` is the buyer; `PaymentCaptured.amount = 1000000`, fee zero, and exactly one USDC transfer pays the seller.

### Returned case

[Open original full agreement link](https://dealza-drab.vercel.app/#/order/0xbcb5e97254ce461b35efa91372f2d104f0f71c71ab5abff4f374ec36df4397d0?terms=Dealza%20Checkpoint%208%3A%20buyer%20dispute%20and%20reviewer%20return%3B%20controlled%20test%2C%20no%20physical%20delivery.).

Order: `0xbcb5e97254ce461b35efa91372f2d104f0f71c71ab5abff4f374ec36df4397d0`.

Original exact description (from the original share link, not recovered from chain):

> Dealza Checkpoint 8: buyer dispute and reviewer return; controlled test, no physical delivery.

Fingerprint: `0xccd6ceec3d964158dcbaa50098864f3879fa227175ee1283189a9417e67b6d32`. It exactly matches the original URL text.

[Final settlement receipt](https://sepolia.basescan.org/tx/0x3724fb79fef257a8dd5e2168b097755232d5299d90913591bb81d1049fc4e304): `0x3724fb79fef257a8dd5e2168b097755232d5299d90913591bb81d1049fc4e304`; block **55603005**, **2026-11-07T09:07:49.000Z**.

`DisputeResolved.releaseToSeller = false`; `OrderVoided.authorizedBy` is the named reviewer; `PaymentVoided.amount = 1000000`, and exactly one USDC transfer returns the reserve to the buyer. This was not a captured-payment refund.

## Share-link acceptance

[Real-browser link checks](verification/final-judge-experience-2026-11-07/links-and-new-sessions.json) passed for **both cases on both public production and local production preview**: exact original text, fingerprint match/no warning, real clipboard copy, refresh, dashboard URL entry, and reopening the copied link in an entirely new browser context. Clipboard permissions were granted only to the tested origin; no wallet was connected.

Bare order IDs correctly display a missing-description warning, do not invent plaintext, and copy an ID-only link. Altered terms correctly display a mismatch warning and are not treated as verified agreement text. Even these known example IDs never auto-fill from the example registry. Regression tests additionally cover URL encoding and copy/remount of Unicode and reserved punctuation (`+`, `&`, `%`, `#`, `?`, quotes). Unknown agreement text cannot be reconstructed from its hash. An ID-only link still permits independent payment/receipt inspection.

## Responsive, accessibility and keyboard acceptance

Baseline screenshots are the public application; after screenshots are the local production build at `http://127.0.0.1:4181`. Each set covers home, orders, both checkouts, help, and the open wallet interface at **320, 390, 768 and 1440 px**: 48 screenshots total. No horizontal overflow occurred. Before/after inspection preserves readable amounts, wrapped addresses, visible warnings and focus indicators. All route checks have zero axe-core 4.10.3 violations, including contrast; the local open-wallet checks also have zero violations. The isolated automation contexts bypass CSP solely to inject axe; production CSP was not changed. Automated checks complement visual inspection, not a claim of universal accessibility.

| Width     | Public baseline checks                                                      | Local build checks                                                         |
| --------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 320, 390  | [Results](verification/final-judge-experience-2026-11-07/before-small.json) | [Results](verification/final-judge-experience-2026-11-07/after-small.json) |
| 768, 1440 | [Results](verification/final-judge-experience-2026-11-07/before-large.json) | [Results](verification/final-judge-experience-2026-11-07/after-large.json) |

Screenshot comparisons (each cell links the full-size artifact):

| Width | Home before / after                                                                                                                                         | Paid before / after                                                                                                                                         | Returned before / after                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 320   | [Before](verification/final-judge-experience-2026-11-07/before-home-320.png) / [After](verification/final-judge-experience-2026-11-07/after-home-320.png)   | [Before](verification/final-judge-experience-2026-11-07/before-paid-320.png) / [After](verification/final-judge-experience-2026-11-07/after-paid-320.png)   | [Before](verification/final-judge-experience-2026-11-07/before-returned-320.png) / [After](verification/final-judge-experience-2026-11-07/after-returned-320.png)   |
| 390   | [Before](verification/final-judge-experience-2026-11-07/before-home-390.png) / [After](verification/final-judge-experience-2026-11-07/after-home-390.png)   | [Before](verification/final-judge-experience-2026-11-07/before-paid-390.png) / [After](verification/final-judge-experience-2026-11-07/after-paid-390.png)   | [Before](verification/final-judge-experience-2026-11-07/before-returned-390.png) / [After](verification/final-judge-experience-2026-11-07/after-returned-390.png)   |
| 768   | [Before](verification/final-judge-experience-2026-11-07/before-home-768.png) / [After](verification/final-judge-experience-2026-11-07/after-home-768.png)   | [Before](verification/final-judge-experience-2026-11-07/before-paid-768.png) / [After](verification/final-judge-experience-2026-11-07/after-paid-768.png)   | [Before](verification/final-judge-experience-2026-11-07/before-returned-768.png) / [After](verification/final-judge-experience-2026-11-07/after-returned-768.png)   |
| 1440  | [Before](verification/final-judge-experience-2026-11-07/before-home-1440.png) / [After](verification/final-judge-experience-2026-11-07/after-home-1440.png) | [Before](verification/final-judge-experience-2026-11-07/before-paid-1440.png) / [After](verification/final-judge-experience-2026-11-07/after-paid-1440.png) | [Before](verification/final-judge-experience-2026-11-07/before-returned-1440.png) / [After](verification/final-judge-experience-2026-11-07/after-returned-1440.png) |

Orders, help and wallet screenshots use the same `before/after-{orders,help,wallet}-{width}.png` naming in the evidence folder. The JSON records the actual asset URLs, viewport and observed state for reproducibility.

[Keyboard evidence](verification/final-judge-experience-2026-11-07/keyboard.json): Enter opens verified history with focus moved to its summary, expands all-six receipts, and opens the agreement for both completed cases. Wallet dropdown Escape returns focus to its trigger at all four widths. Navigation-focus regression tests ensure typing focus is retained. No connect-provider or transaction button was activated.

## RPC failure and history acceptance

[Real-browser RPC failure/recovery](verification/final-judge-experience-2026-11-07/rpc-recovery.json), both completed cases:

- Fresh initial RPC failure displays an error and no success badge or completion amount.
- Failure after a valid read retains the known outcome, amount and recipient, labels it “Last verified outcome”, and displays the stale-data warning. Existing action pausing and retry logic are unchanged.
- A successful read-only retry clears the error and restores current verified presentation.

[History browser evidence](verification/final-judge-experience-2026-11-07/history.json) confirms a real empty recent range and one earlier-page query remain explicitly partial, never “no transactions exist.” The genuine events are older than those queried ranges. All twelve historical receipt links were independently verified via both RPCs; the UI archive makes them available without forcing a lengthy historical scan. Pagination, event verification, explorer links and failed-page retry behavior remain unchanged and covered by the existing suite. Account history is never populated with the example cases as fictional user activity.

## Regression results and preservation

- Full frontend suite: **330 tests passed, 18 files** (`npm run test --workspace web -- --maxWorkers=2`), including recorded genuine receipt replays and 22 new judge-experience cases. [Log](verification/final-judge-experience-2026-11-07/frontend-tests.txt).
- Focused judge/public/wallet suite: **43 tests passed, 3 files**.
- TypeScript: `npx tsc --noEmit --project web/tsconfig.json` passed. [Log](verification/final-judge-experience-2026-11-07/typescript.txt).
- ABI: `npm run abi:check` passed. [Log](verification/final-judge-experience-2026-11-07/abi-check.txt).
- Production build: `npm run build --workspace web` passed. [Log](verification/final-judge-experience-2026-11-07/build.txt). Existing dependency externalization warning for `ox/tempo` / `node:worker_threads` remains; no build failure.
- Prettier check and `git diff --check` passed for changed source and evidence/report files.
- Financial contracts, generated ABI, all `web/src/lib`, creation wizard, pending transaction component and checkout transaction feedback are byte-for-byte unchanged. The OrderPage execution block is unchanged. Authorization rules, guards, pending intents, hashing, receipt validation, EIP-7702 handling and wallet submission logic are preserved.
- All **209 pre-existing untracked diagnostic files** match their initial SHA-256 values. [Preservation result](verification/final-judge-experience-2026-11-07/preservation.json). No original financial evidence was overwritten; staging used explicit new/modified paths only.

## Exact source changes

`web/src/App.tsx`, `web/src/app-polish.css`; components `CompletedPaymentEvidence.tsx`, `GenuineJourneys.tsx` (new), `genuineJourneys.ts` (new), `LandingPage.tsx`, `OrderDetails.tsx`, `OrderPage.tsx`, `OrdersDashboard.tsx`, `PaymentGuidance.tsx`; tests `setup.ts`, `walletPolish.test.tsx`, `judgeExperience.test.tsx` (new), `recorded/judge-outcomes.json` (new). Documentation: this report and the newly created `verification/final-judge-experience-2026-11-07/` evidence only. Frozen test data comes from the genuine verified snapshots; browser acceptance itself uses live chain reads.

## Remaining limitations and publication recommendation

Public production remains the baseline until a separately authorized release. The local changes are recommended for publication after that release step. Neither a wallet connection nor financial execution was exercised; both journeys were already completed before this task. This is point-in-time acceptance, not continuous RPC availability monitoring or a new protocol audit. Current balances may change independently. Historical pagination was sampled, not exhaustively traversed in the browser; every curated receipt was independently checked instead. Plaintext terms are not onchain and cannot be recovered from an ID alone. Test USDC has no production monetary value; no physical delivery was proven. No external screen reader or mobile hardware test was performed.
