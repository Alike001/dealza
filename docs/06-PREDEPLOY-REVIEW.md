# Checkpoint 1 predeployment review

## Recommendation and scope

**GO for controlled Base Sepolia testnet deployment and faucet-only integration testing after separate execution authorization.** No critical or high-severity release vulnerability was identified in the reviewed implementation; medium trust/protocol risks below remain explicit. This is not readiness for real funds or a claim of guaranteed protection. This review covers source behavior, local security tests, and read-only Base Sepolia compatibility. It is a fresh adversarial review by the coding assistant, not a separate firm's independent audit. No deployment, wallet connection, signing, live transaction, token spending, push, or frontend work was performed here.

Reviewed: DealzaOperator, all project tests/mocks, the complete escrow ABI, pinned CPP AuthCaptureEscrow/TokenStore/collectors, the reached Solady clone/guard operations, imported OpenZeppelin interfaces/transfer utilities, Foundry configuration, dependency lock, verifier, README, and checkpoint documentation. The prior report's results were not treated as evidence for this run; fresh logs are in `docs/verification/review/`.

## Findings, severity, and disposition

No critical or high-severity unauthorized fund-release vulnerability was identified in the reviewed paths. The following are retained limitations and integration risks, not undisclosed administrative remedies.

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| M-01 | Medium | **An unresolved dispute does not freeze funds beyond CPP authorization expiry.** Buyer can reclaim at the exact deadline, even after actual delivery or while review is pending. Reviewer cannot release or void through `resolve` at/after that deadline. | Inherited protocol limit; accepted only with explicit disclosure and sufficient review time. New regression checks reclaim, stale storage, blocked late ruling, and sync. NatSpec/README now call it out directly. No safe operator-only fix can suspend payer reclaim; no freeze or deadline-extension claim is permitted. |
| M-02 | Medium | Seller chooses the reviewer at order creation; buyer accepts by funding. Reviewer has no onchain obligation or acceptance step. Distinct addresses do not prove neutrality. A compromised reviewer can release disputed funds incorrectly; lost/unavailable reviewer cannot be replaced. | Retained MVP trust model. Buyer must verify reviewer/terms before approval. Both verdicts are full amount only. If review is unavailable, seller may voluntarily void; otherwise buyer can recover at expiry. No admin replacement or override added. |
| M-03 | Medium | Circle can pause, blacklist, or upgrade USDC. Transfers, including reclaim, can fail. | External issuer risk. New injected-transfer-failure test proves capture/void/reclaim state rolls back, not that a frozen token becomes recoverable. Keep sufficient gas and recheck token state before testing. No alternate asset/rescue route added. |
| L-01 | Low | `getOrder(id).status` remains stored history after a direct CPP reclaim; it may still say Disputed while funds have already returned. | Derived `status(id)` correctly reports Reclaimed and `syncRecovery` reconciles storage. Added NatSpec and explicit regression. Integrators must read derived status and CPP state/logs, never stored status alone. |
| L-02 | Low | Collector explorer status remains partially verified. A comment comparison alone was weaker than independent compiled-runtime verification. | Executable-compatibility gap resolved by local compilation comparison for escrow, collector, and TokenStore implementation, patching only compiler-declared immutable references and excluding only Solidity metadata. Explorer metadata status remains partial; no claim it was upgraded to full verification. |
| L-03 | Low | Pre-approval is persistent and an unfunded cancellation does not revoke the collector's ERC20 allowance. Exact allowance is recommended, not enforced as wallet policy. | No order bypass: collector only accepts escrow calls; operator requires recorded buyer and Pending state; an allowance alone cannot collect. Revoke unused allowance after abandonment/cancellation. Revoked-allowance atomicity is tested. Other pre-approved CPP payments share the collector allowance. |
| L-04 | Low | Evidence commitments do not establish delivery or preserve evidence availability. Delivery notices are optional and buyer release can occur without one. | Intentional. Seller notice, first dispute evidence, and reviewer decision are event hashes; description is an immutable hash. Keep content available offchain and disclose public metadata. No automatic delivery verification or guaranteed protection claim. |

No fund-moving behavior change was needed. Source changes are NatSpec clarifications only. Focused additions are negative tests, verification evidence, and documentation. A new test initially used the reserved `testFail*` prefix; it was renamed before final verification. The initial failing harness log is preserved rather than represented as a passing run.

