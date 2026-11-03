# Transaction 5 verified; Transaction 6 prepared

**GO for Transaction 6 only: buyer manually authorizes release of exactly 1 test USDC to the original seller, with zero platform fee.** This report does not record settlement. No signing, broadcasting, onchain deployment, delegation changes, Solidity edits, or GitHub push was performed.

Snapshot: Base Sepolia **53884288**, `0xb5686b247ffbdabbf1fae83d02b34a4d4f5731a3e0fd41786aeeac12c4a9e575`, **2026-11-03T09:38:46.000Z**. Final independent two-RPC refresh: **53884396**, `0xffeaa959a1e2033afb28fbc8b5ed46854db51ddc78e32487bd204773b3939afc`, **2026-11-03T09:39:08.000Z**. Direct and current delegated calls passed on both RPCs at the refresh. [Complete evidence](verification/first-live-payment/delivery-release/evidence.json).

## Transaction 5

Hash: `0xacfb28da439caa95bc7d40172d01d83b20f9da64c182d4dcb073a5c3cbaad786`.

PublicNode (`https://base-sepolia-rpc.publicnode.com`) and official Base RPC (`https://sepolia.base.org`) independently returned matching complete successful receipts at block **53879876**, block hash `0xa55bb9d20e9ab48f1db7cebcc9a3af27a2363439ad554dcb8a91169685a607d1`, mined **2026-11-03T09:24:04.000Z**. There were **4413 confirmations** at the initial snapshot. The transaction is included in the canonical block checked on both sources.

Exact verified event:

```text
emitter: 0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8
event: DeliveryNoted(bytes32 indexed orderId,bytes32 evidenceHash)
logIndex: 2
topic0: 0xac0281fce3112628b3984e944b1c730e898fcebf2980d437e9da8dd66f80c106
orderId: 0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f
evidenceHash: 0xe81e15ba659740bcf8626122f97a3abec2c73ea4833c149f2ff47bc5210dbe82
```

Rehashing the exact saved UTF-8 acknowledgment bytes (without trailing newline) matches the mined event. The statement names the original order and reservation transaction, explicitly states this is a controlled test, asserts no physical delivery, and does not authorize payment release. The actual delegation-manager envelope was decoded: one default-mode execution, exact operator target, zero ETH, and exact prepared `noteDelivery` calldata. Outer transaction sender is a relayer; the genuine event plus the verified operator access check establish the effective seller caller.

The generated ABI matches the compiled artifact in full. Executable runtime hashes for operator, CPP escrow and collector match their pinned verified artifacts on both RPCs. The delegation manager matches its saved explorer-verified runtime. The original stored PaymentInfo is unchanged from the prior reservation evidence; its CPP hash is recomputed independently and confirmed through `getHash` on both RPCs.

**Delivery state is event-only.** `noteDelivery` writes no delivery flag or evidence hash to Order. Complete order storage is unchanged. The authoritative acknowledgment record is this genuine operator event, not an invented stored field.

## Financial state

Historical state at block 53879875, post-state at 53879876, snapshot state, and final refreshed state were independently checked on both RPCs. Historical snapshots and refresh states are retained in evidence.

| Check                                    | Verified result                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Buyer                                    | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`                                                                                |
| Buyer test USDC                          | **20**, raw 20000000                                                                                                        |
| Seller                                   | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`                                                                                |
| Seller test USDC                         | **0**                                                                                                                       |
| CPP operator TokenStore                  | `0x57EC2910410C3Ef888c6127A3684d04171D5a11a`; **1 USDC**, raw 1000000                                                       |
| Operator / escrow / collector USDC       | **0 / 0 / 0**                                                                                                               |
| Buyer collector allowance                | **0**                                                                                                                       |
| Original order stored and derived status | **Reserved (2)**                                                                                                            |
| Original CPP state                       | `(true,1000000,0)`                                                                                                          |
| Original exact-hash pre-approval         | true                                                                                                                        |
| Duplicate order                          | `0x808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97`; **Voided (5)**, CPP `(false,0,0)`, pre-approval false |
| Buyer ETH                                | **0.0001 ETH**, raw 100000000000000 wei                                                                                     |
| Buyer latest / pending nonce             | **1 / 1** at preparation; refresh in MetaMask                                                                               |
| Authorization expiry                     | **November 5, 2026, 17:00 UTC / 18:00 WAT**, Unix 1793898000                                                                |
| Initial chain time                       | 2026-11-03T09:38:46.000Z; 199274 seconds until authorization expiry                                                         |

The relevant USDC Transfer/Approval history and operator/escrow lifecycle logs were scanned from block 53876674 through 53884288. The only order event was this DeliveryNoted. There were **no participant USDC movements/approvals and no CPP payment events**, including capture, refund, void or reclaim. No financial state was unexpected. Final refresh reconfirmed all balances, order terms and payment state.

## Transaction 6

[Exact unsigned JSON, approved PaymentInfo, route calldata and fee estimates](verification/first-live-payment/delivery-release/transaction-6-unsigned.json).

```json
{
  "chainId": "0x14a34",
  "from": "0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25",
  "to": "0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8",
  "value": "0x0",
  "data": "0x67d42a8b610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f"
}
```

