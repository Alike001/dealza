# Checkpoint 6 — EIP-7702 receipt compatibility

**PASS for the implemented receipt verifier and tested routes. Fresh signed MetaMask checkout remains NOT TESTED.** Implementation commit: `af6b959`. No signing, spending, delegation change, network deployment, mainnet operation or GitHub push was performed. All new live network checks were reads.

## Investigation and authentic reproduction

All financial/nonfinancial submissions shared `chainGateway.send()`. Before this change, only `create()` supplied an event/read-back callback. Every `act()` action therefore required the **outer** sender, destination and calldata to equal the direct contract call. That rejected real relayed approvals, preapprovals, funding, delivery, cancellation and release even when their onchain effects were correct. Transaction type was not a reliable discriminator: the first creation/allowance receipts are type 4, while later delegated executions are ordinary type-2 relayer transactions.

The old direct-only predicate was reproduced against four authentic recorded successful receipts **before changing the submission path**: preapproval, funding, delivery and release all failed that predicate. [Reproduction output](verification/checkpoint-6/before-fix-reproduction.txt). This is a recorded-receipt regression, not a new signed checkout or a claim that a fresh failed transaction was broadcast.

The six lifecycle fixtures come from the independent evidence at `4baf3e8`. The duplicate cancellation was fetched again from official Base RPC and PublicNode: both returned the same successful canonical receipt. [Cancellation source](verification/checkpoint-6/cancellation-live.json). Its Pending → Voided branch is established by the genuine seller-authorized event and absence of CPP/token effects; the stored immutable duplicate terms were already independently checked. It is an **unfunded cancellation**, not live proof of a funded refund.

## Strict common proof

`receiptProof.ts` handles shared receipt/event checks; `chainGateway.ts` supplies action-specific intent and authoritative reads. Direct and routed calls both require the proof; being type 4, coming from a manager, or having a successful outer receipt is never sufficient.

1. The read connection must be Base Sepolia **84532**. The submitted hash must match the received hash or a reported replacement. Reconciliation binds the candidate hash to the saved intent.
2. Fetch the receipt again, transaction, canonical block and current head. Require successful status, matching receipt/log content, transaction hash/chain/block identity, inclusion in that block and at least two observed L2 confirmations. This does not assert Ethereum L1 finality.
3. Reject empty-calldata account-upgrade-only receipts, missing inclusion/confirmations, conflicting/removed/misidentified logs and nonzero outer ETH value. Direct calls at the expected target also retain exact sender and calldata matching.
4. Verify operator/CPP/collector executable hashes and immutable bindings at the receipt block using existing pinned ABI/runtime evidence. Decode relevant logs strictly and only at the configured operator, escrow, collector and Circle test-USDC addresses.
5. Match the **exact** expected Dealza/CPP/USDC event sequence, actors, order/hash, immutable PaymentInfo, evidence/decision hash, token, recipients, amount and zero capture fee. Missing events or additional relevant approvals/transfers/actions fail. CPP's correctly bound lazy `TokenStoreCreated` event is supported.
6. Read the order, derived status, exact CPP hash/state, collector preapproval/allowance and token custody at the **receipt block**. Using only latest state would incorrectly reject an earlier allowance already consumed by funding or an earlier reserve already paid out. Verify immutable terms against the saved intent. Recheck the canonical block hash after state verification.
7. Emit confirmed UI state only after all required checks. Current displayed payment status still comes from fresh verified contract reads.

Outer sender equality is not used to identify the buyer/seller in a routed transaction. Genuine events plus the **pinned deployed contract's access checks** establish effective authorization. Auxiliary wallet events are not payment proof. This verifier attests the requested Dealza/USDC operation; it is not an audit of wallet implementation security or unrelated assets.

## Action-specific proof

