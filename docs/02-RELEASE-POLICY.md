# Architecture, lifecycle, and security limits

## Immutable terms and acceptance

Seller creates an order naming a buyer, amount in six-decimal USDC units, funding cutoff, capture/reclaim expiry, reviewer, and nonzero description hash. Seller/buyer/reviewer must be distinct. Capture expiry must be within 30 days. No term editing or reviewer replacement exists.

The order ID derives from chain/operator/seller/increasing seller nonce and becomes CPP's salt. Dealza constructs every other CPP field: fixed Circle USDC, exact parties/amount/deadlines, zero fee bounds/recipient, and refund expiry equal to capture expiry. It stores the exact CPP hash. Reviewer and description are immutable order storage bound to that salt, not extra CPP struct fields. Buyers must inspect these terms before pre-approval/funding.

Buyer grants an exact allowance to the existing collector, calls `collector.preApprove(order.payment)`, then `operator.fund(id, order.payment)`. Funding must come from the recorded buyer. Any changed field fails the hash check; callers cannot select collector/amount/data. CPP pulls directly from buyer to TokenStore; Dealza checks resulting protocol state. Failure rolls back reservation atomically. Funding consent is distinct from release consent.

Checkpoint 1 uses **named-buyer orders** to remove acceptance races. Future open checkout must establish immutable accepted buyer/reviewer terms before funding. No frontend is implemented.

## Lifecycle

| State | Caller/action | Result |
| --- | --- | --- |
| Pending | Buyer funds before funding cutoff | Reserved inside CPP |
| Pending | Buyer or seller cancels | Voided locally; no collection |
| Reserved | Seller notes delivery evidence | Event only; still Reserved |
| Reserved | Buyer calls `release` before expiry | Full CPP capture to fixed seller |
| Reserved | Buyer or seller disputes before expiry | Disputed; ordinary release blocked |
| Disputed | Agreed reviewer resolves before expiry | Full capture to seller or full void to buyer |
| Reserved/Disputed | Seller voluntarily cancels | Full CPP void, including after expiry |
| Reserved/Disputed, at/after expiry | Buyer calls CPP `reclaim(payment)` directly | Full remaining reserve returned to buyer |

Buyer cannot unilaterally cancel funded orders before expiry: seller cooperation or reviewer ruling is required. Reviewer decisions need a nonzero decision hash and cannot alter terms. Seller can surrender its claim by voiding. No partial split, automatic capture, admin override, or offline release signature exists.

`status(id)` is the authoritative derived Dealza view. It reports Expired after funding/capture cutoff and Reclaimed after a funded expired payment has zero remaining/captured balance. `getOrder(id).status` is stored transition history and can lag direct reclaim. Anyone can call `syncRecovery` after successful payer reclaim. A void/reclaim race has one winner; the other reverts. Display confirmed CPP state/logs/balances, not optimistic local status.

## Enforcement

- No owner, proxy, upgrade, delegatecall, arbitrary execution, charge, withdrawal, or generic CPP forwarding endpoint.
- Buyer `release(id)` authorizes/captures atomically. Copied calldata from seller/outsider lacks buyer permission.
- Capture only from Reserved buyer release or Disputed reviewer ruling, strictly before expiry. CPP independently checks expiry and authorization.
- Terminal states prevent repeat funding/release. CPP independently prevents second collection. Nonces/salts and chain/escrow/operator domains prevent cross-order reuse.
- All mutating operator methods use a transient reentrancy guard. State updates precede transfers and revert atomically on failure.
- Constructor rejects wrong chains, missing dependency code, and collector/escrow mismatch. Read-only verification and fork tests check exact protocol runtime versions.
- No funds intentionally transit DealzaOperator. Accidental direct transfers have no admin rescue path and do not fund an order.

## Remaining risks and limitations

The contract cannot verify physical delivery. A dishonest/compromised reviewer can favor either party; distinct addresses do not prove independent humans. Lost reviewer keys cannot be replaced. If nobody acts before expiry, buyer recovery wins even if seller delivered. Deadline transactions may be delayed or lose races; act well before expiry.

After capture, seller owns the USDC. No guaranteed refund, chargeback, insurance, or automatic recovery exists. CPP refund needs replacement liquidity; future support requires explicit seller-liquidity authorization and separate review.

Circle can pause/blacklist/upgrade USDC and prevent transfers/recovery. CPP/dependency correctness remain assumptions. The collector's partial verification is recorded. Tests are not an independent audit.

No Dealza signature verifier exists: direct transactions plus onchain exact-hash pre-approval remove that attack surface. Tests cover altered/reused approvals, copied release calls, and domain separation; they do not claim EIP-3009/Permit2 signature coverage.

Addresses, amounts, hashes, timing, and evidence commitments are public. Keep personal delivery information offchain, and preserve descriptions/evidence so reviewers can interpret the hashes.