- Chain: **Base Sepolia 84532**, hex **0x14a34**.
- Function: **release(bytes32)**, selector **0x67d42a8b**.
- Buyer: `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`. The deployed function requires `msg.sender == stored payment.payer` and stored status Reserved.
- Original payment hash: `0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59`.
- Receiver: `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`. Token: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
- Amount: **1000000 raw / exactly 1 test USDC**. Platform fee: **0**; fee receiver zero address.
- ETH value: **0**. The function reads the exact original stored PaymentInfo and calls CPP `capture(payment,1000000,0,address(0))`; it accepts no replacement tuple or receiver.
- Estimated gas: **153882 direct**, **161680 current delegated self-execution**. These are estimates, not prescribed gas limits.
- Observed gas price: **6000000 wei**. Execution-only cost: **923292000000 wei direct**, **970080000000 wei routed**.
- Latest-state estimated total cost including L1 data, L2 execution and operator fees: **1399806237831 wei direct**, **1576319997423 wei routed**. Buyer ETH covers both. Actual MetaMask routing and current fees must be reviewed again.

Two sequential `eth_simulateV1` runs used current state without balance, code, storage or block overrides: direct buyer → operator, and buyer → current EIP-7702 delegated self-execution → operator. Both verified the full expected post-state, matching events and duplicate rejection:

| Effect                                              | Simulated result only                       |
| --------------------------------------------------- | ------------------------------------------- |
| Buyer USDC                                          | 20 → **20**                                 |
| Seller USDC                                         | 0 → **1**                                   |
| TokenStore USDC                                     | 1 → **0**                                   |
| Operator / escrow / collector USDC                  | remain 0                                    |
| Original stored / derived status                    | Reserved → **Released (4)**                 |
| Original CPP state                                  | `(true,1000000,0)` → **`(true,0,1000000)`** |
| Duplicate order and payment state                   | unchanged, Voided                           |
| Allowance / exact pre-approval                      | unchanged, 0 / true                         |
| Second buyer release in the same simulated sequence | **InvalidState()**, no events               |

CPP's `refundableAmount` becomes 1000000 after capture; that is protocol accounting for the captured payment, **not USDC still in custody**. Dealza has no refund entry point. This matches the [pinned official CPP v1.1.0 capture source](https://github.com/base/commerce-payments/blob/v1.1.0/src/AuthCaptureEscrow.sol).

Expected event sequence is **PaymentCaptured → TokenStoreCreated → Transfer → OrderReleased**. CPP's verified `_sendTokens` lazily creates the deterministic TokenStore clone when it has no code. Its exact operator/address event is asserted; the existing 1 USDC at that address transfers to the seller. This is an internal effect of the proposed release, simulated only here. No deployment transaction was sent.

Current buyer account code is `0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b`; implementation runtime hash is `0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2`. The unsigned JSON includes its exact `execute(bytes32,bytes)` self-execution: mode zero and packed operator / zero ETH / exact release calldata. No new delegation is required. A future delegation-manager/relayer envelope is not the same tested self-execution route; inspect its actual single inner execution before approving it.

## Exact next manual MetaMask action

1. Use buyer **0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25** on **Base Sepolia (84532)**. Open the [operator contract write interface](https://base-sepolia.blockscout.com/address/0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8?tab=contract), select **release**, and enter only original order ID `0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f`. Alternatively use the exact direct calldata JSON. Set **0 ETH**.
2. Submit **one** release request to MetaMask. Verify the effective buyer, operator target, `release(bytes32)` selector, exact order ID and zero ETH. Verify release is exactly **1 test USDC** to seller **0xF74aD341e10187073a0eef55356D136F1be5E3Cf**, with **zero platform fee**. Review refreshed gas and the wallet's total fee; use the current nonce. The transaction must mine **before November 5 at 17:00 UTC**. The earlier pre-approval expiry does not prevent capture of the already reserved authorization.
3. If using current delegated routing, match the JSON's self-execution or decode the actual wallet envelope to its single inner **operator / 0 ETH / exact release calldata**. If an envelope cannot be checked, contains extra calls, changes amount/order/recipient, requests token approvals or a new delegation, **stop**. Do not submit both routes.
4. Manually confirm that single matching Transaction 6 and retain its transaction hash. Stop after submission. A receipt alone, especially an outer relayer receipt, is insufficient: independently verify genuine PaymentCaptured and OrderReleased plus the exact TokenStore → seller USDC transfer and post-state before reporting settlement. Do not retry solely because the UI lags.

## Validation and preservation

Reproduce read-only verification: `node web/scripts/verify-delivery-and-release.mjs`. Its failure path removes the unsigned Transaction 6 artifact and writes NO-GO evidence. Unexpected financial state stops preparation before release simulations.

- `forge test`: **46 passed**, including buyer release exactly once, seller access denial, expiry, capture events and conservation. [Output](verification/first-live-payment/delivery-release/contract-tests.txt).
- `npm test`: **121 passed**. [Output](verification/first-live-payment/delivery-release/web-tests.txt).
- `npm run build`: **passed**, including ABI provenance, TypeScript and production Vite build. [Output](verification/first-live-payment/delivery-release/production-build.txt).
- [Verifier output](verification/first-live-payment/delivery-release/read-only-check.txt), full RPC evidence and unsigned JSON retained together.

Only this verifier, report and generated public evidence/check outputs are included in the focused local commit. Pre-existing unrelated changes remain outside it. No private keys, credentials or environment files are included.
