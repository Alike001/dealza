# Checkpoint 1 report

Historical implementation checkpoint. Fresh adversarial review, expanded test results, and deployment readiness are recorded separately in [06-PREDEPLOY-REVIEW.md](06-PREDEPLOY-REVIEW.md).

**Verdict: PASS for Checkpoint 1's local contract implementation, security tests, and deployed-protocol fork compatibility. Ready for review.** No claim of live-wallet end-to-end completion or independent security audit. Checkpoint 2 has not started.

## Implemented architecture

Base Sepolia-only, non-upgradeable `DealzaOperator`, using existing CPP v1.1.0 escrow and pre-approval collector. Immutable named-buyer orders bind seller, buyer, reviewer, amount, funding/capture deadlines, description hash, and complete CPP configuration/hash. Zero fees. No owner, admin override, generic forwarding, charge, or refund path.

Buyer funds using an exact-hash onchain CPP pre-approval, collector allowance, and direct buyer call. CPP holds USDC in its TokenStore. Full release requires an explicit buyer transaction while undisputed, or the agreed reviewer's ruling while disputed and before expiry. Seller delivery evidence cannot release payment. Seller cancellation uses CPP operator-only void; expiry recovery is a direct payer-only CPP reclaim. Derived status reflects direct recovery even without operator bookkeeping.

The exact ABI, upstream commit, full escrow source verification, runtime hashes, and collector's partial-verification status are recorded in [protocol research](01-PROTOCOL-FACTS.md) and [machine-readable evidence](verification/base-sepolia.json).

## Files created or changed

Modified original documents: `README.md`, `docs/01-PROTOCOL-FACTS.md`, `docs/02-RELEASE-POLICY.md`, `docs/03-MVP-ACCEPTANCE-AND-TESTS.md`, and `docs/04-UX-AND-DEPLOYMENT.md` (future-scope annotation). The existing `prompts/CODEX-FIRST-BUILD.md` was left intact.

New files:

- `.gitignore`, `contracts/foundry.toml`.
- `contracts/src/DealzaOperator.sol`.
- `contracts/test/DealzaOperator.t.sol`, `DealzaInvariant.t.sol`, `TestUSDC.sol`, and `fork/BaseSepolia.t.sol`.
- `contracts/abi/AuthCaptureEscrow.v1.1.0.json`.
- `contracts/dependencies.lock.json`, `contracts/scripts/verify_protocol.py`.
- `contracts/vendor/commerce-payments/` (unmodified minimal upstream compilation closure, original CPP/Solady/OpenZeppelin licenses) and `contracts/vendor/forge-std/` (pinned upstream snapshot and original MIT/Apache licenses). The lock file enumerates all vendored files/hashes.
- This report and `docs/verification/`: deployment evidence JSON plus raw build, local-test, fork-test, and protocol-verification logs.

Generated `contracts/out/` and `contracts/cache/` are ignored. No GitHub push or commit was made. Existing handoff files were already untracked when work began.

## Commands actually executed

Environment: Foundry **1.8.5**, solc **0.8.28**, Cancun, optimizer 100000, via IR. Commands below run from `contracts/`.

| Command | Result and saved evidence |
| --- | --- |
| `forge build` | PASS; compiler successful. [Build log](verification/forge-build.txt) |
| `forge test` | **35 passed, 0 failed, 0 skipped**. Includes 34 unit/fuzz tests plus one stateful suite checking two invariants. [Local log](verification/forge-test.txt) |
| `FOUNDRY_PROFILE=fork forge test` | **27 passed, 0 failed, 0 skipped** against existing Base Sepolia escrow/collector/Circle USDC at block 53589971. [Fork log](verification/forge-fork-test.txt) |
| `python3 scripts/verify_protocol.py` | PASS: 77 pinned file hashes and complete compiled escrow ABI |
| `python3 scripts/verify_protocol.py --online` | PASS: chain, explorer/RPC runtimes, full escrow verification, ABI, compilation sources, pinned upstream source, collector executable-source equivalence. [Verification log](verification/protocol-verification.txt) |
| `forge fmt --check --root contracts contracts/src contracts/test` (from repo root) | PASS |
| `git diff --check` | PASS; limited value because this initial repository's handoff and additions are untracked |

Both local and fork suites execute two fuzz tests at **256 cases each**. The stateful suite executes **128 sequences × 32 calls = 4,096 handler calls**, with two invariants checked together: asset conservation/permitted seller payouts, and agreement between CPP balances/state and order status. Expected reverts are caught by the handler; unexpected handler reverts fail the suite.

No final tests failed or skipped. The default profile deliberately excludes the fork file; the explicit fork profile executed all 27 scenarios successfully. Live network transactions were not run because this checkpoint forbids them. Local test token and fork storage seeding are explicitly test fixtures, not faucet transfers or simulated network receipts.