## Execution-path review

1. Seller `createOrder` fixes a named buyer, seller=`msg.sender`, amount, reviewer, description hash, funding cutoff, and capture expiry. Roles are distinct, nonzero where required; amount is `uint120` raw USDC units; funding cutoff is future and no later than expiry; expiry is at most 30 days away.
2. Order ID includes chain ID, operator address, seller, and seller nonce. Its value becomes CPP salt. CPP payment is constructed with `operator = address(this)`, fixed Circle token, exact buyer/seller/amount/deadlines, zero fee bounds/recipient, and refund expiry equal to capture expiry. Immutable reviewer/description storage is associated with this salt; CPP itself has no reviewer/description fields.
3. Buyer separately approves the **existing collector**, pre-approves the exact domain-bound CPP hash, then calls `fund` personally. Hash validation covers all twelve fields. No caller-supplied collector, amount, or collector data can reach CPP. No signatures, permits, relayers, or platform keys substitute for that caller.
4. Dealza calls CPP `authorize`; CPP sees Dealza as `msg.sender`, matching `PaymentInfo.operator`. Collector accepts only the escrow caller and checks exact pre-approval. USDC moves from buyer directly to the operator-specific CPP TokenStore. CPP measures the balance increment, and Dealza verifies the resulting full authorization. Failure reverts both layers.
5. Seller `noteDelivery` emits a claim hash and never captures. A delivery notice is not required for voluntary buyer approval. Buyer `release` only works while Reserved and before capture expiry. A dispute blocks that path; only the fixed reviewer can resolve a Disputed order before expiry.
6. Capture uses v1.1.0 `capture(payment, fullAmount, 0, address(0))`: the third argument is **absolute feeAmount**, not basis points. Both fee bounds are zero. CPP transfers only to the fixed receiver. Terminal Dealza state plus CPP single-collection state prevents duplicate payout or funding.
7. On capture, CPP `refundableAmount` becomes an accounting upper bound, **not retained refund liquidity or a Dealza refund promise**. This operator exposes no `refund` or `charge`. Confirm payment events, balances, derived status, and CPP state.

| External surface | Access and security conclusion |
| --- | --- |
| `createOrder` | Seller authors terms; no funds transferred, no editing existing orders. Buyer must accept named terms before funding. |
| `fund` | Recorded buyer only, Pending only, exact payment hash, before funding cutoff. No amount/token/receiver substitution. |
| `noteDelivery` | Seller only, active reserved/disputed order, nonzero evidence; informational only. |
| `release` | Recorded buyer only, Reserved only, strictly before expiry. Active dispute cannot be overridden. |
| `dispute` | Buyer or seller only, Reserved only, before expiry; nonzero evidence. Does not extend time. |
| `resolve` | Fixed reviewer only, Disputed only, before expiry, nonzero decision hash. Full seller release or buyer return; no recipient/fee changes. |
| `cancel` | Buyer/seller can cancel Pending. Only seller can surrender a funded/disputed claim via CPP void, even after expiry. Buyer cannot cancel funded orders early unilaterally. |
| `syncRecovery` | Anyone, only after observable direct expiry reclaim. No token movement or release permission. |
| `getOrder`, `status`, constants, nonce getters | Read-only. Stored versus derived status distinction must be respected. |
| Unsupported selectors/fallback | No fallback, receive, arbitrary execution, multicall, upgrade, ownership, generic capture/charge/refund forwarding, or reviewer setter. |

All mutating entry points use the transient guard. Effects precede fund-moving calls and revert on failure. View/static reads and guarded post-call events explain retained Forge timestamp/event lint warnings. Reentrant collection/capture/void tests exercise actual guard errors. Views can observe intermediate state from within a token callback; they do not grant mutation rights and are not settlement receipts. Use confirmed transaction state for indexing.

CPP hashes include chain ID and escrow address plus the complete payment, including operator and salt. Tests exercise replay rejection across orders/operators/chains. Two buyers sharing one TokenStore cannot spend each other's orders; direct collector and TokenStore calls are rejected. Unsolicited token donations do not authorize orders and have no rescue path.

