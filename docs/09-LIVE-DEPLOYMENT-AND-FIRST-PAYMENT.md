# Verified Base Sepolia deployment and first-payment runbook

## Decision

**PASS: deployment identity, complete runtime, and pinned configuration are verified. READY for separate authorization of the first 1 test-USDC payment.** The deployed-address lifecycle passed on an isolated local fork. No payment, allowance, signature, refund, deployment, or other public transaction was executed by this work. No contracts were changed or redeployed, no frontend was published, and nothing was pushed to GitHub.

This verifies the deployment and prepares a payment; it does not claim completed live payment acceptance or a fully validated public application. Explorer source publication is a separate status: the operator metadata lookup returned HTTP 403, so explorer source verification is **unconfirmed**. No source-verification submission was made. Complete bytecode verification below does not depend on explorer metadata.

## Onchain evidence

| Field | Independently checked result |
| --- | --- |
| Network | Base Sepolia, RPC chain ID and transaction chain ID **84532** |
| Operator | `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8` |
| Deployment transaction | `0x73c6b79e93387e6e0f69ceae5185f6a9049ef8fbb2526ada2c70f145e1b96fe1` |
| Receipt | Successful CREATE, status `0x1`, no `to`, zero native value |
| Deployer | `0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a`, deployment nonce 3 |
| Deployment block | **53676176** |
| Deployment block hash | `0xd5fd85a902ffd03c87d5b5d96902a9f337420fe12ac4688a36d9e93da7aa292b` |
| Verification snapshot | **53678435**, 2,260 confirmations counted inclusively |
| Creation input | All **9,994 bytes** equal the reviewed artifact, no constructor suffix |
| Creation SHA-256 | `45d2044b191500c9e097982f436a27cad6eb8105f72e161cd59946b854d6094a` |
| Deployed runtime | All **9,586 bytes** match at deployment block and snapshot |
| Runtime Keccak-256 | `0xadbc98ddf155ec9a93328c11d78ff7fe2aeb180cc74bd34222e4313584b2374d` |
| Constructor simulation | Fresh read-only CREATE `eth_call` returns exactly the same complete runtime |
| Immutables / metadata | No operator immutable references; no byte masking or CBOR removal |
| Compiler settings | solc 0.8.28, Cancun, via IR, optimizer 100000 |

The receipt and transaction block hashes match the independently fetched canonical block header, which includes this transaction. Public reads used `https://sepolia.base.org`. See [receipt](verification/live-deployment/receipt.json), [transaction](verification/live-deployment/transaction.json), [block](verification/live-deployment/deployment-block.json), [full verification](verification/live-deployment/verification.json), [runtime](verification/live-deployment/runtime.hex), and [constructor result](verification/live-deployment/constructor-runtime.hex). The creation/runtime hashes also equal the earlier controlled-deployment review, preserved in the workspace. Reviewed `src`, vendor files, compiler configuration, and dependency lock are unchanged from `2d611b0`.

