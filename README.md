# Dealza

## How to Test

Checkpoint 1 covers local contracts and security verification only. No wallet, private key, faucet funds, or deployment is needed. No frontend or public order URL exists yet.

Install [Foundry](https://getfoundry.sh/introduction/installation/), Python 3, and curl. Tested with Foundry **1.8.5**, Solidity **0.8.28**, Cancun EVM. A first build may download the pinned compiler. Dependencies are vendored and hash-locked; no `forge install` is necessary.

```sh
curl -L https://foundry.paradigm.xyz | bash
# Open a new terminal, then:
foundryup --install v1.8.5
cd contracts
forge build
python3 scripts/verify_protocol.py
forge test
```

Expected: successful build and hash/ABI verification; unit/fuzz and stateful tests pass. Seller capture, altered payment terms, duplicate release, unauthorized dispute decisions, and capture at/after expiry must revert. Funds stay in CPP until an allowed release or return.

Run the deployed-protocol integration suite on a **local fork**, using read-only Base Sepolia RPC:

```sh
# Optional: override the rate-limited public RPC with your own Base Sepolia endpoint.
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
FOUNDRY_PROFILE=fork forge test
python3 scripts/verify_protocol.py --online
```

The fork defaults to block **53589971**; override with `BASE_SEPOLIA_FORK_BLOCK` if needed. Tests execute the existing escrow, collector, and Circle USDC; `deal` seeds USDC only in local fork storage. Nothing is signed or broadcast. The default profile excludes fork tests for offline use. The explicit fork profile fails on RPC errors rather than silently skipping tests.

Executed results: [original checkpoint report](docs/05-CHECKPOINT-1-REPORT.md) and [predeployment security review](docs/06-PREDEPLOY-REVIEW.md). This implementation has not received an independent security audit.

## Product and architecture

Dealza is a protected USDC order-payment application for social commerce on Base, entered in **Vibestarter Vibeathon 02**. Buyers and sellers keep their own wallets. Reserved funds stay in Commerce Payments Protocol (CPP), specifically its operator-specific TokenStore. Dealza restricts release to the buyer's explicit transaction or the agreed reviewer's dispute ruling.

`DealzaOperator` has no owner, upgrade, arbitrary execution, or admin release path. Seller-created orders name a buyer and reviewer, commit a description hash, and fix the exact CPP payment hash. Funding uses the existing pre-approval collector, full amount, and zero fees. Settlement is full capture or full void; no partial settlement or post-capture refund endpoint.

Delivery claims never authorize release. The contract cannot verify physical delivery. A dishonest reviewer can rule incorrectly; an unresponsive buyer/reviewer can leave a seller unpaid until buyer reclaim. No insurance or guaranteed refund is offered. No AI, chatbot, autonomous agent, new token, or private-key custody.

**A dispute does not freeze or extend CPP expiry.** At the capture deadline the buyer may reclaim uncaptured USDC directly from CPP even if review is unresolved. Reviewer rulings must execute before that deadline.

| Base Sepolia configuration | Value |
| --- | --- |
| Chain ID | `84532` |
| CPP release | `v1.1.0`, commit `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9` |
| Existing AuthCaptureEscrow | [`0xf96815976523E00e65Be8f34cA5e64b4f41EB19c`](https://base-sepolia.blockscout.com/address/0xf96815976523E00e65Be8f34cA5e64b4f41EB19c?tab=contract) |
| Existing PreApprovalPaymentCollector | [`0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea`](https://base-sepolia.blockscout.com/address/0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea?tab=contract) |
| Circle test USDC (6 decimals) | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://developers.circle.com/stablecoins/usdc-contract-addresses) |
| DealzaOperator deployment | **Not deployed** |

## Repository

- `contracts/src/` — restricted operator; `contracts/test/` — unit, fuzz, stateful, and deployed-contract fork tests.
- `contracts/vendor/`, `contracts/dependencies.lock.json` — pinned compilation closure/test dependencies and original license notices.
- `contracts/abi/` — exact verified v1.1.0 escrow ABI.
- `contracts/scripts/verify_protocol.py` — offline hashes/ABI and optional read-only deployment verification.
- [Protocol facts](docs/01-PROTOCOL-FACTS.md), [architecture/lifecycle/limits](docs/02-RELEASE-POLICY.md), [test mapping](docs/03-MVP-ACCEPTANCE-AND-TESTS.md), [future UI scope](docs/04-UX-AND-DEPLOYMENT.md), [checkpoint report](docs/05-CHECKPOINT-1-REPORT.md).

Review Checkpoint 1 before frontend work or any deployment. CPP, Solady, OpenZeppelin, and forge-std retain their own licenses; upstream notices are not Dealza authorship claims.