## Dispute behavior and expiry

Reviewer is chosen by seller **before funding**; buyer accepts by funding that immutable order. Reviewer cannot be replaced. Buyer approval cannot override Disputed. Seller cannot capture around a dispute, but can return the buyer's money by voluntarily voiding. Either party can open a dispute; there is no guaranteed resolution SLA and no automatic outcome before expiry.

At `authorizationExpiry - 1`, a valid reviewer ruling may still settle. At `authorizationExpiry`, capture stops and payer reclaim becomes available regardless of unresolved dispute. A late ruling fails. CPP never consults Dealza's dispute state. Reclaim is buyer → **CPP directly**, not buyer → operator → CPP. Seller void and payer reclaim may race; only one returns the reserve. If USDC blocks transfers, the return itself can revert and reserves remain pending in CPP.

No physical delivery claim can be independently proven by this contract. Onchain hashes prove the submitted commitments/addresses/timing, not the truth of their contents.

## Independent protocol and token verification

| Item | Address / identity |
| --- | --- |
| Network | Base Sepolia, chain `84532` |
| CPP tag/commit | `v1.1.0` / `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9` |
| Existing escrow | `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c` |
| Existing pre-approval collector | `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea` |
| Escrow TokenStore implementation | `0xe4be44B1505d29ae640748b4cce530ece6DcD450` |
| Circle test USDC proxy | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Observed USDC implementation | `0xd74cc5d436923b8ba2c179b4bCA2841D8A52C5B5` (upgradeable; recheck before deployment/testing) |
| Dealza operator | **Not deployed; no address claimed** |

