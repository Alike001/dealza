# Duplicate verification and first-payment continuation

**Read-only preflight PASS. Duplicate cancellation is simulated and ready for the seller's manual confirmation; it has not been submitted or confirmed. Buyer approval and reservation remain gated on resolving the duplicate.**

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
