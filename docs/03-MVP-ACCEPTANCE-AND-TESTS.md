# Checkpoint 1 acceptance and tests

Shared scenarios run against real upstream CPP locally and the deployed escrow/collector/Circle USDC on a Base Sepolia fork. Only local USDC is mocked. Fork storage seeding and impersonation never broadcast transactions. Default tests are offline; the separate explicit fork profile supplies deployed-protocol compatibility evidence.

| Requirement | Executed test/evidence |
| --- | --- |
| Seller cannot release; delivery is informational | `testSellerCannotReleaseOrDirectlyCapture` |
| Explicit buyer release, correct seller, no second release/fund | `testBuyerReleaseExactlyOnce`, `testWrongSellerRejected` |
| All 12 CPP fields immutable | `testFuzzRejectEveryAlteredPaymentField` (256 cases/suite) |
| Hash, full funding, protocol custody | `testExactHashAndCustody` |
| Exact CPP authorization/capture events and all operator-only checks | `testProtocolAuthorizationAndCaptureEvents`, `testAllOperatorOnlyProtocolEntrypointsRejectSeller` |
| No pre-funding release or outsider privileges | `testNoCaptureBeforeFunding`, `testOutsiderCannotFundReleaseCancelDisputeOrResolve` |
| Funding consent required and not reusable | `testAllowanceAloneInsufficient`, `testPreApprovalMustComeFromPayer`, `testPreApprovalCannotBeModifiedOrReplayedForAnotherOrder` |
| Atomic rollback after failed collection | `testPreApprovalAloneInsufficientAndFailedFundingAtomic` |
| Funding/capture boundaries | `testPreApprovalExpiryBoundary`, `testLastSecondCaptureSucceeds`, `testCPPItselfRejectsExpiredOperatorCapture` |
| Dispute blocks ordinary release; agreed reviewer rules | `testDisputeReviewerRelease`, `testSellerCanDisputeReviewerVoid`, `testReviewerCannotReleaseUndisputedOrder` |
| No reviewer ruling at expiry | `testReviewerCannotResolveAtExpiryInEitherDirection` |
| Payer-only recovery, derived status | `testCaptureFailsAtExpiryAndReclaimIsPayerOnly`, `testReclaimBeforeExpiryFails` |
| Cancellation/void/reclaim distinctions and races | `testSellerCancellationReturnsAllFundsAndBlocksRelease`, `testUnfundedCancellationInvalidatesPreApproval`, `testOperatorVoidAfterExpiryAndReclaimRace`, `testReclaimThenVoidRaceIsAtomic` |
| Conservation across amounts/verdicts | `testFuzzConservationAcrossVerdicts` (256 cases/suite) |
| Chain/escrow/operator domain separation | `testHashDomainSeparatesChainEscrowAndOperator` (local) |
| Reentrant collection/capture/void blocked | `testReentrancyDuringCollectionBlocked`, `testReentrancyDuringCaptureBlocked`, `testReentrancyDuringVoidBlocked` (local adversarial token) |
| Invalid roles, values, deadlines, missing dependencies | `testInvalidInputs`, `testUnknownOrderRejected`, `testNoMainnetOrMissingProtocolConfiguration` (local) |
| Stateful lifecycle and forbidden payout attempts | `invariantConservationAndOnlyPermittedPayouts`, `invariantProtocolStateAgreesWithOrders` (128 sequences × depth 32) |
| Exact version/ABI/deployed code | Verification script, fork runtime hashes, `verification/base-sepolia.json` |

No signature-based feature exists: onchain exact-hash pre-approval plus the caller's transaction replaces it. No EIP-3009, Permit2, or contract-signature integration coverage is claimed.

The predeployment review adds `ReviewSecurity.t.sol` and its separate fork suite: complete delivery-notice/release lifecycle; unsupported charge/refund/execution/upgrade selectors; dispute override/reviewer replacement rejection; unresolved-dispute reclaim and late-ruling rejection; cross-buyer TokenStore isolation/direct-call rejection; cross-operator pre-approval replay; no post-capture recovery; donation isolation; and revoked allowance rollback. Local-only tests add actual cross-chain funding rejection and injected transfer-failure rollback for capture/void/reclaim. The transfer-failure test is explicitly a fault injection, not a live Circle pause test. Fresh results are in `06-PREDEPLOY-REVIEW.md`.

Actual deployment, wallet-signed Base Sepolia transactions, verified Dealza address, public links, UI, indexing, and judge-facing receipts remain future work. Fork passes do not satisfy later live-wallet end-to-end acceptance. Review Checkpoint 1 before proceeding.