During setup, an initial build from the repository root lacked the contracts configuration, and an initial fork-profile filter selected no tests. Both were corrected before the recorded successful runs. The optional verifier initially received HTTP 403 with Python's HTTP client; it now uses read-only Cast RPC and curl requests and completed successfully.

## Security evidence and warning review

The tests verify prohibited seller/direct CPP capture, explicit buyer capture to the fixed seller, one-shot settlement/funding, all twelve payment fields against alteration, approval misuse, full funding/custody, deadline boundaries, authorized disputes and both verdicts, unauthorized reviewer rejection, cancellation, payer-only recovery, void/reclaim races, domain separation, reentrancy during collection/capture/void, invalid terms, and lifecycle conservation. See the [test mapping](03-MVP-ACCEPTANCE-AND-TESTS.md).

Build succeeds with Forge lint warnings for `block-timestamp` and `reentrancy-events`. Timestamps implement CPP-compatible expiry boundaries rather than randomness; the exact boundary is tested. Events follow guarded operations and trusted/static protocol reads; every mutating entry point is guarded, and callbacks during collection/capture/void are tested to fail with `Reentrancy()`. These warnings are retained in the build log, not silently suppressed. They are not proof of safety; further independent review remains appropriate.

## Limitations and residual risks

- Named-buyer orders, zero fees, full capture/full return only. Public open checkout and partial dispute splits are not implemented.
- No custom signature flow. Direct wallet transactions and exact-hash onchain pre-approval replace signature-based funding/release; no EIP-3009/Permit2 signature test coverage is claimed.
- A trusted reviewer can rule dishonestly. Lost/unresponsive keys cannot be replaced. A seller can deliver yet lose payment if release/ruling misses expiry. Contract cannot prove physical delivery.
- No automatic refunds, insurance, or post-capture clawback. CPP refund requires new liquidity; this operator intentionally omits it.
- USDC pause/blacklist/upgrade, protocol dependency flaws, transaction ordering, and deadline delays remain risks.
- Collector explorer verification is partial; its executable source and runtime were checked and deployed integration tests passed. This is not a claim of full metadata verification.
- No independent audit, live deployment, wallet-signed payment, public website, or judge-facing receipt exists yet. Fork balance seeding is local only.

## Exact next Base Sepolia steps, after Checkpoint 1 review

1. Review the operator and tests, especially named-buyer acceptance, reviewer trust, cancellation rights, 30-day maximum, and expiry semantics. Resolve review findings before deployment.
2. Re-run build/local tests, online protocol verification, and the fork suite with a suitable Base Sepolia RPC. Recheck canonical runtime hashes and Circle USDC configuration.
3. In a separately authorized step, deploy **only DealzaOperator** on chain `84532` and verify its source/compiler settings publicly. Reuse existing CPP escrow/collector; do not redeploy them. Record the real operator address and confirmed deployment receipt.
4. Use separate buyer, seller, and reviewer test wallets with faucet ETH and a small amount of Circle test USDC. No keys belong in this repository. Faucets: [Circle USDC](https://faucet.circle.com/) and [Base test ETH](https://www.coinbase.com/developer-platform/products/faucet).
5. Seller calls `createOrder` for the buyer, e.g. `1_000_000` units (1 USDC), future funding/capture cutoffs, agreed reviewer, and description hash. Read `getOrder(id)`; independently verify all CPP terms and `escrow.getHash(order.payment) == order.paymentHash`.
6. Buyer calls `USDC.approve(existingCollector, amount)`, `collector.preApprove(order.payment)`, then `operator.fund(id, order.payment)`. Confirm successful receipts, CPP `PaymentAuthorized`, buyer balance decrease, and TokenStore reserve. Allowance/pre-approval does not authorize release.
7. Confirm seller release is rejected by simulation without broadcast. Buyer explicitly calls `operator.release(id)`; confirm `PaymentCaptured`, exact seller balance increase, and zero reserve. Verify repeat release fails.
8. Create separate orders for seller cancellation, a buyer/seller dispute with reviewer release/void, and a short-expiry recovery. At/after expiry buyer calls **escrow** `reclaim(order.payment)` directly; confirm `PaymentReclaimed`, restored buyer balance, and derived Reclaimed status. Capture and reviewer release at expiry must fail.
9. Record actual network receipts/addresses and link them for judge review. Only after the checkpoint gate should UI and indexing work begin; derive balances/status from confirmed chain data.

No action in steps 3–9 was executed in Checkpoint 1. No wallet connection, signing, broadcasting, fund spending, public deployment, mainnet configuration, or frontend work occurred.
