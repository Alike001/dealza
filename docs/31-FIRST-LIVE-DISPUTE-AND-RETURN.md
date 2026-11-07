# First live buyer dispute and reviewer return — Checkpoint 8

**Verification verdict: PASS.** This independent read-only audit confirms one full return of **1 test USDC** to the original buyer, authorized by the immutable reviewer. The live dispute/return is complete for this existing order. This is a void of an uncaptured reserve, not a refund of money previously paid to the seller, and it does not prove delivery or the truth of the offchain evidence.

- Order: `0xbcb5e97254ce461b35efa91372f2d104f0f71c71ab5abff4f374ec36df4397d0`.
- Reviewer resolution transaction: **`0x3724fb79fef257a8dd5e2168b097755232d5299d90913591bb81d1049fc4e304`** — [Base Sepolia receipt](https://sepolia.basescan.org/tx/0x3724fb79fef257a8dd5e2168b097755232d5299d90913591bb81d1049fc4e304).
- Resolution block: **55603005**, transaction index **2**, **7 November 2026, 09:07:49 UTC / 10:07:49 Africa/Lagos** (Unix `1794042469`).
- Resolution block hash: `0x6a483183a0b39bb453bd168c477d7250534b2446a031f043f829e8997e6d0af3`.
- Parent block hash: `0x55ff452d9e6f8a6975b2cc9cca7ff66593a2b08887381a82138022cdb7d7f77a`; this equals the independently read B−1 header.
- Both RPC heads were **55604919**, giving **1915 confirmations** at the audit. Latest common state snapshot: **55604917**, **2026-11-07 09:14:12 UTC**, hash `0x1324b0c1e442c29de7bc2dc20ae4a07a03705a09dc35c99faf071cdc9b6b94ed`.

## Independent method and scope

Both `https://sepolia.base.org` and `https://base-sepolia-rpc.publicnode.com` independently supplied matching receipts, transactions, canonical block membership, headers, decoded financial events, B−1/B/current order/payment state, balances, allowance, pinned runtime hashes and immutable bindings. Receipt success was checked independently of the UI. The lifetime event scan covers **every block from 55548118 through 55604917**, using 200-block ranges on the official RPC and 10,000-block ranges on PublicNode.

Evidence: [dual-RPC audit](verification/first-live-dispute-return-2026-11-07/audit.json), [full lifetime history](verification/first-live-dispute-return-2026-11-07/history.json), [additional checks and terminal-call reverts](verification/first-live-dispute-return-2026-11-07/checks.json). No wallet client, private key, signing or send/broadcast RPC was used. Calls used actual historical storage; there were no state/code/balance overrides.

## Exact actors, custody and immutable terms

| Field                                    | Independently verified value                                         |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Buyer / original payer                   | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`                         |
| Seller / payment receiver                | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`                         |
| Immutable reviewer                       | `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548`                         |
| Dealza operator                          | `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`                         |
| Test USDC, 6 decimals                    | `0x036CbD53842c5426634e7929541eC2318f3dCF7e`                         |
| Preapproval collector                    | `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea`                         |
| CPP escrow                               | `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c`                         |
| CPP TokenStore                           | `0x57EC2910410C3Ef888c6127A3684d04171D5a11a`                         |
| Amount                                   | 1 test USDC = `1000000` base units                                   |
| Payment hash, recomputed by CPP          | `0xa54d9ac0ad91b6e42ab2a0bb103c29dedff2a3739fe2f84a0fccfcd2799a1fcf` |
| Original terms fingerprint               | `0xccd6ceec3d964158dcbaa50098864f3879fa227175ee1283189a9417e67b6d32` |
| Reserve deadline                         | 7 November 2026, 18:45 UTC / 19:45 Lagos (`1794077100`)              |
| Review / authorization / refund deadline | 8 November 2026, 18:45 UTC / 19:45 Lagos (`1794163500`)              |
| Fee bounds / fee receiver                | 0 / 0 bps; `0x0000000000000000000000000000000000000000`              |

The payment tuple, reviewer, description fingerprint and payment hash are unchanged across the preceding block, receipt block and current audited snapshot. The original description remains:

> Dealza Checkpoint 8: buyer dispute and reviewer return; controlled test, no physical delivery.

The existing share URL is unchanged: [Checkpoint 8](https://dealza-drab.vercel.app/#/order/0xbcb5e97254ce461b35efa91372f2d104f0f71c71ab5abff4f374ec36df4397d0?terms=Dealza%20Checkpoint%208%3A%20buyer%20dispute%20and%20reviewer%20return%3B%20controlled%20test%2C%20no%20physical%20delivery.).

## Decoded reviewer decision and receipt events

The decoded operator action is `resolve(orderId, false, decisionHash)`. `false` means return the full reserve to the buyer, rather than release it to the seller.

- Decision hash: `0x29c68db65a0010d5b586989795a4ba3bf295e05e28289b3dfffc952626773c44`.
- Earlier dispute evidence hash: `0x561d2398332b6e059d30fa3f2031dd4d1309629b3cd200f626d7dc55d9c4492c`.
- Dispute opened by: `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25` (the named buyer).

| Receipt log index | Verified emitter                                        | Decoded event and effects                                            |
| ----------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| 1                 | CPP escrow `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c` | `PaymentVoided(paymentInfoHash, 1000000)`; exact stored payment hash |
| 2                 | USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`       | `Transfer(TokenStore, buyer, 1000000)`                               |
| 3                 | Operator `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`   | `OrderVoided(orderId, authorizedBy=reviewer)`                        |
| 4                 | Operator `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`   | `DisputeResolved(orderId, releaseToSeller=false, decisionHash)`      |

The return Transfer is **from `0x57EC2910410C3Ef888c6127A3684d04171D5a11a` to `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`**, not to the operator, seller or reviewer. It is the only USDC Transfer in the receipt and the only USDC Transfer involving buyer/seller/TokenStore anywhere in the resolution block.

This is a genuine **EIP-7702 routed transaction**. Its outer sender is `0xb01caea8c6c47bbf4f4b4c5080ca642043359c2e` and outer target is `0xdb9b1e94b5b69df7e401ddbede43491141047db3`, with zero ETH call value. They are not assumed to be the reviewer and operator. Reviewer authorization is established by the pinned operator's exact authorizer/state checks, canonical events, immutable reviewer and resulting financial effects. Current buyer/seller/reviewer code indicators are recorded in `checks.json` and point to the existing delegation implementation.

Two byte occurrences of the identical encoded inner `resolve` call exist in the routed envelope (offsets 1432 and 1912). They decode to the same tuple. Byte occurrences are not execution counts: the canonical receipt, lifetime log scan and token balance deltas establish **one** settlement. Auxiliary wallet infrastructure logs 0 and 5 are retained raw, and are not substituted for financial authorization evidence.

## Exact balance and state evidence

Balances are USDC base units interpreted with the independently checked six decimals. The B−1 and B headers both have timestamp 09:07:49 UTC; their distinct block identities and parent relationship are checked.

| Read                          |    B−1: 55603004 |        B: 55603005 | Audited current: 55604917 |
| ----------------------------- | ---------------: | -----------------: | ------------------------: |
| Buyer USDC                    |               18 |             **19** |                    **19** |
| Seller USDC                   |                2 |              **2** |                     **2** |
| Reviewer USDC                 |                0 |                  0 |                         0 |
| Operator USDC                 |                0 |                  0 |                         0 |
| Shared TokenStore USDC        |                1 |              **0** |                     **0** |
| Stored / derived order status | Disputed (3) / 3 | **Voided (5) / 5** |        **Voided (5) / 5** |
| CPP collected flag            |             true |               true |                      true |
| Held / reserved               |                1 |              **0** |                     **0** |
| Captured accounting           |                0 |              **0** |                     **0** |
| Buyer→collector allowance     |                0 |              **0** |                     **0** |
| Exact-hash preapproval flag   |             true |               true |                      true |

The buyer received **exactly +1 USDC**, the TokenStore lost exactly 1 USDC, and the seller's balance did not change. There is no residual collector spending allowance. The persistent `preApproved=true` flag is historical exact-terms authorization, not an ERC20 allowance or remaining reserve; `collected=true` also retains protocol history. Neither flag means funds remain held. The terminal operator state and failed replay calls below prevent repeating this order's settlement.

These balances are timestamped observations. Unrelated transfers outside the audited receipt/block may change future wallet balances; the exact receipt and B−1/B deltas establish this return independently of such later activity.

## Complete confirmed chronology and duplicate-settlement check

| Verified event(s)                                     |    Block | Timestamp               | Genuine transaction                                                                                                                                                      |
| ----------------------------------------------------- | -------: | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OrderCreated                                          | 55548118 | 2026-11-07 06:04:52 UTC | [0xfa9c7845e4d5da67b9da3f82ef82c964f681c121e398fb2eb497564e08fba390](https://sepolia.basescan.org/tx/0xfa9c7845e4d5da67b9da3f82ef82c964f681c121e398fb2eb497564e08fba390) |
| Approval                                              | 55582209 | 2026-11-07 07:58:30 UTC | [0x3f9e2f6a633c1d878f4542ee542df298cb117087e7c2b2bb16d1da22d170c664](https://sepolia.basescan.org/tx/0x3f9e2f6a633c1d878f4542ee542df298cb117087e7c2b2bb16d1da22d170c664) |
| PaymentPreApproved                                    | 55596022 | 2026-11-07 08:44:33 UTC | [0xef703b1a8350e4d66b9d9ff3c7f34776f38af746f0617b1836aa365b4412259c](https://sepolia.basescan.org/tx/0xef703b1a8350e4d66b9d9ff3c7f34776f38af746f0617b1836aa365b4412259c) |
| PaymentAuthorized, Transfer, OrderFunded              | 55598634 | 2026-11-07 08:53:15 UTC | [0x4e3ffff0a2e567effebeb1e6f11c17f19bda00fce9d70e7724efab006df4e9df](https://sepolia.basescan.org/tx/0x4e3ffff0a2e567effebeb1e6f11c17f19bda00fce9d70e7724efab006df4e9df) |
| DisputeOpened                                         | 55600106 | 2026-11-07 08:58:10 UTC | [0xf1bddacd50bf6cd0cb226fb97ccdd09117750d2a300698472b68e683c26515a6](https://sepolia.basescan.org/tx/0xf1bddacd50bf6cd0cb226fb97ccdd09117750d2a300698472b68e683c26515a6) |
| PaymentVoided, Transfer, OrderVoided, DisputeResolved | 55603005 | 2026-11-07 09:07:49 UTC | [0x3724fb79fef257a8dd5e2168b097755232d5299d90913591bb81d1049fc4e304](https://sepolia.basescan.org/tx/0x3724fb79fef257a8dd5e2168b097755232d5299d90913591bb81d1049fc4e304) |

The scan finds exactly one `OrderCreated`, `PaymentAuthorized`, `OrderFunded`, `DisputeOpened`, `PaymentVoided`, `OrderVoided` and `DisputeResolved`. It also records one exact allowance Approval and one `PaymentPreApproved`. The token allowance event is buyer/collector scoped; the order and protocol events are bound to the exact order ID/payment hash.

There are **no** matching `PaymentCaptured`, `OrderReleased`, `PaymentReclaimed` or `RecoverySynced` events, and no second return or resolution through the scanned canonical head. All six distinct transaction receipts in the chronology are successful and canonical on both RPCs. The three public history entries for the resolution are three distinct events from **one** transaction, not duplicate settlements.

## Read-only rejection of further settlement

Both RPCs execute `eth_call` at the audited terminal block, with the correct intended actors and exact immutable inputs. Every call reverts with **`InvalidState()`**, selector **`0xbaf3f0f7`**:

| Intended caller | Attempted action                                   | Result on both RPCs |
| --------------- | -------------------------------------------------- | ------------------- |
| Reviewer        | Repeat `resolve(id,false,decisionHash)`            | InvalidState        |
| Reviewer        | Change decision to `resolve(id,true,decisionHash)` | InvalidState        |
| Buyer           | Ordinary `release(id)`                             | InvalidState        |
| Seller          | Repeat voluntary return via `cancel(id)`           | InvalidState        |
| Buyer           | Repeat `fund(id,exactPayment)`                     | InvalidState        |

These are contract-state rejections, not RPC transport failures, wrong-actor failures or insufficient-gas errors. No call was signed or broadcast, and no assets were spent by this audit. The simulations test intended inner contract calls; they are not new MetaMask envelope submissions.

## Public frontend reconciliation and UI-only clarification

A fresh, disconnected inspection of the public checkout showed **Cancelled**, no active deadline, 0 USDC reserved and 0 captured. Its recent history shows the real resolution's reviewer-decision hash, 1-USDC `PaymentVoided`, and order-closure event, all linking to `0x3724fb79fef257a8dd5e2168b097755232d5299d90913591bb81d1049fc4e304` at block 55603005. Its partial-history notice is accurate: the independent lifetime scan supplies the older events omitted by the current page window. See [public page capture](verification/first-live-dispute-return-2026-11-07/public-ui.json).

The served asset `/assets/index-Dikv40YH.js` is byte-for-byte equal to the baseline local build; [its SHA-256](verification/first-live-dispute-return-2026-11-07/public-asset.json) is recorded. The user's session-specific “Reviewer decision confirmed” toast was not inspected in that fresh disconnected session. Its underlying exact receipt/effects were independently verified, and the genuine frozen receipt now drives a regression of that same action-specific feedback.

“Cancelled” accurately names the broad Voided class but hides whether any reserve existed. A small **local UI-only improvement** now uses **Returned to buyer** for a financially consistent Voided order with `collected=true`, while retaining **Cancelled** for an unfunded void. The original verifier still returns its unchanged `Cancelled` classification and the contract remains **Voided (5)**. The presentation wrapper does not alter payment hashing, status codes, permission checks, transaction submission or receipt security. Verification details explicitly expose the retained Voided state.

This label describes return of an uncaptured funded reserve; it does not claim a captured-payment refund or infer the authorizer from stored status alone. Reviewer attribution comes from the verified decision receipt. Dashboard list summaries remain unchanged where only the existing summary status is available, rather than inferring a return without full verified state. Nothing was pushed or deployed; production retains its existing label until separately released.

## Regressions and verification

- Targeted receipt, routing, return UI and history regressions: **117 tests passed across 5 files** ([log](verification/first-live-dispute-return-2026-11-07/targeted-tests.txt)).
- Full frontend suite: **308 tests passed across 17 files**, `npm run test --workspace web -- --maxWorkers=2` ([final log](verification/first-live-dispute-return-2026-11-07/regression-tests.txt)).
- New frozen genuine receipt tests pass the existing canonical-receipt and exact-effect verifiers, reject a missing USDC return, duplicate settlement event and wrong authorizer, preserve all terminal permissions, and distinguish funded return from unfunded cancellation and inconsistent accounting.
- An unrelated existing wallet-focus regression initially failed because queued hashchange/focus work from the preceding test could close the next test's wallet panel. The test now drains that prior navigation frame before mounting; all original focus assertions remain. Its isolated rerun and full suite pass. No production wallet code changed.
- TypeScript, ABI provenance, production build and formatting: PASS. The build retains the pre-existing ox/tempo `node:worker_threads` externalization warning.
- The new local production build was inspected against the real order at **320, 390, 768 and 1440px**, with no wallet connected, no overflow, zero automated WCAG A/AA violations, no recommended wallet action, and explicit **Returned to buyer / Voided (5)** ([browser checks](verification/first-live-dispute-return-2026-11-07/local-ui-checks.json)).
- The order execution/gateway/receipt-update function is byte-for-byte unchanged from baseline `3ec9615`. Contracts, ABIs and all financial-library sources are unchanged. All **207 pre-existing untracked diagnostic files** retain their original SHA-256 hashes ([preservation record](verification/first-live-dispute-return-2026-11-07/preservation.json)).

## Reproduce read-only checks

Node 24 and the repository's existing dependencies are sufficient. Each script rejects signing/send RPC methods and writes only to a fresh output file (`wx`); it will not overwrite frozen evidence.

```sh
node docs/verification/first-live-dispute-return-2026-11-07/audit.mjs /tmp/dealza-return-new-audit.json
node docs/verification/first-live-dispute-return-2026-11-07/history.mjs /tmp/dealza-return-new-audit.json /tmp/dealza-return-new-history.json
node docs/verification/first-live-dispute-return-2026-11-07/checks.mjs /tmp/dealza-return-new-audit.json /tmp/dealza-return-new-checks.json
```

A rerun observes a newer current head and confirmations; the historical resolution block and transaction remain fixed. The current-balance checks expect the recorded 19/2 USDC balances; unrelated later movements can change those checks without invalidating the historical B−1/B return proof. Raw archived receipts/state are also frozen in `web/src/test/recorded/checkpoint8-return.json` for regression replay without RPC access.

## Limitations

The verdict covers the recorded canonical blocks and state, not future unrelated wallet transfers. The routed outer transaction and all logs are archived, but a full wallet-manager execution trace was not decoded; exact operator/protocol/token effects and canonical identity are verified independently. Evidence/decision plaintext was not recovered or validated from its hash. This audit does not attest physical delivery, fairness of the reviewer's decision or the physical MetaMask interaction. No new wallet signature, live transaction, Solidity/ABI/financial-rule change, push or deployment occurred.