[Deployment transaction on BaseScan](https://sepolia.basescan.org/tx/0x73c6b79e93387e6e0f69ceae5185f6a9049ef8fbb2526ada2c70f145e1b96fe1). [Operator on BaseScan](https://sepolia.basescan.org/address/0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8).

## Configuration and permissions

| Getter / dependency | Verified value |
| --- | --- |
| `ESCROW()` | `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c` |
| `COLLECTOR()` | `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea` |
| `USDC()` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| `CHAIN_ID()` | 84532 |
| `MAX_DURATION()` | 2592000 seconds / 30 days |
| Collector `authCaptureEscrow()` | Exact pinned escrow address |
| USDC | Six decimals, unpaused, proxy and implementation hashes match pinned review |
| USDC implementation | `0xd74cc5d436923b8ba2c179b4bca2841d8a52c5b5` |

Both complete CPP and collector runtime hashes match the pinned references. The independent online protocol verifier also passed source provenance, 77 pinned files, full CPP ABI, and compiled escrow/collector/TokenStore executable comparisons with their compiler-declared immutables. Collector explorer metadata remains partially verified as before; executable matching passed. See [protocol log](verification/live-deployment/protocol.txt) and [runtime evidence](verification/live-deployment/protocol-runtime.json).

The complete operator runtime is the reviewed direct contract, with exactly the 16 public functions listed in `verification.json`. It has no owner/admin role, upgrade, delegatecall dispatch, arbitrary execution, configuration setters, pause/rescue, charge, or refund entry point. EIP-1967 implementation/admin/beacon slots read zero. The deployer has no special permission; its attempted release reverts in the rehearsal. The named per-order reviewer retains the intended full-release/full-return authority only during an active dispute before expiry. Buyer release and seller cancellation permissions are unchanged. USDC retains its external issuer upgrade/pause/blacklist powers.

`contracts/config/base-sepolia.deployment.json` now contains the actual address, block and transaction. `web/src/lib/config.ts` imports this shared record; the existing frontend verifies runtime and configuration before writes. No second address constant was added to the frontend.

## Funded-wallet readiness and simulation

At block 53678435 all four named wallets were plain EOAs and not blacklisted. Buyer allowance to the collector was zero.

| Role | Address | Test ETH | Test USDC |
| --- | --- | ---: | ---: |
| Buyer | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25` | 0.00010 | 21 |
| Seller | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf` | 0.00005 | 0 |
| Reviewer | `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548` | 0.00002 | 0 |
| Deployer | `0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a` | 0.009804192965582933 | 20 |

[Payment rehearsal](verification/live-deployment/payment-rehearsal.json) uses this source block and the **already deployed operator**, real forked balances/nonces, existing CPP/Circle code, no token/ETH overrides and no deployment. Six transactions were estimated and `eth_call` simulated, then executed only on a fresh owned loopback Anvil fork, which was terminated. Public RPC only permits read methods; safety tests reject send/sign/impersonation/mutation requests.

| Step | Signer | Estimated execution gas | Gas limit with 25% buffer |
| --- | --- | ---: | ---: |
| Create order | Seller | 301765 | 377207 |
| Exact allowance | Buyer | 55819 | 69774 |
| Pre-approve terms | Buyer | 56094 | 70118 |
| Reserve | Buyer | 143204 | 179005 |
| Delivery evidence | Seller | 30921 | 38652 |
| Release | Buyer | 153482 | 191853 |

Snapshot gas price was 6000000 wei (0.006 gwei). Buffered execution totals: buyer 510750 gas / 0.0000030645 ETH; seller 415859 gas / 0.000002495154 ETH. Existing gas balances covered the local sequence. These figures exclude Base L1 data/operator fees and are not live fee caps: use fresh MetaMask estimates and retain buyer recovery gas.

Read-only negative checks: seller `release` → `Unauthorized()`; seller direct CPP `capture` → `InvalidSender(address,address)`; deployer `release` → `Unauthorized()`; repeated buyer release → `InvalidState()`. No failed transaction needs to be broadcast.

## Exact live procedure — separate authorization required

Use `npm run dev` or the checked local production preview. This is six transaction confirmations: **seller 2, buyer 4, reviewer 0, deployer 0**. Account connection and a network-switch prompt are separate non-payment permissions. Choose Base Sepolia (chain 84532) in each MetaMask account. Every transaction below sends **0 native ETH value**; test ETH pays gas. No message signature, typed-data signature, permit, delegation, unlimited allowance, or batch approval is required.

Before authorizing, rerun verification/simulation to refresh balances, allowance, seller nonce, code/configuration and fees. The JSON contains complete unsigned calldata and local event/balance evidence for review. Its deadlines, nonces, gas prices, order ID and payment hash are **snapshot simulation values**, not ready-to-submit payloads. Generate fresh deadlines and take the actual ID/payment tuple/hash from the confirmed live order. Never assume the simulated order already exists.

1. **Seller creates the order — MetaMask confirmation 1.** Connect `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`. Select **Create an order**, buyer `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`, amount **1 USDC = 1000000 units**, reviewer `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548`. Use a new funding cutoff approximately current chain time + 1 hour and authorization/review/reclaim expiry approximately + 2 hours, within 30 days. Agree the exact description and retain it offchain. Review immutable terms. Confirm `createOrder(buyer,1000000,preApprovalExpiry,expiry,reviewer,descriptionHash)` to **DealzaOperator**. Wait for successful receipt and the app's two confirmations. Read `OrderCreated` and `getOrder(actualId)`; verify seller/buyer/reviewer/token/amount/deadlines, salt = actual order ID, zero fee bounds and zero fee receiver. Share the confirmed checkout URL and description. No USDC moves; status Pending (1).

2. **Buyer grants exact allowance — MetaMask confirmation 2.** Connect the buyer to that checkout URL; verify the description hash and all immutable terms. Select **1. Allow exactly this USDC amount**. The transaction target is **USDC**, method `approve(collector,1000000)`, spender **`0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea`**, amount **1 USDC**, never unlimited. The spender is the collector, not the operator, seller or escrow. Confirm, wait, then read allowance = 1000000 and buyer balance unchanged. Stop for review if a prior allowance is nonzero.

3. **Buyer authorizes exact terms — MetaMask confirmation 3.** Select **2. Authorize these payment terms**. Target **collector**, method `preApprove(payment)` using the exact 12-field tuple from `getOrder(actualId)`. This is an onchain transaction, not a message signature. Verify `payment.operator`, payer, receiver, USDC, amount, three expiries, zero fees/feeReceiver and salt; recompute escrow `getHash(payment)` = stored `paymentHash`. After confirmation require `PaymentPreApproved(paymentHash)` and `isPreApproved(paymentHash) == true`. Buyer USDC stays unchanged; nothing is reserved yet.

4. **Buyer reserves funds — MetaMask confirmation 4.** Select **3. Reserve the USDC**. Target **DealzaOperator**, method `fund(actualId,payment)`. Recheck the exact tuple, allowance, pre-approval and funding cutoff. Confirm only after the fresh simulation succeeds. Require successful `OrderFunded` and CPP `PaymentAuthorized` events for the same hash and amount; status Reserved (2), CPP `(true,1000000,0)`. Buyer decreases by exactly 1 USDC, TokenStore increases by exactly 1, seller is unchanged and operator holds 0. Read collector allowance back: it should be 0. A reserved payment is not paid to the seller.

5. **Seller records delivery — MetaMask confirmation 5.** Connect the seller and select **Record delivery evidence**. Retain the evidence text/reference offchain. Confirm `noteDelivery(actualId,keccak256(UTF8(NFC(evidence).trim())))` to **DealzaOperator**. Require `DeliveryNoted`; CPP state, USDC balances and Reserved status must remain unchanged. Seller release/capture controls must be absent. Using read-only `eth_call` as seller, test `operator.release(actualId)` and `escrow.capture(payment,1000000,0,zeroAddress)`; require the errors above. These rejection checks have **no MetaMask confirmation and no transaction hash**. Do not send the expected failures.

6. **Buyer explicitly approves release — MetaMask confirmation 6.** Independently review delivery and the active, undisputed order before expiry. Select **Approve release to seller** and confirm `release(actualId)` to **DealzaOperator** from the buyer account. Require successful `OrderReleased(actualId,buyer)` and CPP `PaymentCaptured` for exactly 1000000 units, zero fee amount, zero fee receiver. Read stored and derived status Released (4), CPP `(true,0,1000000)`, buyer baseline −1 USDC, seller baseline +1 USDC, TokenStore baseline restored and operator 0. Allowance stays 0. CPP's refundable accounting here is historical captured accounting, not funds retained by Dealza and not a callable operator refund. There is no further release transaction.

The tuple order is `(operator,payer,receiver,token,maxAmount,preApprovalExpiry,authorizationExpiry,refundExpiry,minFeeBps,maxFeeBps,feeReceiver,salt)`. Both authorization/refund expiries equal the order expiry. Persist all actual terms before funding.

Expected balances from the verified snapshot, assuming no intervening transfers:

| State | Buyer USDC | Seller USDC | TokenStore USDC | Operator USDC | CPP collected / capturable / refundable |
| --- | ---: | ---: | ---: | ---: | --- |
| Before / approvals | 21 | 0 | 0 | 0 | false / 0 / 0 |
| Reserved / delivery / failed seller calls | 20 | 0 | 1 | 0 | true / 1000000 / 0 |
| Buyer release | 20 | 1 | 0 | 0 | true / 0 / 1000000 |

Use actual live baselines if balances change; do not display simulation numbers as live results. For each successful step retain chain ID, actual sender/target/calldata/value, real transaction hash, canonical successful receipt/block, decoded logs, actual order/payment hashes, allowance/pre-approval, stored/derived status, CPP state and buyer/seller/TokenStore/operator balances. Record rejected calls as simulations with no live hash. Refresh after each receipt; a wallet confirmation alone is insufficient.

If the flow stops before reservation, no payment has moved, but any unused allowance remains a separate revoke decision. After reservation, buyer has no unilateral early cancellation: seller may voluntarily void; the fixed reviewer may resolve a dispute before expiry. At/after expiry the buyer can separately authorize direct `escrow.reclaim(payment)` even for an unresolved dispute, with optional `syncRecovery(actualId)` bookkeeping. A dispute does not extend expiry. None of these fallback transactions is authorized or executed by this preparation.

## Validation and remaining application acceptance

- `forge build`: PASS; existing lint warnings remain.
- `forge test`: **46 passed**, 0 failed/skipped, including fuzz and invariants.
- `FOUNDRY_PROFILE=fork forge test`: **36 passed**, 0 failed/skipped at pinned historical block 53589971. These are distinct from the current deployed-address rehearsal.
- `python3 -m unittest discover -s scripts -p 'test_*.py' -v`: **13 passed**, including public-RPC send/sign rejection (workspace total includes the four pre-existing uncommitted delegation-readiness tests; the committed integration/funding/live-deployment suites total nine).
- `python3 scripts/verify_protocol.py --online --runtime-report ...`: PASS, pinned protocol/Circle checks.
- `npm test`: **44 passed**; `npm run abi:check`: PASS; `npm run build`: PASS, including ABI provenance and TypeScript. Existing optional Tempo worker externalization warning remains.
- Production browser smoke: home/help/create render with the actual operator configured, no pending-deployment notice, public RPC reads return HTTP 200, fork-only order fails verification, zero console errors/warnings, no horizontal overflow on the 390px creation page. See [browser evidence](verification/live-deployment/browser-smoke.json). No injected wallet or live order was used.
- `verify_live_deployment.py --simulate`: deployment PASS and six-transaction payment PASS on local fork only; four negative calls reverted as expected.

Logs are under [verification/live-deployment](verification/live-deployment/verification.json). The existing pending nonzero-gas-price rehearsal fix and its safety test are retained as required dependencies of this new named-wallet simulation; they do not change financial contracts. Other prior workspace deployment-preparation artifacts remain separate. No secrets are used by the new tool or committed evidence.

Remaining for a completely validated Vibeathon application: separately authorize and perform the six live steps, verify genuine receipts and balances in both MetaMask accounts and the browser, test actual checkout sharing/discovery/refresh, then exercise seller return, both reviewer verdicts and disputed expiry reclaim on separately authorized orders. Refresh account/network/declined-transaction/replacement behavior in real wallets. Automated fixtures, a local fork, and this deployment verification cannot replace those live acceptance results. Frontend hosting/publication and explorer source publication also remain separate work.

Tool references consulted through Context7: [viem receipt](https://viem.sh/docs/actions/public/getTransactionReceipt), [viem read-only simulation](https://viem.sh/docs/contract/simulateContract), and [Foundry Anvil](https://getfoundry.sh/anvil/reference/). All balance/receipt/runtime assertions above come from the saved RPC evidence and local simulation, not from documentation.
