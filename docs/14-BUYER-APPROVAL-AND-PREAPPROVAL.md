# Transaction 2 verified; Transaction 3 prepared

**GO for Transaction 3 only — manual collector pre-approval of the original order.** No signature or broadcast was performed. No funds were reserved, no contract deployed or Solidity modified, and nothing pushed to GitHub.

Verified Base Sepolia block **53863939**, hash `0xbe635371a216d5f076ce89cb2b44c3bdf5d2a6368869d67cea27dc2e81ef8411`, **2026-11-03T08:30:56.000Z**. Two independent public RPCs agree on the canonical block, Transaction 2 receipt/logs, both complete stored orders, CPP/pre-approval states, allowance and buyer ETH/USDC. [Full evidence](verification/buyer-preapproval/evidence.json); [unsigned transaction and exact arguments](verification/buyer-preapproval/next-manual-transaction.json).

Transaction 2 [`0x3095767bde9c695c83daf53c7fc78965559d69496ee2435612b1a873b84c782e`](https://base-sepolia.blockscout.com/tx/0x3095767bde9c695c83daf53c7fc78965559d69496ee2435612b1a873b84c782e) has a successful canonical receipt at block **53861912**, hash `0x618357c7ebb1584750f692550d7b8bc9cddd50cb1af0b6f7b50d8ea781ca6576`, with **2028 confirmations** at this snapshot. Exactly one genuine USDC `Approval` at log index **3** has owner `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`, spender `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea`, value **1,000,000**. There were no USDC Transfer events in its receipt. Current direct `allowance(buyer,collector)` is exactly **1,000,000 raw units = 1 test USDC**.

Buyer holds **21 test USDC (21,000,000 raw units)** and **0.0001 ETH (100,000,000,000,000 wei)**. Seller, operator and predicted TokenStore `0x57EC2910410C3Ef888c6127A3684d04171D5a11a` each hold **0 USDC**. Buyer confirmed/pending nonce is **1 / 1**. Public nonce equality cannot detect an unsent MetaMask-local confirmation.

Original order `0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f` remains stored/derived **Pending (1)**, unchanged field for field from the previous checkout snapshot. Its CPP payment hash remains `0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59`. Reservation deadline is **November 3, 2026, 17:00 UTC / 18:00 WAT**, Unix **1793725200**, with **30544 seconds** left at the snapshot. Authorization/refund expiry remains November 5, 2026, 17:00 UTC, Unix 1793898000. Refresh before submission if delayed; pre-approval reverts at or after its reservation deadline.

Duplicate `0x808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97` remains stored/derived **Voided (5)**. Both exact payment hashes have `isPreApproved == false` and CPP `paymentState == (false,0,0)`. A complete scan from deployment block 53676176 through 53863939 finds only the two creations and duplicate cancellation: no pre-approval, authorization, funding or capture events. No unexpected reservation or pre-approval has occurred for either order.

## Actual ABI, target and exact arguments

The actual [DealzaOperator source](../contracts/src/DealzaOperator.sol) and generated ABI contain **no buyer pre-approval entry point**. Its `fund` documentation explicitly requires prior `COLLECTOR.preApprove(payment)`. The [collector source](../contracts/vendor/commerce-payments/src/collectors/PreApprovalPaymentCollector.sol) supplies the actual function. The generated collector function ABI matches its compiled artifact, and `npm run abi:check` passes source/ABI provenance. Current operator/CPP/collector runtime hashes and dependency bindings match pinned deployment evidence. The collector's existing partial explorer-verification qualification still applies; no new full explorer verification is claimed.

Exact canonical signature:

```text
preApprove((address,address,address,address,uint120,uint48,uint48,uint48,uint16,uint16,address,uint256))
```

The single argument is the complete `paymentInfo` tuple read from the original order, in this exact order:

| Field                 | Value                                                                           |
| --------------------- | ------------------------------------------------------------------------------- |
| `operator`            | `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`                                    |
| `payer`               | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`                                    |
| `receiver`            | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`                                    |
| `token`               | `0x036CbD53842c5426634e7929541eC2318f3dCF7e`                                    |
| `maxAmount`           | `1000000`                                                                       |
| `preApprovalExpiry`   | `1793725200`                                                                    |
| `authorizationExpiry` | `1793898000`                                                                    |
| `refundExpiry`        | `1793898000`                                                                    |
| `minFeeBps`           | `0`                                                                             |
| `maxFeeBps`           | `0`                                                                             |
| `feeReceiver`         | `0x0000000000000000000000000000000000000000`                                    |
| `salt`                | `43880560905866266055948392929988289598113490721418948285209098488899572364959` |

Target **CPP collector `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea`**. Sender **buyer `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`**. Network **Base Sepolia, chain ID 84532 / 0x14a34**. Native ETH value **0**. Selector **0xc6184c2f**. Full ABI-encoded calldata and the named tuple are in the [prepared transaction](verification/buyer-preapproval/next-manual-transaction.json).

`simulateContract` succeeds against the pinned current block; estimated direct gas is **56899**. Estimated delegated buyer self-execution gas is **62326**. Sample gas price is **6000000 wei**, giving direct execution cost **341394000000 wei**, below the buyer ETH balance. These are estimates, not fixed fee/limit instructions; MetaMask must refresh total gas including Base L1 data fees and any actual routing overhead. Simulation uses `eth_call` without signing or persisting state, per [Viem documentation](https://viem.sh/docs/contract/simulateContract).

## EIP-7702 routing and outcome proof

Transaction 2 is a type-4 EIP-7702 transaction. Outer sender `0xb42f812a44c22cc6b861478900401ee759ebead6` and outer destination `0xdb9b1e94b5b69df7e401ddbede43491141047db3` are the relayer/execution contracts, so requiring the outer sender to equal the buyer would incorrectly reject this successful approval. Receipt logs and direct allowance establish its actual token result. The receipt includes an authorization for MetaMask implementation `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b`; the buyer's actual current account code is `0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b`. This supersedes report 13's historical empty-code account observation.

The implementation runtime still matches pinned hash `0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2`. Its previously retained verified source defines `execute(bytes32,bytes)` and single/default execution encoding. Two `eth_simulateV1` sequences pass using the actual current chain state, **without code, storage or balance overrides**: direct buyer → collector, and buyer self-call → current delegated implementation → collector. Each emits exactly one genuine collector `PaymentPreApproved(0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59)`, sets that hash's `isPreApproved` true, preserves the duplicate's false pre-approval, preserves both complete orders/statuses, keeps CPP `(false,0,0)`, and preserves buyer/seller/operator/TokenStore USDC and exact 1,000,000 allowance. Full requests, responses, decoded events and post-state assertions are retained in the evidence.

This does not validate an unknown future MetaMask relayer envelope, signature, extra calls or delegation change. Review the inner collector call and exact tuple if MetaMask routes it. After manual confirmation, require the canonical successful receipt, a log emitted by the exact collector with the exact payment hash, and `isPreApproved(hash) == true`; independently reread unchanged Pending order, empty CPP financial state, balances and allowance. An outer successful receipt or upgrade-only event is insufficient. The existing frontend direct-envelope guard can misreport relayed payment actions; do not retry based only on that UI error.

## Next single manual MetaMask action

Connect the named buyer on Base Sepolia to the [collector contract write interface](https://base-sepolia.blockscout.com/address/0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea?tab=contract). Submit **one `preApprove(paymentInfo)` call** with the exact tuple above and **0 ETH**, before **17:00 UTC November 3, 2026**. Use the prepared JSON as the exact calldata/argument reference. Review refreshed fees and any decoded inner routing. Then stop and provide the resulting hash for independent outcome verification. This prepares no `fund` call and authorizes no reservation.

Reproduce: `node web/scripts/verify-buyer-preapproval.mjs`. Validation: ABI provenance PASS; two-RPC receipt/state crosscheck PASS; complete event scan PASS; direct and actual delegated post-state simulations PASS. No application or Solidity behavior changed.
