# Fresh Base Sepolia readiness — 2026-11-02

> Historical snapshot: the three participants have since been funded. The [funded-wallet preflight](../funded-preflight/READINESS.md) verifies the funding receipts and reports a new delegated-deployer rehearsal blocker. Use that report for the current decision; preserve the balances and proposals below as historical evidence.

**NO-GO for controlled deployment under the existing integration gate.** Deployment funding is sufficient; buyer USDC is sufficient. Buyer, seller, and reviewer still need gas, and the named-wallet rehearsal has not passed. Historical zero-deployer-ETH and insufficient-buyer-USDC findings are superseded by the snapshots here.

Reviewed README and docs 06–08. HEAD `26d1157`, frontend `f1458e9`, contract review `2d611b0`. Reviewed Solidity, pinned vendor sources/ABI, and Foundry configuration remain unchanged. Only new readiness evidence was added; deployment identity remains null.

## Fresh public balances

Snapshot block **53649262**, chain **84532**, timestamp **2026-11-02 20:35:21 UTC** (`preflight.json`). All roles are plain EOAs, nonce 0, not USDC-blacklisted. USDC is unpaused, 6 decimals; buyer collector allowance is zero.

| Role | Public address | ETH | Circle test USDC |
| --- | --- | ---: | ---: |
| Deployer | `0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a` | 0.01 | 20 |
| Buyer | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25` | 0 | 21 |
| Seller | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf` | 0 | 0 |
| Reviewer | `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548` | 0 | 0 |

The **deployer** received 0.01 ETH. Buyer holds **21,000,000 raw USDC units**, exceeding the sequential rehearsal minimum of 3 USDC. No token transfer is needed.

## Deployment simulation and fee budget

Fresh nonzero-price `eth_estimateGas` at block **53649490**: **2,144,685 gas**. Constructor `eth_call` returns the exact reviewed 9,586-byte runtime; creation code is 9,994 bytes. Constructor arguments `[]`, native value 0; solc 0.8.28 / Cancun / via IR / optimizer 100000. The successful constructor/runtime call establishes execution compatibility at the snapshot.

- Gas price: **6,000,000 wei = 0.006 gwei**.
- Estimated execution fee: **0.00001286811 ETH**.
- Oracle L1 data fee upper bound: **0.000000677222275210 ETH**, using initcode length plus a conservative 128-byte unsigned envelope.
- Oracle operator fee at buffered gas: **0 wei**.
- Execution estimate plus L1 bound: **0.000013545332275210 ETH**.
- Proposed gas limit: **2,680,857** (25% buffer).
- Budget at twice the snapshot gas price and twice the L1/operator estimates: **0.000033524728550420 ETH**. This is a cushion, not a guaranteed future maximum.

The deployer has roughly 738 times the snapshot estimated total. Its 0.01 ETH is ample, including the proposed participant funding below.

`deployment-estimate.json` contains the complete **unsigned** CREATE proposal: chainId 84532, configured deployer, omitted `to`, value 0, exact artifact creation data, snapshot nonce 0, gas 2680857, proposed legacy gasPrice 12000000 wei. Creation bytecode SHA-256: `45d2044b191500c9e097982f436a27cad6eb8105f72e161cd59946b854d6094a`. No constructor suffix. This is review material, not current execution authorization. If the deployer makes three funding transfers first, its nonce would normally become 3; refresh pending nonce and fees before constructing the actual deployment transaction. No predicted address is a deployed identity.

