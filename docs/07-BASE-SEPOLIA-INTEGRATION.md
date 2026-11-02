# Checkpoint 2 — Base Sepolia integration preparation

## Current decision and mandatory stop

**NO-GO for live deployment at the last recorded named-wallet preflight.** All four supplied roles had zero test ETH. Buyer had 1 test USDC; the sequential rehearsal needs at least 3 (10 recommended). These checks must pass before the named-wallet lifecycle rehearsal proceeds. The prior security GO is not a funded-wallet GO.

Latest check: Base Sepolia block **53612382**, [preflight snapshot](verification/integration/preflight.json), [exit-2 blocker log](verification/integration/preflight.txt). Buyer collector allowance was zero; no blacklist/pause check failed. The named-wallet lifecycle simulation remains unexecuted, so its per-transaction gas estimates are intentionally pending.

No deployment or public transaction has been sent. No wallet was connected, unlocked, or asked to sign. No private key, seed phrase, or wallet-secret environment variable is read by the preparation tools. The tool has **no live send or sign mode**. Separately authorize deployment and each subsequent fund-moving action after reviewing fresh preflight/rehearsal evidence. No frontend or mainnet execution configuration is introduced.

The working tree started clean at reviewed commit `2d611b0`. All repository text was read, including the predeployment review, tests, pinned sources, and existing evidence. `contracts/src/DealzaOperator.sol` is unchanged. The deployer has no administrator, owner, upgrade, custody, or release authority.

## Network and public roles

These public addresses were supplied by the user in deployer/buyer/seller/reviewer order. They are distinct EOAs at the observed snapshot; this does not prove wallet control or reviewer independence.

| Role | Public address | Initial ETH | Initial USDC |
| --- | --- | --- | --- |
| Deployer | `0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a` | 0 | 20 |
| Buyer | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25` | 0 | 1 |
| Seller | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf` | 0 | 0 |
| Agreed reviewer | `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548` | 0 | 0 |

Configuration is public-only in `contracts/config/base-sepolia.roles.json`. No keys belong in that file. Deployer's USDC is not used by the plan and will not be transferred automatically.

