# Duplicate verification and first-payment continuation

**Update: GO for Transaction 2 only — the duplicate cancellation is confirmed and the exact buyer allowance is ready for manual review. No approval has been signed or broadcast. See the current evidence below; the earlier pre-cancellation sections are historical.**

This supersedes the preparation snapshot and “no live order” statements in report 11. It does not claim that the live checkout or payment has completed. The wallet compatibility and draft autosave fixes in report 12 remain intact.

## Independently verified snapshot

Direct reads at Base Sepolia block **53842067**, hash `0xcbe77d3ec7239a8fa236c4f7e24afe60ced1d40d1141aac5d4614605907c62e8`, chain time **2026-11-03 07:18:02 UTC / 08:18:02 WAT**. Two subsequent blocks had already been observed before choosing the snapshot. A second public RPC independently agreed on the canonical header, both complete orders and both CPP financial states.

[Full snapshot](verification/checkout-continuation/snapshot.json) and [read-only results](verification/checkout-continuation/read-only-check.txt). The IDs were retrieved from report 12, independently recomputed from chain/operator/seller/creation nonce, and matched against genuine creation events, canonical successful receipts, stored terms and CPP `getHash(payment)`. Operator, CPP and collector runtime hashes and dependency bindings match the pinned deployment.

| Field                                   | Original — retain                                                    | Duplicate — cancel only this one                                     |
| --------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Complete order ID                       | `0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f` | `0x808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97` |
| Exact CPP payment hash                  | `0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59` | `0xe7c74172a0e4ac536de9ba8b8d5af15a9b54eca20041cc7d7fec8e67f9134de1` |
| Stored / derived status                 | Pending (1) / Pending (1)                                            | Pending (1) / Pending (1)                                            |
| Amount                                  | 1,000,000 units = 1 test USDC                                        | 1,000,000 units = 1 test USDC                                        |
| Collector pre-approval                  | false                                                                | false                                                                |
| CPP collected / capturable / refundable | false / 0 / 0                                                        | false / 0 / 0                                                        |
| Reservation deadline                    | 2026-11-03 17:00 UTC / 18:00 WAT; Unix 1793725200                    | Same                                                                 |
| Release/review/refund expiry            | 2026-11-05 17:00 UTC / 18:00 WAT; Unix 1793898000                    | Same                                                                 |

For both orders:

- Seller/receiver: `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`.
- Buyer/payer: `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`.
- Reviewer: `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548`.
- Operator: `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`.
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals, unpaused; buyer and seller are not blacklisted.
- Description fingerprint: `0xb28c8133d0699cbe2cda54262423de1d3c2fb55227e1508afa38602334c4ced4`; text: `Dealza Checkpoint 4: controlled 1 test-USDC checkout`.
- Both fee bounds and fee receiver are zero; salt equals the respective order ID.

The original remains usable: pending, unfunded, no prior CPP collection, and its reservation deadline was **34,918 seconds (9h 41m 58s)** in the future at the snapshot. Do not use the obsolete proposal's payment hash or deadlines from report 11.

## Cancellation method and readiness

The permitted call is **DealzaOperator `cancel(duplicateId)`**, signed manually by the seller. The deployed source's `Status.Pending` branch checks buyer-or-seller authorization, sets the order to `Voided`, and emits `OrderVoided(id, authorizedBy)`. It makes **no CPP call and transfers no tokens**. CPP `void(payment)` instead requires a nonzero capturable authorization and is not the cancellation method for these unfunded terms.

Fresh `eth_call` simulation with the actual seller, deployed operator and exact duplicate ID **passed** at the snapshot. Gas estimate: **33,943** execution gas; MetaMask must calculate current gas and fees. The seller has **0.000049812291697244 ETH**, confirmed/pending nonce **4 / 4**, and the EIP-7702 delegation indicator recorded in the snapshot. No account downgrade or delegation modification is needed.