| Action                              | Required exact events / authority                                                                                              | Required receipt-block effect                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approve / revoke                    | Circle USDC `Approval`, owner = saved payer, spender = pinned collector, value = exact order amount / zero                     | Exact resulting allowance; order terms/status and CPP accounting unchanged.                                                                                      |
| CPP preapproval                     | Pinned collector `PaymentPreApproved` for exact CPP hash; payer-only deployed access check                                     | Exact-hash preapproval true; order and financial state unchanged.                                                                                                |
| Create                              | One operator `OrderCreated`; seller, named buyer/reviewer, description hash and all 12 PaymentInfo fields match reviewed terms | Exact created terms/hash read back, Pending, uncollected/zero CPP balances. A matching remembered creation reopens its verified order rather than sending again. |
| Unfunded cancel                     | `OrderVoided` for exact order and buyer/seller authorizedBy                                                                    | Voided; financial state unchanged; no invented refund transfer.                                                                                                  |
| Fund                                | Exact CPP `PaymentAuthorized` including complete PaymentInfo, buyer → deterministic TokenStore transfer, `OrderFunded`         | Reserved; `(collected=true, held=amount, captured=0)`; actual TokenStore balance covers the authorization.                                                       |
| Delivery                            | Exact `DeliveryNoted` evidence hash; seller-only access check                                                                  | Active Reserved/Disputed status and financial state unchanged. Delivery remains event-only, not a stored fulfillment flag.                                       |
| Dispute                             | Exact `DisputeOpened` by buyer/seller with evidence hash                                                                       | Disputed; financial state unchanged.                                                                                                                             |
| Buyer release                       | Zero-fee CPP `PaymentCaptured`, exact TokenStore → seller USDC transfer, `OrderReleased` authorizedBy buyer                    | Released; held zero, captured accounting equals full amount.                                                                                                     |
| Reviewer full release / full return | Fixed reviewer actor; exact capture or void plus transfer; operator release/void and `DisputeResolved` bool/decision hash      | Released/captured full amount, or Voided/zero held and captured accounting. No partial award or replacement reviewer.                                            |
| Funded seller cancellation          | Exact `PaymentVoided`, TokenStore → payer full return, `OrderVoided` authorizedBy seller                                       | Voided; collected remains true, held/captured zero.                                                                                                              |
| Expiry reclaim                      | Payer, expired state, exact CPP `PaymentReclaimed` and full TokenStore → payer transfer                                        | CPP held/captured zero; derived Reclaimed while stored order may still be Reserved/Disputed.                                                                     |
| Recovery sync                       | `RecoverySynced` for exact reclaimed order; source permits anyone to sync bookkeeping                                          | Stored/derived Reclaimed, no financial movement.                                                                                                                 |

TokenStore is operator-wide; its aggregate balance may contain other payments. The verifier checks this payment's accounting and exact transfer, not an invented isolated per-order ERC-20 balance. Captured/refundable CPP accounting is not retained refund liquidity.

## Pending requests, replacements and duplicate prevention

Before opening the wallet, persist an intent scoped to **account + Base Sepolia + operator**, with exact context and later its transaction hash. Replacement hashes are retained alongside the original while unresolved. Existing account/network-scoped draft autosaving is preserved.

- In-flight guards and the durable intent block duplicate submissions. Financial controls are disabled while the wallet has an unresolved request. Completed orders also fail current-state action checks before simulation or wallet submission.
- Refresh/timeouts do not clear an uncertain submission. **Recheck saved transaction — no signature** only waits/reads and verifies; it never resends. A user may paste a complete actual transaction hash if the wallet did not return one or reported another hash.
- Genuine declined requests clear their unsubmitted lock. Canonically reverted transactions and proven zero-value self-cancellations release the lock without reporting success. Other successful but unrelated/ambiguous receipts remain unresolved.
- Repricing/replacements update the saved hash; every replacement must independently prove the requested effect. A cancellation callback with contradictory action effects is not treated as success.
- Order-page callbacks are guarded against an intervening account/network switch. Creation and saved-transaction UI are scoped/remounted per session. Verification uses the original captured actor; it never substitutes the newly selected wallet.
- If creation succeeded but the UI/read failed, reconciliation returns the created ID; identical remembered creation terms reopen that verified order. A fresh test uses new terms/deadlines, not the completed order.

Limitations: local browser storage must be available. Clearing it, using another browser/device, or submitting independently outside Dealza is beyond the local duplicate guard. If refresh occurs before a hash is returned, inspect wallet history and supply the hash; the app deliberately does not auto-expire an ambiguous request. Standalone upgrades do not prove the requested action and can require manual wallet/history review. Historical RPC availability is required. A later operation in the same block can advance end-of-block state; strict verification may then remain unresolved rather than infer intermediate state or silently resend. The normal UI waits for confirmation between steps.

## Actual browser and Base Sepolia evidence