The official [CPP v1.1.0 sources](https://github.com/base/commerce-payments/tree/v1.1.0) and [Circle address list](https://developers.circle.com/stablecoins/usdc-contract-addresses) were fetched independently. All four vendored CPP sources match the pinned upstream commit; dependency hashes and complete escrow ABI match. Read-only RPC confirms chain/code, collector binding, USDC symbol and **6 decimals**. One USDC is `1_000_000` units; there is no decimal rescaling in the contract.

Local solc 0.8.28 compilation with Cancun, via IR, optimizer 100000 reproduces executable runtime exactly for escrow (10,925 bytes), collector (2,350), and TokenStore implementation (616), after substituting only compiler-declared constructor immutables and removing the trailing CBOR metadata. All executable bytes are compared. Raw runtime hashes still match the earlier canonical escrow/collector records. This independently resolves executable compatibility without depending on the collector's explorer label; metadata remains a documented difference. Compiler rules: [Solidity immutables](https://docs.soliditylang.org/en/v0.8.28/contracts.html#constant-and-immutable-state-variables), [metadata](https://docs.soliditylang.org/en/v0.8.28/metadata.html).

Fresh read-only evidence: [runtime.json](verification/review/runtime.json), [protocol log](verification/review/protocol.txt). Token proxy/implementation code hashes are a snapshot, not a promise that Circle cannot upgrade later. This review does not audit all USDC implementation logic.

## Executed verification

Environment: Foundry 1.8.5, Solidity 0.8.28, Python 3.14.4. Commands below run from `contracts/`; redirection saved raw output under `../docs/verification/review/`. Every final command exited successfully.

| Exact command | Actual final result / evidence |
| --- | --- |
| `forge build` | PASS. Compiler successful; timestamp/event lint warnings retained. [build.txt](verification/review/build.txt) |
| `forge test` | **46 passed, 0 failed, 0 skipped**: original 34 unit/fuzz tests, 11 new review tests, and one stateful suite checking two invariants. [local-tests.txt](verification/review/local-tests.txt) |
| `FOUNDRY_PROFILE=fork forge test` | **36 passed, 0 failed, 0 skipped**: original 27 plus 9 new deployed-protocol scenarios at Base Sepolia block 53589971. [fork-tests.txt](verification/review/fork-tests.txt) |
| `forge fmt --check src test` | PASS |
| `python3 scripts/verify_protocol.py` | PASS: all 77 pinned file hashes and complete compiled escrow ABI |
| `python3 scripts/verify_protocol.py --online --runtime-report ../docs/verification/review/runtime.json` | PASS: upstream source, chain/addresses, explorer/RPC code, independent compilation comparison, token precision/implementation snapshot. [protocol.txt](verification/review/protocol.txt), [runtime.json](verification/review/runtime.json) |

Both complete profiles ran their two fuzz tests at **256 cases each**. The stateful suite checked two safety invariants over **128 sequences × 32 calls = 4,096 calls**. The handler deliberately catches attempted invalid transitions; these invariants establish sampled safety/conservation, not liveness or guaranteed reviewer resolution. Unit tests separately require successful funding/release/return paths. Fork USDC balances are seeded only in the local fork; no network funds are acquired or moved.

The first expanded `forge test` run reported **35 passed, 1 failed, 0 skipped** because Foundry rejects the new name `testFailedTokenTransfers…` as a removed `testFail*` convention. It was renamed to `testTokenTransferFailureRollsBackCaptureVoidAndReclaim`. This was a test discovery error, not a failed protocol assertion. The full corrected suite passed; [initial log](verification/review/local-tests-initial.txt) is retained. No final test was skipped or failed. The default/fork profiles select their respective suites deliberately; neither substitutes a skipped result for compatibility.

Prior checkpoint results remain historical in `05-CHECKPOINT-1-REPORT.md`. The source review's only operator edits are NatSpec on `getOrder` and `dispute`; no ABI or executable behavior was changed. New review files are `contracts/test/ReviewSecurity.t.sol` and `contracts/test/fork/ReviewBaseSepolia.t.sol`. `contracts/scripts/verify_protocol.py` now independently compares compiled runtime and records token identity/precision; README and protocol/test docs link this review and strengthen expiry disclosure. All original pinned vendor files remain unchanged.

## Proposed minimal Base Sepolia deployment, deferred

No command in this section has been executed. A GO recommendation is readiness advice, not permission to deploy during this review.

1. Use the local reviewed checkpoint commit. Re-run `forge build`, local/fork tests, and online verifier; recheck chain `84532`, canonical protocol runtime hashes, token implementation, issuer transfer availability, and realistic deadlines. Stop on any mismatch.
2. Prepare the deployer wallet separately after explicit deployment authorization. Estimate current gas and review the unsigned creation transaction. Use the checked-in Foundry settings: solc 0.8.28, Cancun, via IR, optimizer 100000; zero constructor arguments.
3. Deploy **only `src/DealzaOperator.sol:DealzaOperator`** directly, with no proxy or admin. Reuse existing CPP escrow/collector. Do not deploy duplicate infrastructure.
4. Confirm the real deployment receipt and chain, verify source with the exact compiler settings, and compare deployed operator runtime with the reviewed artifact. Read `ESCROW`, `COLLECTOR`, `USDC`, `CHAIN_ID`, and `MAX_DURATION` from the new address. The deployer has no ongoing authority.
5. Record the actual address/receipt/explorer URL; currently none exists. Then execute the following test matrix with faucet assets only. Keep actual keys and secrets outside the repository. Do not write success receipts until confirmed.

## Wallet roles and suggested faucet budgets

| Role | Purpose | Suggested balance before later live testing |
| --- | --- | --- |
| Deployer | One operator deployment only; no owner permissions | 0.02 test ETH; 0 USDC |
| Seller | Creates orders, notes delivery, disputes/voluntary void | 0.01 test ETH; 0 initial USDC |
| Buyer | Approves collector, pre-approves/funds, releases/disputes/reclaims | 0.01 test ETH and 10 test USDC |
| Reviewer | Agreed independent reviewer; release/void dispute decisions | 0.01 test ETH; 0 USDC |
| Outsider address | Negative `eth_call` simulations | No wallet or balance required for simulation |

These are suggested faucet budgets, not measured gas requirements. Estimate fees before signing; use separate addresses for all participant roles. [Circle test USDC faucet](https://faucet.circle.com/), [test ETH faucet](https://www.coinbase.com/developer-platform/products/faucet). No faucet request or wallet preparation was performed in this review.

## Transaction-by-transaction live test plan, deferred

For **each funded case A–E**, execute the following fresh four transactions with a unique order ID. Price is `1_000_000` units (1 test USDC); fees are zero.

| Tx | Caller → target | Action and required confirmation |
| --- | --- | --- |
| 1 | Seller → new operator | `createOrder(buyer, amount, fundingCutoff, captureExpiry, reviewer, descriptionHash)`. Confirm `OrderCreated`; read full terms/hash and reviewer. |
| 2 | Buyer → USDC | `approve(existingCollector, 1_000_000)`. Confirm exact allowance. No funds reserved yet. |
| 3 | Buyer → existing collector | `preApprove(order.payment)`. Confirm `PaymentPreApproved` for exact CPP hash. Still no release authorization. |
| 4 | Buyer → new operator | `fund(id, order.payment)`. Confirm CPP `PaymentAuthorized`, full capturable amount, buyer debit, TokenStore credit, zero operator balance, and Reserved status. |

For ordinary cases use, for example, a two-hour funding cutoff and a one-day capture expiry, based on current chain time and agreed reviewer availability. These are examples, not guarantees of enough shipping/review time. For the expiry case use a deliberately shorter but usable interval such as 30-minute funding cutoff/60-minute capture expiry. Do not use local `warp` or assume server time advances a public chain.

| Case and next tx | Caller → target | Expected result / checks |
| --- | --- | --- |
| A5 | Seller → operator `noteDelivery(id, evidenceHash)` | Evidence event only; still Reserved, seller unpaid. |
| A simulation | Seller/outsider → operator `release`, seller → CPP `capture` | Reverts by `eth_call`; do not spend gas on prohibited actions. |
| A6 | Buyer → operator `release(id)` | `PaymentCaptured` exact full amount and zero fee; seller gains 1 USDC; held balance zero; Released. Simulate second release/fund and require rejection. |
| B5 | Seller → operator `cancel(id)` | `PaymentVoided`, buyer gains original reserve, seller gets zero; Voided. Simulate release afterward and require rejection. |
| C5 | Buyer → operator `dispute(id, evidenceHash)` | Disputed. Simulate buyer release, buyer cancellation, and outsider resolution: all fail. |
| C6 | Agreed reviewer → operator `resolve(id, true, decisionHash)` | Before expiry only: capture to fixed seller; `DisputeResolved`; no duplicate verdict or release. |
| D5 | Seller → operator `dispute(id, evidenceHash)` | Disputed; reviewer/terms unchanged. |
| D6 | Agreed reviewer → operator `resolve(id, false, decisionHash)` | Before expiry only: full CPP void to buyer; seller gets zero. |
| E5 | Either party → operator `dispute(id, evidenceHash)` | Leave unresolved to model unavailable reviewer. Simulate buyer reclaim before expiry and require rejection. |
| E wait/simulation | Read chain time until `now >= authorizationExpiry` | No automatic return. Simulate both reviewer verdicts: fail. CPP reclaim remains available despite unresolved dispute. |
| E6 | Buyer → **existing CPP escrow** `reclaim(order.payment)` | Confirm `PaymentReclaimed`, buyer balance restored, capturable zero, derived Reclaimed. Stored order may still say Disputed. |
| E7 (optional) | Any wallet → operator `syncRecovery(id)` | Stored Reclaimed, no transfer. Simulate duplicate reclaim/release/late ruling and require rejection. |

Additional unfunded case F: seller creates fresh terms; buyer may grant allowance/pre-approval; buyer or seller calls operator `cancel(id)` before `fund`. No CPP authorization/void payment event or token transfer should occur. Simulate funding and require rejection. Buyer revokes unused collector allowance with `USDC.approve(collector, 0)`; persistent pre-approval alone cannot revive the cancelled order.

For every case record genuine transaction receipts, event payment hashes, `getHash`, `paymentState`, derived `status`, and buyer/seller/TokenStore balances. Do not interpret `refundableAmount` as reserve liquidity. Failed simulations have no transaction hash. Future judge receipts must distinguish voluntary void, direct expiry reclaim, and capture; none implies verified delivery.

## Git preservation

Initial `git status --short` showed `.gitignore`, README, contracts, docs, and prompts all untracked; the repository had no commits. The focused local initial checkpoint commit preserves the existing implementation/handoff plus this review and vendored dependencies. Generated build/cache artifacts and secrets are excluded. The commit identifier and final uncommitted status are reported in the handoff; `git log -1 --oneline` retrieves the identifier. No push is permitted or performed.