**The next single MetaMask action is seller cancellation of the duplicate.** Open the [verified operator contract](https://base-sepolia.blockscout.com/address/0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8?tab=contract), use its contract write interface, connect the seller on Base Sepolia, choose `cancel(bytes32)`, and enter **only** `0x808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97`. Review zero native ETH value and the operator destination before confirming in MetaMask. Refresh the read-only preflight first if account, status, allowance or balances change.

[Exact unsigned manual transaction](verification/checkout-continuation/next-manual-transaction.json):

```json
{
  "chainId": "0x14a34",
  "from": "0xF74aD341e10187073a0eef55356D136F1be5E3Cf",
  "to": "0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8",
  "value": "0x0",
  "data": "0xc4d252f5808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97"
}
```

No transaction has been sent to MetaMask or broadcast by these tools. Never put the original ID into the cancellation field.

## Verify the manual receipt before advancing

After the seller supplies the actual cancellation hash, run:

```sh
node web/scripts/verify-live-checkout.mjs --cancellation-hash=0xFULL_TRANSACTION_HASH
```

The read-only verifier accepts EIP-7702 relayed cancellation without relying on the outer sender or destination. It requires a canonical successful receipt with at least two confirmations, exactly one genuine operator `OrderVoided(duplicateId,seller)` event, duplicate stored/derived status **Voided (5)**, and the original still **Pending (1)** with no authorization or funds. A cancellation event for the original, unrelated event, wrong emitter/authorizer, failed receipt, insufficient confirmations, changed original state or unexpected funds fails verification. It also discovers any already-confirmed seller cancellation through a complete event scan; no repeat cancellation is prepared once resolved.

Cancellation remains **unconfirmed** because no cancellation receipt was provided or discovered. The prior creation fix deliberately does not generalize every payment action's outer-transaction guard; the independent event/state verifier is used for this manual step, and a UI message alone must not trigger another transaction.

## Buyer preparation — verified, not yet the next action

The buyer holds **21,000,000 USDC units = 21 test USDC** and **0.0001 ETH**. Confirmed/pending nonce is **0 / 0**, account code empty. Allowance to the CPP collector is **0**. Operator and predicted TokenStore `0x57EC2910410C3Ef888c6127A3684d04171D5a11a` each hold **0 USDC**. Both exact payment hashes have collector pre-approval false and CPP `(false,0,0)`.

A complete deployment-to-snapshot scan of operator events for both IDs and CPP/collector events for both payment hashes found only their two creation events: **no `PaymentPreApproved`, `PaymentAuthorized`, `OrderFunded` or capture event**, and no cancellation yet. The original's successful creation transaction is `0x26498aaab70c0e6fef9009b046584cf8abf5873760ba3381f336c89aed9749e6`; the duplicate's is `0x0a041cd43fd4931414cdcc4672a5621741e53fd46d20b5d0fe576439c7f0b06b`. Account nonce equality and public chain history do not establish whether MetaMask holds an unsent wallet-local request; close any old pending confirmation before starting a manual action.

After duplicate cancellation is independently confirmed and a fresh preflight still passes, the prepared buyer allowance is exactly **1,000,000 units** to spender **`0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea`**, using the USDC contract. It is not an unlimited allowance or approval to the operator/seller/escrow. The script does not prepare that transaction as the next action until the duplicate's event/state proof passes. It never requests a wallet signature or sends a transaction. Each later pre-approval, reservation, delivery and release remains a separate manual step from the live-payment procedure.

## Quality and local preservation

- Frontend: **121 passed**, including 8 new cancellation-readiness and relayed-receipt proof tests plus all wallet/draft regressions. [Log](verification/checkout-continuation/web-tests.txt).
- Local contracts: **46 passed**. [Log](verification/checkout-continuation/contract-tests.txt). No Solidity source changed.
- Production build: PASS, including ABI provenance and TypeScript. The existing optional `ox` worker externalization warning remains. [Log](verification/checkout-continuation/web-build.txt).
- Direct public-RPC verification, exact cancellation simulation and second-RPC agreement: PASS. [Evidence](verification/checkout-continuation/snapshot.json).
- Git whitespace/staging checks: PASS; explicit staging keeps unrelated README, public-source and deployment-preparation work separate.

The frontend compatibility/draft fixes and their regressions are preserved in focused local commit `dd16069` (`fix(web): verify relayed order creation and persist scoped drafts`). Fresh checkout verification tooling, tests, this report and evidence are preserved separately. No Solidity edits, deployment, token approval, fund movement, transaction signing/broadcast, delegation change or GitHub push was performed.

## Confirmed cancellation and Transaction 2 readiness — 3 November 2026

**GO for Transaction 2 only: buyer approval of exactly 1 test USDC. Stop before signing.** This update supersedes all statements above that cancellation remains unconfirmed or that seller cancellation is the next action. Approval does not reserve or release USDC; those remain separate future actions.

Fresh snapshot: Base Sepolia **53854557**, hash `0x5d575bfdbe9a6bafc22126ab011478748e7f7eec92cc212a241b4738351db0bc`, **2026-11-03 07:59:40 UTC / 08:59:40 WAT**. The checkout verifier independently crosschecked the canonical header, both complete stored orders, and CPP financial states with a second RPC. [Snapshot](verification/checkout-continuation/snapshot.json), [verification log](verification/buyer-approval/read-only-check.txt), [receipt and simulation evidence](verification/buyer-approval/evidence.json).

Cancellation transaction [`0x9a150e4934f63566722ce02cf20d7d2857fa774e63236eb312e8bcac237c46b2`](https://base-sepolia.blockscout.com/tx/0x9a150e4934f63566722ce02cf20d7d2857fa774e63236eb312e8bcac237c46b2) has a canonical successful receipt in block **53847244**, with **7,314 confirmations** at the snapshot. Exactly one event from the pinned DealzaOperator `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8` decodes as:

```text
OrderVoided(bytes32 indexed orderId, address indexed authorizedBy)
orderId:      0x808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97
authorizedBy: 0xF74aD341e10187073a0eef55356D136F1be5E3Cf
logIndex:     1
topic0:       0x38611036358ce27ce650e29ffd25013af2733a51658f229c61a0850a2ac17e2f
data:         0x
```

The cancellation is relayed: its type-2 outer transaction is relayer `0xb42f812a44c22cc6b861478900401ee759ebead6` → execution contract `0xdb9b1e94b5b69df7e401ddbede43491141047db3`. The genuine operator event and current state establish seller authorization; the outer sender alone does not. Duplicate stored and derived statuses are **Voided (5)**.

Original order **`0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f`** remains stored/derived **Pending (1)**. Its entire stored order matches the previously committed snapshot, including every immutable payment field, reviewer, description and payment hash. [Comparison](verification/buyer-approval/prior-snapshot-comparison.json). Its payment hash remains **`0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59`**. The complete terms table and participants above remain authoritative: amount 1,000,000, buyer `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`, original ID as salt, zero fees/fee receiver, same description, seller, reviewer, operator and token. Reservation cutoff is **2026-11-03 17:00 UTC / 18:00 WAT**, Unix **1793725200**; **32,420 seconds (9h 00m 20s)** remained. Authorization/refund expiry remains **2026-11-05 17:00 UTC**, Unix **1793898000**. Refresh before proceeding if delayed; do not reserve after cutoff.

For **both** exact payment hashes: collector pre-approval is false and CPP `paymentState` is **(false, 0, 0)**: no collected flag, capturable amount or refundable amount. A complete deployment-to-snapshot scan finds the two creations and duplicate cancellation, with no pre-approval, authorization, funding or capture events. Operator and predicted TokenStore each hold **0 USDC**.

Buyer balance is **0.0001 ETH** (100,000,000,000,000 wei) and **21 test USDC** (21,000,000 raw units). Confirmed/pending nonce is **0 / 0**, buyer code is **`0x`**, and existing collector allowance is **0**. USDC has 6 decimals, is unpaused, and neither buyer nor seller is blacklisted. The token matches [Circle's published Base Sepolia address](https://developers.circle.com/stablecoins/usdc-contract-addresses). Collector runtime hash still matches pinned verified executable source, and its `authCaptureEscrow` plus the operator's collector/escrow/token/chain bindings match the deployment. The existing explorer partial-verification qualification for the collector remains; this run does not claim a new full explorer verification.

### Exact unsigned approval and simulations

[The unsigned transaction](verification/checkout-continuation/next-manual-transaction.json) calls USDC `approve(0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea, 1000000)` with **zero native ETH value**, Base Sepolia chain ID **84532 / 0x14a34**. Calldata:

```text
0x095ea7b3000000000000000000000000f1f9c408c787b2bc6caeb91e5bbec434a5c8d2ea00000000000000000000000000000000000000000000000000000000000f4240
```

Direct `eth_call` returns true; gas estimate is **56,240**, at a sampled gas price of **6,000,000 wei** (337,440,000,000 wei execution cost). This excludes possible Base L1 data fees and is not a fixed gas/fee instruction; MetaMask must refresh total fees and verify affordability.

Two read-only `eth_simulateV1` sequences passed. Each simulates the approval followed by allowance, balances, complete orders, statuses and CPP/collector state reads. Both emit exactly one genuine USDC `Approval(owner=buyer, spender=collector, value=1000000)`, set allowance to exactly 1,000,000, preserve buyer/seller/TokenStore/operator token balances, preserve both complete orders and leave both financial states empty.

The first uses the buyer's actual empty-code account without overrides. The second hypothetically routes a single default-mode `execute(bytes32,bytes)` self-call through MetaMask v1.3.0's `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b` implementation, whose live runtime hash matches `0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2`. Only an ephemeral RPC code override is used; no onchain delegation, balance or storage is changed. This tests the buyer remaining the USDC approval owner under delegated execution. It does **not** establish a future MetaMask relayer envelope, signature validity, selected implementation, sponsorship or account-upgrade consent. [Viem simulation documentation](https://viem.sh/docs/actions/public/simulateBlocks), [MetaMask capability semantics](https://docs.metamask.io/metamask-connect/evm/reference/json-rpc-api/wallet_getCapabilities/). Current documentation was fetched through Context7; verified implementation source establishes the exact execute guard/encoding.

### Next single wallet action

Open the [Circle USDC contract's verified write interface](https://base-sepolia.blockscout.com/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e?tab=contract) and select the proxy write interface if needed. Connect **buyer `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`** on **Base Sepolia**. Select **`approve(address,uint256)`**, enter spender **`0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea`** and raw amount **`1000000`**. In MetaMask review the buyer, network, USDC token/destination **`0x036CbD53842c5426634e7929541eC2318f3dCF7e`**, spending cap **1 USDC**, zero ETH value, and current total gas fees. Close stale wallet-local confirmations first; public nonce equality cannot detect unsent requests.

Stop if MetaMask shows an unlimited cap, another spender/account/network/token, extra calls, or asks to upgrade/revoke/change delegation. The buyer currently has no delegation and none is authorized by this task. An outer destination change requires inspecting the decoded inner call; the hypothetical simulation is not blanket approval of arbitrary routing. The existing Dealza UI still applies a direct-envelope guard to approval, so a valid relayed approval could be misreported. Use this manual contract action and independently verify the resulting receipt plus USDC Approval event and allowance before any retry or later payment action. A successful upgrade-only receipt does not prove token approval.

After manual approval, stop and supply its hash for verification. Do not submit CPP pre-approval, reservation, delivery or release in this step. No creation, deployment, Solidity edit, persistent delegation modification, signing, broadcasting or GitHub push was performed by this work.

Reproduce with `node web/scripts/verify-live-checkout.mjs --cancellation-hash=0x9a150e4934f63566722ce02cf20d7d2857fa774e63236eb312e8bcac237c46b2`, followed by `node web/scripts/verify-buyer-approval.mjs`. These scripts use public reads and simulations only. The second requires a recent checkout snapshot and records the full receipt, exact event and simulation requests/results.

Validation for this update: fresh two-RPC checkout verification PASS, direct and hypothetical delegated approval/post-state simulations PASS, original stored-order comparison PASS, and frontend regression suite **121/121 passed** ([log](verification/buyer-approval/web-tests.txt)). No production application or Solidity code changed. Work is preserved in a focused local Git commit; pre-existing unrelated changes remain outside that commit.