| Check                                                                            | Status                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All six original mined receipts replayed through actual gateway against live RPC | **PASS** — create, allowance, preapproval, fund, delivery and buyer release. Canonical checks, pinned runtimes/bindings and historical post-state were queried live.                        |
| Duplicate cancellation replay                                                    | **PASS** — seventh authentic receipt; seller-authorized unfunded Voided branch.                                                                                                             |
| Production UI saved-release recheck                                              | **PASS** — read-only button verified the completed release, cleared its saved intent and linked the exact `0x63f302e19c08ffae721c7b9705e322eb331132b5216dd05256a6a4789f472c53` transaction. |
| Completed original and duplicate views                                           | **PASS** — original Released/UI Paid to seller; duplicate Voided/UI Cancelled. No payment submission action is offered; duplicate state survives refresh.                                   |
| Buyer → seller view switching                                                    | **PASS with test identity adapter and real RPC reads** — role changes correctly; original remains paid. Adapter supports only account/chain reads, no signing or sends.                     |
| Mobile basics                                                                    | **PASS for viewport emulation** — production receipt panel/order view fits 320/390/1440px. Physical wallet/browser accessibility remains untested.                                          |
| Fresh UI order draft/review                                                      | **PASS, local draft only** — correct seller/buyer/reviewer, exactly 1 test USDC, fresh deadlines; creation button was never clicked.                                                        |
| Genuine MetaMask extension / signed fresh UI checkout                            | **NOT TESTED** — no injected wallet or MetaMask extension exists in the available automation browser. No claim is made about the user's local installation.                                 |
| Reviewer decisions, funded returns, expiry reclaim/sync                          | **PASS simulated ABI/contract/fork tests; NOT TESTED as live signed UI branches**.                                                                                                          |

[Seven live receipt replays](verification/checkpoint-6/seven-live-receipt-replay.json), [production UI](verification/checkpoint-6/production-ui.json), [browser capability check](verification/checkpoint-6/browser-capabilities.json), [fresh draft/review](verification/checkpoint-6/fresh-draft-ui.json).

The replay uses recorded expected pre-operation contexts and a read-only identity adapter. Unused fixture gas/time fields are synthetic, not newly measured balances/timestamps. Post-state, receipt, transaction, block and runtime checks are real network reads. No RPC responses were fabricated. This is **receipt reconciliation of existing transactions**, not a new payment or genuine MetaMask signing session.

## Tests and checks

- **222 frontend tests across 12 files: PASS**. Prior 144 tests remain, including history pagination, wallet/network handling and drafts. New coverage includes authentic route regressions, direct EOA fixtures, hostile event fields/contracts, exact funding terms, refunds/reviewer decisions/reclaim/sync, canonical identity, replacements/repricing/cancellation, revert/timeout handling, duplicate prevention, refresh/reconciliation and wallet switching.
- **46 contract tests, 36 fork tests, 13 Python script tests: PASS**. No Solidity changes. Fork mutations remain ephemeral.
- **ABI/source verification and production build: PASS**. Online pinned protocol source/executable checks and Circle test-USDC checks passed. The existing Vite `ox` worker externalization warning remains; checked browser paths worked.
- Browser replay scripts and the read-only fresh-proposal script pass JavaScript syntax checks. Test fixtures remain outside production entry points/build output.

Evidence/logs: [checkpoint-6 verification directory](verification/checkpoint-6/). A final credential/working-tree scan is recorded there. Earlier uncommitted source/preparation files and README/report-13 edits are preserved outside the focused checkpoint commits; no push occurred.

## Next release gate and reproduction

**Exact next priority: a separately authorized fresh checkout through genuine MetaMask and the real UI.** Use the [fresh-order gate packet](21-FRESH-UI-CHECKOUT-GATES.md). Authorize one step at a time, verify its receipt, then proceed. Do not replay the completed order or approve all funding steps as a batch. After that acceptance passes, explicitly authorize publication of the existing static frontend and verify public routes/receipt links before the Vibeathon submission.

```sh
npm test
npm run build
npm run dev --workspace web -- --port 5174
npm run preview --workspace web
# Read-only; replaces the local proposed terms with a new snapshot:
node web/scripts/prepare-ui-checkout.mjs
```

For an isolated verification browser, run `web/scripts/replay-receipts.browser.js` with a Playwright page on the dev server and inspect `window.__dealzaReplay`. It refuses to overwrite an existing unresolved intent. Public RPCs and fixture files are required; no private key or Foundry is needed for this read-only replay or ordinary UI use. Contract verification commands remain in README.