Enable test networks in the wallet and select Base Sepolia, or add these [official network settings](https://docs.base.org/get-started/connect-to-base):

| Setting | Value |
| --- | --- |
| Network | Base Sepolia |
| Chain ID | `84532` (`0x14a34`) |
| RPC | `https://sepolia.base.org` |
| Gas token | ETH (test ETH) |
| Explorer | `https://sepolia.basescan.org` |

For test ETH use the [CDP faucet](https://portal.cdp.coinbase.com/onchain-tools/faucet), selecting Base Sepolia and ETH for each public role, or an alternative in [Base's official faucet list](https://docs.base.org/get-started/get-funds). Suggested faucet budgets are 0.02 test ETH for deployer and 0.01 each for buyer/seller/reviewer; these are cushions, not measured gas fees. For buyer test USDC use [Circle's faucet](https://faucet.circle.com/), select USDC/Base Sepolia, and submit the buyer public address. No faucet was invoked by the agent.

## Protocol, constructor, and immutable payment settings

| Item | Exact value |
| --- | --- |
| CPP version | v1.1.0, commit `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9` |
| Existing escrow | `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c` |
| Existing supported collector | `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea` (PreApprovalPaymentCollector) |
| Circle test USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals |
| Constructor arguments | **None: `[]`**, no ABI suffix added to creation bytecode |
| Constructor native value | `0` |
| Compiler settings | solc 0.8.28, Cancun, via IR, optimizer 100000 |
| MAX_DURATION | 30 days |
| Per-order price | `1_000_000` raw units = 1 test USDC |
| Fees | Both bounds zero, absolute v1.1.0 `feeAmount = 0`, fee receiver zero |
| Reviewer | Seller appoints at creation; buyer accepts by funding; no replacement/override |
| Order expiry | Funding cutoff ≤ capture expiry; refund expiry = capture expiry |
| Actual Dealza deployment | **None**; all contract-address/receipt fields for live execution remain null |

Constructor rejects the wrong chain, absent dependency code, or a collector bound to the wrong escrow. Existing infrastructure is reused. Each order constructs `PaymentInfo.operator` as the deployed Dealza address; seller/buyer/token/amount/deadlines/fees/salt are fixed and hashed by CPP. Order ID includes chain/operator/seller/nonce and becomes CPP salt. Reviewer and description are immutable order storage associated with that salt.

The current read-only protocol verifier passed hashes, full ABI, source provenance, collector binding, executable runtime comparisons, and USDC precision/implementation checks. Collector remains partially verified in explorer metadata; locally compiled executable runtime matches the deployed collector. See [protocol log](verification/integration/protocol.txt) and [runtime snapshot](verification/integration/protocol-runtime.json).

## Safe preparation tools and commands

From `contracts/`:

```sh
forge build
forge test
FOUNDRY_PROFILE=fork forge test
python3 -m unittest discover -s scripts -p test_integration.py -v
python3 scripts/verify_protocol.py --online --runtime-report ../docs/verification/integration/protocol-runtime.json
python3 scripts/integration.py preflight --output ../docs/verification/integration/preflight.json
```

Preflight is read-only. It checks chain, escrow/collector code hashes, collector binding, token precision/pause/blacklist, each role's ETH/USDC/nonce/code, and constructor behavior. It writes an unsigned deployment request and reports blockers with exit code **2**. It never requests or unlocks a wallet. An unexpected tool/protocol error exits **1** with no live action.

After funding checks pass, the exact named-role sequential simulation is:

```sh
python3 scripts/integration.py simulate --output ../docs/verification/integration/rehearsal.json
```

`simulate` repeats public preflight and **stops before starting a mutable fork if it fails**. It then starts its own private loopback Anvil fork at the recorded current block, with zero generated accounts and suppressed node output. Only this internally owned local endpoint accepts simulation transactions. Public RPC has a read-method allowlist, rejecting send/sign/unlock/mutation methods. No live RPC can be supplied as a mutable endpoint.

The fork uses the named wallets' actual snapshot balances/nonces; it does not seed token balances or grant fake gas. Local impersonation simulates the callers without keys; it does not connect/unlock real wallets. Every local transaction is preceded by `eth_estimateGas` and `eth_call`, then state is inspected through real deployed CPP/Circle code on the fork. Only expiry time is advanced locally. The fork is terminated afterward. Local hashes are not exported as live receipts: live hash/explorer fields remain null.

Outputs include unsigned calldata, signer role, snapshot nonce, estimated execution gas, a 25% proposed gas-limit buffer, local receipt gas used/events, before/after balances, order/payment hashes, CPP state, and Dealza stored/derived states. These are **simulation evidence**, not signable promises about future state. Recreate orders/payment hashes and re-simulate against the actual deployed operator before every separately authorized live transaction. Do not blindly sign old rehearsal calldata: addresses, nonces, deadlines, and state may change.

## Actual verification so far

| Check | Result |
| --- | --- |
| Checkpoint source/tree | Clean start at `2d611b0`; operator source unchanged |
| `forge build` | PASS; existing timestamp/event lint warnings retained in [build log](verification/integration/build.txt) |
| Complete local tests | **46 passed, 0 failed, 0 skipped**; two 256-case fuzz tests and stateful invariants (128 × 32 calls). [Log](verification/integration/local-tests.txt) |
| Complete fork tests | **36 passed, 0 failed, 0 skipped** at prior pinned test block 53589971. [Log](verification/integration/fork-tests.txt) |
| Preparation-script safety tests | **3 passed**: public mutation rejection, invalid role/chain rejection, and failed preflight cannot start fork. [Log](verification/integration/script-tests.txt) |
| Online protocol verification | PASS; fresh runtime/source/token snapshot linked above |
| Exact creation bytecode via public `eth_call` | PASS: returned runtime equals artifact; `[]` constructor arguments. [Constructor evidence](verification/integration/constructor.json) |
| Constructor execution-gas estimate | **2,144,685** at block 53610709 with **zero gas-price override for read-only estimation only**; not a funded-wallet simulation or total Base fee |
| Named-wallet public funding preflight | **NO-GO**; zero ETH in all roles and only 1 buyer USDC at the initial observations. [Initial snapshot](verification/integration/preflight-initial.json) |
| Named-wallet lifecycle rehearsal | Pending successful fresh funding preflight; no success claimed |

## Transaction-by-transaction plan and gas accounting

All five funded cases A–E use fresh orders with unique IDs/payment hashes, each priced at 1 test USDC. A and C pay the seller; B/D/E return the reserve. Run sequentially: buyer requires at least 3 USDC to execute the full sequence (2 USDC captured, with 1 available for subsequent return cases); 10 is recommended. Case F is never funded. Never reuse a captured/voided/reclaimed payment for another state transition.

Every row marked as a transaction requires that role's **wallet transaction signature and test ETH** later. No offline release signature, EIP-3009, Permit2, relayer, paymaster, or gas sponsorship is implemented. Buyer signs separate ERC20 allowance and collector pre-approval transactions for exact CPP terms, then funds. Reviewer/description agreement must be inspected in immutable order storage before funding; they are not additional CPP fields.

| Step | Signer → target | Expected result | Execution gas estimate |
| --- | --- | --- | --- |
| Deployment | Deployer → CREATE DealzaOperator | Exact artifact runtime, constructor `[]`, no admin | 2,144,685 read-only smoke estimate; proposed 25% buffered limit 2,680,857; refresh before signing |
| A1–E1, separately | Seller → Dealza `createOrder` | Named buyer, reviewer, amount, deadlines, description, unique hash fixed | Pending named-wallet rehearsal |
| A2–E2 | Buyer → USDC `approve(collector, 1_000_000)` | Exact allowance; no reserve/capture | Pending |
| A3–E3 | Buyer → collector `preApprove(payment)` | Exact CPP hash approved by its payer | Pending |
| A4–E4 | Buyer → Dealza `fund(id, payment)` | Buyer −1 USDC; CPP TokenStore +1; operator zero; capturable 1; Reserved | Pending |
| A5 | Seller → Dealza `noteDelivery` | Evidence event only; no balance change | Pending |
| A rejection checks | Read-only `eth_call` from seller → Dealza release and CPP capture | Both revert; no signature, gas spend, or transaction hash | None: read-only |
| A6 | Buyer → Dealza `release` | Seller +1, held zero, Released, CPP `PaymentCaptured` | Pending |
| A duplicate check | Read-only buyer release again | Reverts; no second payout | None |
| B5 | Seller → Dealza `cancel` | Full CPP `PaymentVoided` to buyer; Voided | Pending |
| C5 | Buyer → Dealza `dispute` | Disputed; buyer release blocked | Pending |
| C negative checks | Read-only buyer release/seller resolve | Revert; agreed reviewer unchanged | None |
| C6 | Reviewer → Dealza `resolve(id, true, decisionHash)` | Before expiry: full capture to fixed seller | Pending |
| D5 | Buyer → Dealza `dispute` | Separate Disputed order | Pending |
| D6 | Reviewer → Dealza `resolve(id, false, decisionHash)` | Before expiry: full CPP void to buyer | Pending |
| E5 | Buyer → Dealza `dispute` | Leave unresolved | Pending |
| E boundary checks | Read-only buyer reclaim before expiry; reviewer ruling at expiry | Both prohibited calls revert at their respective boundaries | None |
| E6 | Buyer → **CPP directly** `reclaim(payment)` | At/after expiry: buyer +1 USDC despite unresolved dispute; derived Reclaimed | Pending |
| E7 | Buyer → Dealza `syncRecovery` | Stored status catches up; no token movement | Pending |
| F1–F3 | Seller creates fresh order; buyer grants allowance and pre-approves | No reservation yet | Pending |
| F4 | Seller → Dealza `cancel` | Unfunded order voided locally; no CPP collection/return | Pending |
| F negative check | Read-only buyer funding attempt | Reverts; persistent pre-approval cannot revive order | None |
| F5 | Buyer → USDC `approve(collector, 0)` | Unused allowance revoked | Pending |

For ordinary test orders the tool chooses funding cutoff one hour after creation and capture expiry two hours after creation; refund expiry equals capture expiry. These are test windows, not shipping promises. The expiry rehearsal advances only local time to the exact deadline. A live expiry test must wait for actual Base Sepolia block time, with fresh simulations before signing.

Rehearsal gas values will come from per-transaction estimates and actual local receipts, not aggregated Foundry test gas. Base fees include components beyond EVM execution gas; the proposed 25% execution limit is not an all-in fee quote. Before live signatures refresh wallet/chain estimates including L1 data/operator fees, confirm each role's ETH budget, and preserve some gas for buyer recovery.

## Live confirmation and receipt requirements

After separate authorization, deploy only the operator. Verify its actual source/runtime and read `ESCROW`, `COLLECTOR`, `USDC`, `CHAIN_ID`, `MAX_DURATION`; record a genuine receipt/explorer URL. Subsequent actions need separate authorization and fresh named-wallet simulation. No production duplicate CPP infrastructure is required.

For each real transaction retain: chain, actual sender/target, real hash, confirmed receipt/status, decoded event name/hash/amount, order/payment hash, buyer/seller/operator/TokenStore balances, allowance, CPP `(hasCollectedPayment, capturableAmount, refundableAmount)`, stored and derived Dealza status, and explorer URL `https://sepolia.basescan.org/tx/<REAL_HASH>`. Failed `eth_call` checks have no transaction hashes. Until execution, those fields stay null and there are no live order links/receipts.

**A dispute never freezes CPP expiry reclaim.** If reviewer is unavailable or misses expiry, buyer can recover the uncaptured reserve directly in CPP. `getOrder().status` may remain Disputed until sync; derived `status` and CPP balances are authoritative. `refundableAmount` after capture is an accounting limit, not refund liquidity. No post-capture refund, guaranteed protection, automatic delivery verification, reviewer replacement, or owner bypass is added.

## Version-control preservation and remaining deployment gate

Preparation changes are limited to public role configuration, no-broadcast scripts/safety tests, documentation, and historical evidence. The reviewed contract and pinned dependencies remain unchanged. The frontend is preserved in commit `f1458e9`, following the contract checkpoint `2d611b0`.

The November 2, 2026 preservation request supersedes the earlier instruction to leave preparation uncommitted until the funded rehearsal passes. This separate local commit preserves **Checkpoint 2 preparation only**. It does not claim integration success or authorize deployment, signatures, spending, publishing, or a GitHub push. Historical evidence above is retained at its original blocks; wallet balances and readiness must be checked again.

Still required before the November 9, 2026 submission:

- Refresh the read-only named-role funding preflight. At the last recorded snapshot every role had zero test ETH and buyer held only 1 test USDC; the sequential rehearsal requires at least 3 test USDC.
- Complete the named-wallet local fork rehearsal and record per-transaction gas estimates and state/balance evidence. The successful generic fork suite does not replace this rehearsal.
- After separate deployment authorization, deploy and verify the operator, then fill the currently null `operator`, `deploymentBlock`, and `deploymentTransaction` in `contracts/config/base-sepolia.deployment.json` with confirmed onchain values. No constructor arguments are required.
- Complete separately authorized live lifecycle checks and preserve genuine receipts. Rebuild and verify the frontend against the actual deployment.
- Select/connect the frontend hosting project and record a public submission URL after separately authorized publishing. Vercel build/output/header configuration already exists; an optional browser RPC must be public, without secret credentials. No secret environment file is required by the current frontend.

Fresh preservation checks and their limitations are recorded in [the preservation review](verification/integration/preservation-review.md). Funding, rehearsal, deployment identity, and live receipt gaps remain explicit blockers to claiming a completed real testnet integration.
