# Checkpoint 4 — first controlled live payment

**GO for Transaction 5 only. Transaction 4's real 1 test-USDC reservation and both seller-rejection checks PASS. Delivery and buyer release remain unsubmitted.**

This is Base Sepolia only, chain **84532** (`0x14a34`). The full buyer-controlled payment lifecycle is still incomplete: the seller has received **zero USDC**. This report establishes reservation and prepares an informational controlled test acknowledgment; it does not establish physical delivery or public-demo readiness.

## Verified reservation

[Machine-readable receipt, decoded events, historical balances, independent RPC reads and simulations](verification/first-live-payment/reservation/evidence.json), reproduced by `node web/scripts/verify-reservation-and-delivery.mjs`. The script has no signer or broadcast methods and uses no state/code/balance overrides. If verification fails it records NO-GO and removes its unsigned Transaction 5 file.

- Transaction 4: [`0xd59acd2377d61f58f4dbe3d483f0dc75613d145f0484f8f665b0c8279a0c0e08`](https://sepolia.basescan.org/tx/0xd59acd2377d61f58f4dbe3d483f0dc75613d145f0484f8f665b0c8279a0c0e08), also on [Blockscout](https://base-sepolia.blockscout.com/tx/0xd59acd2377d61f58f4dbe3d483f0dc75613d145f0484f8f665b0c8279a0c0e08).
- Receipt: successful EIP-1559, canonical **block 53871777**, hash `0x9a22f58738bfa6dd7293129aa41de01f808e185dac18cf104a0fa3148b11bea4`, **2026-11-03 08:57:04 UTC**.
- Readback: **block 53876673**, hash `0x32e35b5675080a0b2efc1b7d97cff983e9014dc7f981431973c4407dd4f21c9c`, **2026-11-03T09:13:23.000Z**. PublicNode and the official Base RPC agree on the receipt/logs, pre-reservation, post-reservation and readback states.
- Outer sender: relayer `0xb01caea8c6c47bbf4f4b4c5080ca642043359c2e`; outer target: DelegationManager `0xdb9b1e94b5b69df7e401ddbede43491141047db3`; native value **0**. These are not the buyer/operator addresses.
- Decoded `redeemDelegations` has one default-mode execution: exact approved `fund(orderId, PaymentInfo)` calldata, target operator, value zero. `RedeemedDelegation` identifies the actual buyer as root delegator. Manager ABI and exact on-chain runtime match are saved in [verified source response](verification/first-live-payment/reservation/delegation-manager-verified.json).
- Operator: [`0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`](https://sepolia.basescan.org/address/0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8). Operator, pinned CPP v1.1.0 and collector runtime hashes and bindings pass. ABI provenance matches the pinned Solidity inputs; no Solidity or deployment identity changed.
- Original order: `0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f`.
- Approved and authorized CPP hash: `0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59`. Local chain/escrow/struct hash reconstruction and both RPC `getHash` results agree. Every PaymentInfo field matches the reviewed buyer preapproval; stored nonpayment terms also match.

Exact receipt events, in order:

| Log index | Contract                                                          | Event and verified meaning                                                                |
| --------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 0         | LimitedCallsEnforcer `0x04658b29f6b82ed55274221a06fc97d318e25416` | `IncreasedCount`: manager, relayer, limit 1, count 1; existing delegation use             |
| 1         | CPP `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c`                  | `PaymentAuthorized`: exact hash and complete PaymentInfo, 1000000 units, pinned collector |
| 2         | USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`                 | `Transfer`: buyer → operator's CPP TokenStore, 1000000 units                              |
| 3         | DealzaOperator                                                    | `OrderFunded`: exact original order and payment hash                                      |
| 4         | DelegationManager                                                 | `RedeemedDelegation`: root delegator buyer, redeemer outer relayer                        |

There is no capture, seller transfer, fee transfer, token approval, new account authorization list, or extra inner payment in this receipt. The enforcer declaration comes from [MetaMask v1.3.0 source](https://github.com/MetaMask/delegation-framework/blob/v1.3.0/src/enforcers/LimitedCallsEnforcer.sol), saved [locally](verification/first-live-payment/reservation/LimitedCallsEnforcer.v1.3.0.sol.txt). Successful outer receipt alone was not used as proof of payment.

## Actual balances and authorization

Historical reads compare blocks **53871776** and **53871777**; current reads use the snapshot above. The receipt's single transfer attributes the debit to Transaction 4. The complete USDC Transfer/Approval scan involving buyer, seller, TokenStore or operator since the reviewed pre-reservation snapshot (block 53868481) finds only this transfer.

| Item                              | Before reservation | After reservation and current readback |
| --------------------------------- | -----------------: | -------------------------------------: |
| Buyer USDC                        |                 21 |                                 **20** |
| Seller USDC                       |                  0 |                                  **0** |
| CPP TokenStore USDC               |                  0 |                                  **1** |
| Operator USDC                     |                  0 |                                  **0** |
| Collector / escrow singleton USDC |              0 / 0 |                              **0 / 0** |
| Buyer allowance to collector      |      1000000 units |                                  **0** |
| Original stored / derived status  |  Pending / Pending |            **Reserved / Reserved (2)** |
| CPP state                         |      `(false,0,0)` |                 **`(true,1000000,0)`** |
| Exact-hash collector preapproval  |               true |                               **true** |

TokenStore: [`0x57EC2910410C3Ef888c6127A3684d04171D5a11a`](https://sepolia.basescan.org/address/0x57EC2910410C3Ef888c6127A3684d04171D5a11a). CPP `getTokenStore(operator)` agrees with the reviewed destination; actual ERC-20 balance and this payment's capturable accounting both equal 1 USDC.

Preapproval remaining true is expected in pinned CPP v1.1.0: the collector does not reset it; CPP's `hasCollectedPayment` prevents re-collection. Allowance is exhausted. Duplicate order `0x808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97` remains **Voided (5)**, unchanged terms, CPP `(false,0,0)`, preapproval false.

| Account | Address                                      |                              Current test ETH | Confirmed / pending nonce |
| ------- | -------------------------------------------- | --------------------------------------------: | ------------------------- |
| Buyer   | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25` |              **0.0001** (100000000000000 wei) | 1 / 1                     |
| Seller  | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf` | **0.000049812291697244** (49812291697244 wei) | 4 / 4                     |

Buyer ETH did not decrease during the relayed reservation. Both accounts retain the reviewed delegation marker to `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b`; code did not change during reservation. Neither has a pending transaction at readback.

Funding/preapproval cutoff: **November 3, 2026 at 17:00 UTC / 18:00 WAT**, Unix 1793725200; reservation occurred before cutoff. Authorization and refund expiry: **November 5, 2026 at 17:00 UTC / 18:00 WAT**, Unix 1793898000; authorization is active at readback. Do not extend these dates implicitly; delivery and release must be rechecked against current chain time. Dispute does not pause expiry.

## Buyer-protection demonstration

Read-only `eth_simulateV1` at the readback block, actual seller sender, exact live payment, no overrides:

1. Seller calls operator `release(originalOrderId)` → **`Unauthorized()`**.
2. Seller calls CPP `capture(PaymentInfo,1000000,0,address(0))` → **`InvalidSender(0xF74aD341e10187073a0eef55356D136F1be5E3Cf,0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8)`**.

Both failed for access control, not missing funds, wrong terms or expiry; neither emitted logs. No intentionally failing transaction was broadcast. These two rejections also pass sequentially **after** the simulated delivery acknowledgment, proving evidence grants no capture permission. Buyer-controlled release is still pending; reviewer resolution remains part of the accepted dispute model.

## Transaction 5 — unsigned and manual only

The existing function is **`noteDelivery(bytes32,bytes32)`**. Its reviewed implementation validates seller identity and an active order, then emits only `DeliveryNoted`; it has no token/CPP call or order mutation.

[Unsigned manual transaction with precise calldata, sender, chain and estimates](verification/first-live-payment/reservation/transaction-5-unsigned.json).

- Sender: seller `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`.
- Target: operator `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`.
- Chain: **84532 / `0x14a34`**. Native value: **0**.
- Order: `0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f`.
- Evidence hash: `0xe81e15ba659740bcf8626122f97a3abec2c73ea4833c149f2ff47bc5210dbe82`.
- Exact calldata: `0x685839b8610384701397935f144496cca9496417e029c7d9089f019993da4373a618769fe81e15ba659740bcf8626122f97a3abec2c73ea4833c149f2ff47bc5210dbe82`.
- Direct execution gas estimate: **31273**; delegated seller self-execution: **36617**. At 6000000 wei/gas, direct execution estimate is 187638000000 wei. Seller has sufficient ETH for these estimates. Refresh MetaMask's total fee including Base L1 data fee; these are not fixed gas limits or prescribed nonces.

The hash is Keccak-256 of the exact UTF-8 bytes in [controlled-test-acknowledgment.txt](verification/first-live-payment/reservation/controlled-test-acknowledgment.txt), **without a trailing newline**:

> Dealza controlled test delivery acknowledgment; Base Sepolia chain 84532; order 0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f; reservation 0xd59acd2377d61f58f4dbe3d483f0dc75613d145f0484f8f665b0c8279a0c0e08; no physical delivery asserted; no payment release authorized.

This is a **controlled test delivery acknowledgment**, not evidence of actual physical delivery. The previously prepared delivery text/hash and original unreached deadline proposal are superseded by the live terms and this explicitly labeled acknowledgment.

Direct `eth_call` passes on both RPCs. Sequential simulation of the direct call and actual seller's existing delegated self-execution each emits exactly one `DeliveryNoted` and leaves all six USDC balances, allowance, full original/duplicate orders, derived statuses, CPP accounting and preapproval unchanged. Subsequent seller capture attempts still revert correctly. No state/code/balance override was used; persistent public state is unchanged after simulations. Unknown future wallet relayer envelopes are not prevalidated; they must contain only this exact execution, with no additional approval, transfer or account upgrade.

**Single next manual MetaMask action:** select the seller on Base Sepolia and submit only the `transaction` object in the unsigned file: operator `noteDelivery` with the supplied order and evidence hash, zero ETH value. After mining, provide its hash for receipt/event and unchanged-escrow verification. Buyer release is a separate future manual step and is not approved by this GO.

## Live transaction record

| Step                                     | Real hash / explorer                                                                                                    | Evidence scope                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Original order creation                  | [0x26498aaa…9749e6](https://sepolia.basescan.org/tx/0x26498aaab70c0e6fef9009b046584cf8abf5873760ba3381f336c89aed9749e6) | Previously verified in checkout-continuation evidence; live stored terms rechecked here |
| Duplicate order creation                 | [0x0a041cd4…f0b06b](https://sepolia.basescan.org/tx/0x0a041cd43fd4931414cdcc4672a5621741e53fd46d20b5d0fe576439c7f0b06b) | Historical duplicate, not the funded order                                              |
| Duplicate cancellation                   | [0x9a150e49…c46b2](https://sepolia.basescan.org/tx/0x9a150e4934f63566722ce02cf20d7d2857fa774e63236eb312e8bcac237c46b2)  | Current Voided state rechecked here                                                     |
| Transaction 2: buyer allowance           | [0x3095767b…c782e](https://sepolia.basescan.org/tx/0x3095767bde9c695c83daf53c7fc78965559d69496ee2435612b1a873b84c782e)  | Previous verification; now allowance 0                                                  |
| Transaction 3: exact-hash preapproval    | [0x78cd5930…ba70](https://sepolia.basescan.org/tx/0x78cd5930a57b51edccb09a54c6c8e6edd8e85c6c78cfef7549bb9d280a26ba70)   | Canonical corrected hash from prior evidence; current preapproval true                  |
| Transaction 4: buyer reservation         | [0xd59acd23…c0e08](https://sepolia.basescan.org/tx/0xd59acd2377d61f58f4dbe3d483f0dc75613d145f0484f8f665b0c8279a0c0e08)  | Verified real receipt, exact events, 1 USDC escrow                                      |
| Transaction 5: controlled acknowledgment | Unsubmitted                                                                                                             | Unsigned; simulations PASS                                                              |
| Transaction 6: buyer release             | Unsubmitted                                                                                                             | No real seller payment or completed lifecycle claimed                                   |

## Validation and remaining work

- Local contract suite: **46 passed**, zero failed/skipped; includes seller denial after evidence, exact custody, buyer release and lifecycle invariants. [Log](verification/first-live-payment/reservation/contract-tests.txt).
- Frontend suite: **121 passed**. [Log](verification/first-live-payment/reservation/web-tests.txt).
- Contract source / ABI provenance: **PASS**. [Log](verification/first-live-payment/reservation/abi-check.txt).
- Unsigned artifact consistency: **PASS**. Exact acknowledgment bytes/hash, decoded calldata, sender, target, chain, zero value and simulation gates agree. [Log](verification/first-live-payment/reservation/unsigned-artifact-check.txt).
- New verifier syntax: `node --check web/scripts/verify-reservation-and-delivery.mjs` PASS. Live read-only assertions and simulations: **PASS**. [Log](verification/first-live-payment/reservation/read-only-check.txt).

No signing, broadcasting, deployment, new payment, Solidity change or GitHub push was performed. This is a focused local evidence checkpoint. Existing unrelated work remains outside its commit. The full public demonstration still requires actual acknowledgment and buyer release verification, recovery/dispute paths, real-wallet UX, checkout discovery/refresh, hosting and final submission evidence. Existing local full-lifecycle rehearsals are simulation evidence only and do not establish live seller receipt.
