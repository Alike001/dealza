# Verification Audit: real UI Gate 3 and Gate 4 readiness

## Verdict

**Gate 3 PASS. GO for manual Gate 4 reservation of exactly 1 test USDC through the existing Dealza checkout.** This audit did not sign, broadcast, reserve funds, create orders, change Solidity/application behavior, deploy, publish or push to GitHub.

The authorization transaction is [0x3bdd6c65eea5c193abc0dce78b0a92314d459f9cfb38615469977977652ee62c](https://sepolia.basescan.org/tx/0x3bdd6c65eea5c193abc0dce78b0a92314d459f9cfb38615469977977652ee62c), canonically successful at block **53987356**. Official Base RPC and PublicNode independently agree on receipt, transaction, canonical snapshot, exact order and balances. The latest block/hash/UTC and raw responses are in [evidence.json](verification/real-ui-gate3/evidence.json).

## Artifacts checked

Pinned generated and compiled collector ABI; operator, collector and CPP runtime hashes and bindings; retained verified delegation-manager and MetaMask implementation; fresh Gate 1 creation evidence; actual frontend chainGateway/receiptProof; current public RPC state; direct and delegated post-state simulations.

## Requirement traceability and acceptance coverage

- Exact pinned collector **0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea** emits **PaymentPreApproved(bytes32 indexed paymentInfoHash)** for **0x146b39003d621a9f7dbfc083bb8ce77c6ddb00022a5a384681114cc6cefcf1e6**. Stored payment hash, CPP `getHash(PaymentInfo)`, independent local typed/domain hash and event agree.
- Fresh order **0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd** is stored/derived **Pending (1)** with unchanged complete PaymentInfo and `isPreApproved == true`. CPP state is **(false,0,0)**: uncollected, zero capturable and zero refundable.
- Buyer has **20 USDC (20000000 raw)** and **0.0001 ETH (100000000000000 wei)**. Exact allowance to the collector is **1000000 raw**, equal to **1 USDC**. Confirmed/pending buyer nonce is **1/1**. This cannot detect an unsent private wallet confirmation.
- Authorization receipt contains no USDC Transfer. Before/after authorization balances and terms match. Buyer/seller/operator/TokenStore balances also match the fresh creation snapshot. Complete bounded indexed history from creation through the checked snapshot contains only this order's creation and exact preapproval: no authorization/funding/capture/release. Seller's existing **1 USDC** came from the earlier completed order.
- Reservation cutoff is **November 4, 2026, 11:00 UTC / 12:00 WAT**, Unix **1793790000**; still open at the snapshot. Authorization/refund expiry is **November 6, 2026, 11:00 UTC**, Unix **1793962800**. Contract rejects funding at or after the reservation cutoff.
- Exact `fund(id,stored PaymentInfo)` succeeds by `simulateContract` and ephemeral `eth_simulateV1`. Both direct buyer call and actual delegated buyer self-execution pass **without code, storage, balance or preapproval overrides**. Simulation does not persist state ([Viem documentation](https://viem.sh/docs/contract/simulateContract)).

Expected reservation effects, verified by decoded genuine events and sequential post-state reads:

| Value                                     | Before      | After simulation |
| ----------------------------------------- | ----------- | ---------------- |
| Buyer USDC                                | 20          | 19               |
| CPP operator TokenStore USDC              | 0           | 1                |
| Seller USDC                               | 1           | 1                |
| Operator / collector / CPP singleton USDC | 0 / 0 / 0   | 0 / 0 / 0        |
| Buyer → collector allowance               | 1           | 0                |
| Order status                              | Pending (1) | Reserved (2)     |
| CPP paymentState                          | false, 0, 0 | true, 1000000, 0 |

Custody is **CPP's operator-specific TokenStore 0x57EC2910410C3Ef888c6127A3684d04171D5a11a**, not the seller or DealzaOperator. Simulations emit exact `Transfer(buyer,TokenStore,1000000)`, CPP `PaymentAuthorized` with matching PaymentInfo/amount/collector, and operator `OrderFunded` with matching ID/hash. No capture or release occurs.

## Frontend and EIP-7702

Actual Gate 3 outer transaction is **type 2 / EIP-1559**, sent by a relayer to manager **0xdb9b1e94b5b69df7e401ddbede43491141047db3**. This is compatible with an already-delegated EIP-7702 buyer; a new type-4 transaction is unnecessary. Manager runtime and decoded single zero-value `redeemDelegations` inner call must match the exact collector `preApprove` and stored tuple.

Buyer account code still delegates to **0x63c0c19a282a1b52b07dd5a65b58948a07dae32b** with reviewed runtime hash. Direct and actual delegated self-execution both preserve the buyer as effective payer. Unknown future relayer signatures/envelopes and wallet-local prompts cannot be verified in advance.

The actual frontend gateway accepted the real routed Gate 3 receipt in an isolated **read-only** replay, emitted confirmed and cleared its saved replay intent. The same production gateway prepared the exact Gate 4 `fund` request; an isolated **reject-only provider** captured `eth_sendTransaction`, verified sender/target/calldata/zero value, rejected locally, and cleared its capture intent. No request was forwarded to MetaMask or a send RPC. User's private browser state was not accessed. [Receipt replay](verification/real-ui-gate3/frontend-preapproval-replay.json), [fund capture](verification/real-ui-gate3/frontend-fund-capture.json).

## Exact manual MetaMask details

| Field                   | Required value                                                         |
| ----------------------- | ---------------------------------------------------------------------- |
| Network                 | Base Sepolia, chain **84532 / 0x14a34**                                |
| Buyer / effective payer | **0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25**                         |
| Effective destination   | **0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8**                         |
| Method                  | **fund(bytes32,PaymentInfo)**; selector **0xb5d6529c**                 |
| Order                   | **0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd** |
| Token                   | test USDC **0x036CbD53842c5426634e7929541eC2318f3dCF7e**               |
| Amount                  | **1 USDC / 1000000 raw**, protocol fee **0**                           |
| Native ETH value        | **0**, gas separate                                                    |

Use **3. Reserve the USDC** on this existing order and review the exact call above. The complete tuple and calldata are in [next-manual-transaction.json](verification/real-ui-gate3/next-manual-transaction.json). If MetaMask wraps the transaction, these details describe the effective inner call; do not require its outer sender/destination to equal the buyer/operator. A delegation-only receipt does not establish reservation.

Refresh wallet total fees, including Base L1 data and actual routing overhead. Execution gas estimates and sample gas price are retained in evidence; they are not fixed wallet gas settings. Estimated delegated execution cost is below the buyer's ETH balance.

After manual funding, verify canonical success plus the three exact events and post-state above before treating checkout as reserved. Reservation does not complete seller release or establish publication readiness.

## Quality gates, deviations and follow-ups

ABI provenance PASS; targeted gateway/receipt proof suite **87/87 PASS**; two-RPC chain evidence PASS; direct/delegated post-state simulations PASS; actual frontend preparation and actual Gate 3 receipt replay PASS. No implementation changes required. Actual future MetaMask confirmation remains manual; no unknown wallet envelope is claimed as validated.

## Evidence log

Reproduce chain verification: `node web/scripts/verify-ui-gate3-and-prepare-gate4.mjs`. It has an RPC read/simulation allowlist and deliberately fails once the order is funded or the cutoff expires. [Chain evidence](verification/real-ui-gate3/evidence.json), [command output](verification/real-ui-gate3/read-only-check.txt), [quality checks](verification/real-ui-gate3/frontend-tests.txt).
