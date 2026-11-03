# Real UI Gate 1 verified — Gate 2 exact buyer approval prepared

**Gate 1 PASS. Gate 2 READY, NOT EXECUTED.** The seller reports creating this order through Dealza and MetaMask, without Foundry. Independent official Base RPC and PublicNode reads establish the actual routed transaction, exact event and immutable terms. The real frontend accepts this receipt in a read-only replay. No signing, broadcasting, approval, token spending, delegation change, deployment, Solidity change or GitHub push was performed by this audit.

## Actual creation evidence

- Transaction: [0x057a937ac93132743a53276eefcd7023d3ae72210410fbcee6dc6fdf4fb84567](https://sepolia.basescan.org/tx/0x057a937ac93132743a53276eefcd7023d3ae72210410fbcee6dc6fdf4fb84567).
- Mined: **2026-11-03T12:39:07.000Z**, block **53938394**, canonical hash `0xd0a33b49b07dceca179cd002705a5c591604603e8150b90364fde257e8fad9cb`.
- Latest common checked snapshot: **53943612**, **2026-11-03T12:56:31.000Z**, `0x89da5bf10fbc4d7e250008566423e0ee244c435d7ef16d15f8d02e834e5a3273`. These are snapshots; recheck before any confirmation.
- Both providers agree on the successful receipt, transaction, block inclusion, exact indexed `OrderCreated` and before/after/current state. Discovery binary-searched `getOrder` existence from the verified absent-order preflight, then queried exactly **one inclusive block**; there was no genesis scan or oversized log request.
- Pinned operator, CPP and collector runtime hashes match. Only valid pinned-emitter logs establish the payment action.

| Immutable field               | Verified value                                                       |
| ----------------------------- | -------------------------------------------------------------------- |
| Network                       | Base Sepolia, **84532**                                              |
| Operator                      | `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`                         |
| Order ID                      | `0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd` |
| Seller / receiver             | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`                         |
| Buyer / payer                 | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`                         |
| Fixed reviewer                | `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548`                         |
| Token                         | Circle test USDC, `0x036CbD53842c5426634e7929541eC2318f3dCF7e`       |
| Maximum amount                | **1 test USDC**, **1000000 raw**                                     |
| Terms fingerprint             | `0x43f2dcc0b9930bc16b3b0d560a08dd7c00dae3949d2355e22b4387541d73b4c8` |
| CPP payment hash              | `0x146b39003d621a9f7dbfc083bb8ce77c6ddb00022a5a384681114cc6cefcf1e6` |
| Reserve / preapproval cutoff  | **Nov 4, 2026, 11:00 UTC / 12:00 WAT**, Unix **1793790000**          |
| Authorization / refund expiry | **Nov 6, 2026, 11:00 UTC / 12:00 WAT**, Unix **1793962800**          |
| Fee                           | **0**, min/max fee bps 0, fee receiver zero address                  |
| Salt                          | Order ID interpreted as uint256, exact value in the raw evidence     |

Exact description, unchanged from the saved draft:

```text
Dealza Checkpoint 6: fresh UI-only 1 test-USDC checkout; controlled test, no physical delivery.
```

The transaction is a **type-2 EIP-1559 relayed execution through the delegation manager**, compatible with the existing EIP-7702 wallet route. Its outer sender is `0xb01caea8c6c47bbf4f4b4c5080ca642043359c2e`, not the seller, and its destination is `0xdb9b1e94b5b69df7e401ddbede43491141047db3`. It is not a type-4 authorization transaction. Decoded `redeemDelegations` contains exactly one zero-value call to the pinned operator with the exact proposed `createOrder` calldata. The verified manager emits `RedeemedDelegation` naming the seller as root delegator; the operator emits the exact `OrderCreated`. The receipt also retains an auxiliary wallet log, which is not treated as creation evidence. Outer and inner native value are zero.

The order was absent immediately before its creation block and Pending (1) after it and at the snapshot. CPP `paymentState` is **(false, 0, 0)**, collector `isPreApproved` is **false**. No USDC approval/transfer or CPP fund event occurs in this creation receipt. Buyer **20**, seller **1**, operator **0**, TokenStore **0** USDC are unchanged across the creation block. There is no funded balance for this order.

Both providers enumerate all **three** seller order IDs from seller nonces 0–2. Exactly one has this fingerprint, the new ID. The earlier original remains Released (4); the earlier duplicate remains Voided (5). This proves no matching duplicate at the checked block, not the absence of an unmined wallet/relayer request. Do not recreate the order.

[Raw receipts, decoded events, complete PaymentInfo, historical state, runtimes and simulations](verification/checkpoint-7-gate-1/evidence.json). Reproduce with:

```sh
node web/scripts/verify-ui-gate1-and-prepare-gate2.mjs
```

This read-only snapshot verifier deliberately fails after the order changes, the reserve deadline approaches or state disagrees; it does not renew deadlines or submit anything.

## Frontend acceptance and limits

**Directly observed:** the local development server on port 5174 loads this actual order without any injected wallet, displays Awaiting payment, the exact amount/parties/fingerprint-matched description, zero custody, correct deadlines and payment hash. Browser refresh preserves the correct order and terms. The generated share link includes the complete order ID and matching `terms` text. The URL is local; it is not yet a publicly hosted checkout.

[Open the fresh checkout](http://127.0.0.1:5174/#/order/0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd?terms=Dealza%20Checkpoint%206%3A%20fresh%20UI-only%201%20test-USDC%20checkout%3B%20controlled%20test%2C%20no%20physical%20delivery.). If using another local port, retain the same `/#/order/<full ID>?terms=...` path and query. A bare ID route still reads the immutable onchain terms, but the human-readable agreement text requires the matching shared text.

The creation was older than the default recent history window. Two **Load earlier activity** clicks revealed **Order terms recorded**, block 53938394, and the exact creation transaction link. The initial page accurately said recent activity only, rather than implying that the order had no history. Refresh starts a fresh recent window. This is correct bounded pagination, but an extra discovery step for a new user.

The actual frontend `resumePending` verifier accepted the genuine creation hash, returned the exact new order ID, emitted **confirmed**, and cleared the pending intent. This replay used a read-only seller identity adapter in a separate isolated browser context. The seller's original “Your order link is ready” and “Receipt confirmed” screens are **user-reported**, not independently observed in their private MetaMask session.

Buyer rendering and review were checked with a **read-only identity adapter, not real MetaMask**. The page shows buyer balance 20 test USDC and the sequence **1 Exact allowance → 2 Terms authorization → 3 Reserve**. The acknowledgment checkbox initially blocks actions; checking it allows the first approval review. The browser stopped before **Continue to wallet**. Separately, the production gateway's next approval request was captured by an in-memory reject-only provider: exact token target, buyer, spender and amount match below, absent native value means zero. No request was forwarded to a wallet or broadcast endpoint; real chain reads afterward still show allowance 0, balance 20, held 0 and no preapproval. Its pending lock was cleared on rejection.

Wallet-free and buyer review layouts have no document overflow at **320 / 390 / 1440px**. Real MetaMask account/network switching and physical mobile wallet confirmation/return remain **NOT TESTED** here: the automation browser has no real wallet extension. Drafts and pending state in the user's browser were not touched. The isolated inspection tab was closed afterward.

Evidence: [public page/refresh](verification/checkpoint-7-gate-1/browser-public.json), [history link](verification/checkpoint-7-gate-1/browser-history.json), [real creation receipt replay](verification/checkpoint-7-gate-1/frontend-creation-replay.json), [buyer review](verification/checkpoint-7-gate-1/browser-buyer-review.json), [approval packet capture](verification/checkpoint-7-gate-1/frontend-approval-capture.json).

## Gate 2 — next single manual buyer action

At the common snapshot the buyer has **20 test USDC** and **0.0001 ETH** (`100000000000000` wei). Allowance to the collector is **0**. The new payment has no preapproval, reservation or capture. The reservation deadline is **79409 seconds** in the future at that snapshot. Both RPC providers simulate the exact approval successfully (`true`), without state overrides or persistent changes. Direct gas estimate is **56240**; the execution-only estimate is **337440000000 wei** at 6000000 wei gas price. This excludes current L1 data/relayer fees and is not a total MetaMask quote. Review the wallet's actual gas estimate against its current payer balance.

1. Open the fresh checkout link in the normal MetaMask-enabled browser. Connect the **buyer ending `df25`**, on **Base Sepolia 84532**. Confirm the page says **You’re the buyer**, amount **1 USDC**, and the exact seller/reviewer/deadlines above. Dates appear in local browser time; WAT is UTC+1.
2. Check the acknowledgment only after reviewing the terms. Select **1. Allow exactly this USDC amount**, then review the Dealza confirmation. If separately proceeding manually, select **Continue to wallet**.
3. In MetaMask review only the following approval. Reject unexpected amounts, tokens, spenders, networks or additional actions. Do not confirm a new delegation/upgrade as a substitute for the requested approval.

| MetaMask field / effective call    | Required value                                    |
| ---------------------------------- | ------------------------------------------------- |
| Owner                              | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`      |
| Network                            | Base Sepolia **84532**                            |
| Token / effective call destination | `0x036CbD53842c5426634e7929541eC2318f3dCF7e`      |
| Method                             | `approve(address,uint256)`, selector `0x095ea7b3` |
| Spender                            | `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea`      |
| Spending cap                       | **1 USDC**, **1000000 raw**, never unlimited      |
| Native ETH value                   | **0**, wallet gas separate                        |

Exact approval calldata:

```text
0x095ea7b3000000000000000000000000f1f9c408c787b2bc6caeb91e5bbec434a5c8d2ea00000000000000000000000000000000000000000000000000000000000f4240
```

If MetaMask routes it, the outer recipient may differ; only the exact effective token approval and its verified effects establish success. Do not manually replace the recipient with the operator or a relayer.

**Stop after this single approval.** Record its real transaction hash. Before Gate 3, independently verify canonical success on the correct chain, genuine token `Approval` with exact buyer/collector/1000000, resulting allowance 1000000, no USDC transfers, unchanged balances, Pending/unfunded order and no preapproval. Approval is allowance only and does not identify or fund this order. An upgrade-only receipt is insufficient. A timeout or missing hash requires read-only pending reconciliation, never another blind approval. Do not select **2. Authorize these payment terms** or reserve funds under this packet. No signing authorization is implied by this preparation.

## Checks and public-release blockers

- **PASS:** two-RPC live verifier, exact real creation replay, ephemeral exact approval simulation on both providers, real frontend approve packet capture and browser checks above.
- **PASS:** full frontend suite **222 tests / 12 files**, `npm test`; production `npm run build`, including ABI pin check and TypeScript. Build retains the existing `ox` / `node:worker_threads` browser-externalization warning. [Test log](verification/checkpoint-7-gate-1/frontend-tests.txt), [build log](verification/checkpoint-7-gate-1/production-build.txt).
- **PASS:** evidence cross-checks (real receipt ID/hash, share URL, refreshed state, history link, exact approval calldata, unchanged allowance/balance/custody), focused secret-pattern scan of new artifacts, tracked sensitive-filename scan and `git diff --check`. No private keys or credentials were found by these checks. Earlier unrelated changes remain outside this checkpoint.
- No application or Solidity logic changed. Contract/fork suites were not rerun for this evidence-only change; their earlier passes remain documented in Checkpoint 6. The new verifier passed `node --check`.
- **Remaining checkout UX issues:** first approval review uses generic text rather than showing its exact spender/cap inline; numbered terms authorization remains available alongside step 1, and the generic cancel label mentions a reserved return even for an unfunded order. These did not block this read-only preparation. Prefer clearer action-specific review/copy before broad public testing.
- **P0:** execute and verify Gate 2 manually, then prepare and separately authorize Gates 3–6 through the actual frontend. The fresh full signed checkout is not complete.
- **P0:** genuine MetaMask switching/rejection/refresh behavior during buyer confirmations; physical mobile wallet testing. Simulated identities are not substitutes.
- **P1:** live reviewer/funded-return/expiry-recovery branches require distinct orders and authorization; existing automated/fork passes do not prove these live UI paths.
- **P1:** public hosting, public-route/RPC/CORS/header checks, final repository/secret review, authorized push, demo and Vibeathon submission remain outstanding. Earlier unrelated working-tree work is preserved separately.

The exact next priority is **one manually reviewed buyer allowance of 1 test USDC to the collector, followed by independent receipt verification**. Dealza binds payment terms and prevents seller-only capture; it does not verify physical delivery, guarantee reviewer fairness/availability, insure losses or guarantee post-capture refunds. Disputes do not extend expiry.