Fee methods: [Base fee documentation](https://docs.base.org/specifications/transactions/network-fees), [OP Fjord L1 bound](https://specs.optimism.io/protocol/fjord/predeploys.html). Quotes reflect these onchain snapshots, not a promise about inclusion-time fees.

## Small proposed funding plan — no execution

From the funded deployer on **Base Sepolia only**:

| Recipient | Proposed test ETH | Required actions |
| --- | ---: | --- |
| Buyer | **0.00010** | Exact allowances, pre-approvals, funding, release/disputes, direct CPP expiry reclaim, optional sync, allowance revoke |
| Seller | **0.00005** | Six order creations, delivery notice, funded/unfunded cancellation; seller disputes if selected |
| Reviewer | **0.00002** | Two dispute verdicts: release and return |

Only **three ETH transfers**, total **0.00017 ETH**. These are modest provisional practical cushions, **not measured lifecycle minima**: exact participant totals remain unavailable because the honest funded-wallet rehearsal is blocked. Refresh wallet fee estimates before separately authorized transfers; rerun preflight/rehearsal afterward, topping up only if measured totals require it. Preserve buyer recovery gas.

At block **53649666**, each proposed transfer estimates **21,000 gas** and approximately **0.000000136701713085 ETH** including an L1 bound; no nonzero operator fee was observed. Three transfer fees total approximately 0.000000410105139255 ETH. About **0.009829589894860745 ETH** remains with deployer after values and these fee estimates, before deployment. Public unsigned transfer proposals are in `funding-plan.json`; no nonce/signature is assigned and nothing was submitted.

## Rechecks and exact blockers

- `forge build`: PASS; existing lint warnings retained.
- `forge test`: **46 passed**, zero failures/skips.
- `FOUNDRY_PROFILE=fork forge test`: **36 passed**, zero failures/skips, historical pinned fork block 53589971. This is distinct from current-wallet rehearsal.
- Preparation safety tests: **3 passed**.
- Frontend tests: **44 passed**; production build (including ABI provenance and TypeScript): PASS. Existing optional Tempo worker externalization warning retained.
- Online protocol verifier: PASS, 77 pinned files/full ABI, upstream provenance, escrow/collector/TokenStore executable matches, USDC implementation checks. Collector explorer metadata remains partially verified; executable compatibility passed.
- Fresh named-wallet `preflight`: **exit 2**, only blockers: buyer/seller/reviewer each have zero test ETH.
- Named-wallet `simulate`: **exit 2**, same current funding blockers; stopped before creating a mutable local fork. No funded rehearsal, lifecycle gas totals, or real receipts are claimed. `rehearsal-attempt.json` is the repeated preflight snapshot, not a successful rehearsal.

Canonical contracts verified:

- CPP escrow `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c`
- Collector `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea`, correctly bound to escrow
- Circle test USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Remaining predeployment blockers:** fund the three participants; obtain a successful fresh named-wallet local rehearsal and inspect its gas/state evidence. Do not bypass the failed funding gate or seed balances to call it passed.

After those pass and separate deployment authorization: deploy only DealzaOperator, verify source with matching settings and no constructor arguments, compare full onchain runtime against the reviewed artifact, read `ESCROW`, `COLLECTOR`, `USDC`, `CHAIN_ID`, `MAX_DURATION`. From `contracts/`, proposed verification procedure is `forge verify-contract --chain 84532 --compiler-version 0.8.28 --num-of-optimizations 100000 --via-ir --evm-version cancun --watch <ACTUAL_OPERATOR_ADDRESS> src/DealzaOperator.sol:DealzaOperator` with verifier credentials handled outside logs/repository. No verification submission was performed. [Foundry verification reference](https://github.com/foundry-rs/book/blob/master/src/pages/reference/forge/verify-contract.mdx).

**Later live-integration requirements:** populate the actual confirmed operator address, numeric block and transaction hash in `contracts/config/base-sepolia.deployment.json`; retain chainId 84532. Recheck ABI/runtime, run frontend tests/build/protocol verification and wallet-specific simulations. Browser RPC is optional and public (`VITE_BASE_SEPOLIA_RPC_URL`); never expose secret credentials through VITE values. Real receipt-based lifecycle acceptance and separately authorized frontend publication remain outstanding. A null deployment intentionally disables product writes.

**Rollback limitations:** deployment and confirmed transactions cannot be undone. Operator has no upgrade/admin/pause/rescue mechanism; replacing it creates a different address and does not migrate existing orders. Changing frontend configuration cannot reverse capture or recover old reserves. Seller void or direct payer expiry reclaim can return uncaptured funds under their existing rules; capture has no operator refund path. A dispute never extends expiry.

**Next exact action:** separately authorize/perform only the three proposed Base Sepolia ETH transfers, then run from `contracts/`: `python3 scripts/integration.py simulate --output ../docs/verification/funding-refresh/rehearsal-after-funding.json`. It repeats preflight and must pass before requesting deployment execution.

No signing, public broadcast, deployment, fund transfer, secret access, contract logic change, GitHub push, or fabricated deployment identity occurred.
