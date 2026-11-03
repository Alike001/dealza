# First complete live Dealza payment — Base Sepolia

Checkpoint 5 update: the historical frontend history failure recorded below has been fixed and verified with real reads. See [the current history and release audit](19-CHECKPOINT-5-HISTORY-AND-RELEASE-AUDIT.md). The original settlement evidence and its limitations remain unchanged.

**PASS — the controlled end-to-end buyer-release lifecycle settled onchain.** This verifies testnet financial settlement, not physical delivery or complete frontend acceptance. All six transactions were independently retrieved again from two RPC providers. No signing, broadcast, financial transaction, redeployment, fund-moving Solidity change or GitHub push was performed during verification.

## Verification snapshot and identities

Readback block **53889848**, hash `0xa60ee916ed0651e739b797c9e03cf0fc789b038b02357f35920abde8f5a03742`, **2026-11-03T09:57:18.000Z**. Queries started 2026-11-03T09:57:17.020Z. Release mined at **2026-11-03T09:43:17.000Z**, block **53885645**, with **4204 confirmations** at this snapshot. These are L2 receipt/canonical-head observations, not a separate assertion of Ethereum L1 finality.

Independent origins: `https://base-sepolia-rpc.publicnode.com` and `https://sepolia.base.org`. Both agree on complete receipts, canonical block hashes, transactions, historical before/after states and current readback. The verifier uses explicit block numbers. Initial Node dual-stack requests timed out; read-only `curl -4` transport succeeded. Both providers' receipt copies and raw logs are saved. Source/ABI checks use pinned CPP v1.1.0 commit `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9`; the generated operator ABI matches the compiled artifact; standard ERC-20 event ABI comes from pinned viem 2.57.14. Executable runtime hashes match on both RPCs.

| Identity   | Address                                      |
| ---------- | -------------------------------------------- |
| buyer      | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25` |
| seller     | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf` |
| operator   | `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8` |
| collector  | `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea` |
| escrow     | `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c` |
| usdc       | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| tokenStore | `0x57EC2910410C3Ef888c6127A3684d04171D5a11a` |

- Chain: Base Sepolia **84532**. Circle test USDC uses **6 decimals**.
- Original order: `0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f`.
- Exact CPP payment hash: `0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59`. Both RPC `getHash(stored PaymentInfo)` calls match; terms match the earlier reviewed snapshots.
- Duplicate order: `0x808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97`.
- [Operator deployment](https://base-sepolia.blockscout.com/tx/0x73c6b79e93387e6e0f69ceae5185f6a9049ef8fbb2526ada2c70f145e1b96fe1), block 53676176; [verified operator](https://base-sepolia.blockscout.com/address/0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8?tab=contract).

## Complete six-transaction lifecycle

All receipts below have successful status. Auxiliary wallet/delegation events are retained in raw receipts; the table lists the relevant Dealza/CPP/USDC events. Full decoded arguments, timestamps and historical states are in [machine-readable evidence](verification/first-live-payment/settlement/evidence.json).

| #   | Purpose                                        | Transaction / explorer                                                                                                                                                          | Block    | Mined UTC                | Core events                                                 |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------ | ----------------------------------------------------------- |
| 1   | Seller creates immutable order                 | [0x26498aaab70c0e6fef9009b046584cf8abf5873760ba3381f336c89aed9749e6](https://base-sepolia.blockscout.com/tx/0x26498aaab70c0e6fef9009b046584cf8abf5873760ba3381f336c89aed9749e6) | 53694732 | 2026-11-02T23:06:55.000Z | OrderCreated                                                |
| 2   | Buyer approves exact collector allowance       | [0x3095767bde9c695c83daf53c7fc78965559d69496ee2435612b1a873b84c782e](https://base-sepolia.blockscout.com/tx/0x3095767bde9c695c83daf53c7fc78965559d69496ee2435612b1a873b84c782e) | 53861912 | 2026-11-03T08:24:11.000Z | Approval                                                    |
| 3   | Buyer preapproves exact CPP hash               | [0x78cd5930a57b51edccb09a54c6c8e6edd8e85c6c78cfef7549bb9d280a26ba70](https://base-sepolia.blockscout.com/tx/0x78cd5930a57b51edccb09a54c6c8e6edd8e85c6c78cfef7549bb9d280a26ba70) | 53865872 | 2026-11-03T08:37:23.000Z | PaymentPreApproved                                          |
| 4   | Buyer reserves 1 test USDC                     | [0xd59acd2377d61f58f4dbe3d483f0dc75613d145f0484f8f665b0c8279a0c0e08](https://base-sepolia.blockscout.com/tx/0xd59acd2377d61f58f4dbe3d483f0dc75613d145f0484f8f665b0c8279a0c0e08) | 53871777 | 2026-11-03T08:57:04.000Z | PaymentAuthorized, Transfer, OrderFunded                    |
| 5   | Seller notes controlled-test delivery evidence | [0xacfb28da439caa95bc7d40172d01d83b20f9da64c182d4dcb073a5c3cbaad786](https://base-sepolia.blockscout.com/tx/0xacfb28da439caa95bc7d40172d01d83b20f9da64c182d4dcb073a5c3cbaad786) | 53879876 | 2026-11-03T09:24:04.000Z | DeliveryNoted                                               |
| 6   | Buyer explicitly releases to seller            | [0x63f302e19c08ffae721c7b9705e322eb331132b5216dd05256a6a4789f472c53](https://base-sepolia.blockscout.com/tx/0x63f302e19c08ffae721c7b9705e322eb331132b5216dd05256a6a4789f472c53) | 53885645 | 2026-11-03T09:43:17.000Z | PaymentCaptured, TokenStoreCreated, Transfer, OrderReleased |

Transaction 1 fixes buyer, seller, reviewer, amount, description fingerprint, deadlines, zero fee terms and order salt. Transaction 2 grants exactly 1,000,000 raw USDC allowance to the pinned collector; no funds move. Transaction 3 commits the exact CPP payment hash; no funds move. Its complete canonical hash includes `ef` omitted from an earlier supplied 31-byte hash. Transaction 4 emits the exact PaymentInfo authorization and transfers 1,000,000 units from buyer to CPP TokenStore; it does not pay the seller. Transaction 5 emits informational `DeliveryNoted` for the exact order with evidence hash `0xe81e15ba659740bcf8626122f97a3abec2c73ea4833c149f2ff47bc5210dbe82`; it changes no order storage or balances. The saved acknowledgment explicitly describes a controlled test and asserts no physical delivery. Transaction 6 captures and pays exactly once.

The six numbered payment steps exclude deployment, test-asset funding, wallet delegation setup, duplicate creation and duplicate cancellation. Those are setup/cleanup transactions, not extra numbered payment steps. [Duplicate creation](https://base-sepolia.blockscout.com/tx/0x0a041cd43fd4931414cdcc4672a5621741e53fd46d20b5d0fe576439c7f0b06b), block 53829603, and [duplicate cancellation](https://base-sepolia.blockscout.com/tx/0x9a150e4934f63566722ce02cf20d7d2857fa774e63236eb312e8bcac237c46b2), block 53847244, are historical cleanup evidence. Fresh reads confirm its complete order remains unchanged and **Voided (5)**, CPP `(false,0,0)`, preapproval false.

## Actual balance and state transitions

USDC columns are human units; CPP amounts and allowance are raw six-decimal units. Each row compares the preceding block with the transaction block on both RPCs. Operator, escrow singleton and collector USDC remain **0** in every listed before/after snapshot.

| Tx  | Buyer USDC | Seller USDC | TokenStore USDC | Post-order state | CPP (collected, capturable, refundable) | Collector allowance / preapproval |
| --- | ---------- | ----------- | --------------- | ---------------- | --------------------------------------- | --------------------------------- |
| 1   | 21 → 21    | 0 → 0       | 0 → 0           | Pending          | (false, 0, 0)                           | 0 / false                         |
| 2   | 21 → 21    | 0 → 0       | 0 → 0           | Pending          | (false, 0, 0)                           | 1000000 / false                   |
| 3   | 21 → 21    | 0 → 0       | 0 → 0           | Pending          | (false, 0, 0)                           | 1000000 / true                    |
| 4   | 21 → 20    | 0 → 0       | 0 → 1           | Reserved         | (true, 1000000, 0)                      | 0 / true                          |
| 5   | 20 → 20    | 0 → 0       | 1 → 1           | Reserved         | (true, 1000000, 0)                      | 0 / true                          |
| 6   | 20 → 20    | 0 → 1       | 1 → 0           | Released         | (true, 0, 1000000)                      | 0 / true                          |

Reservation cutoff: **2026-11-03 17:00 UTC**; authorization/refund expiry: **2026-11-05 17:00 UTC**. Reservation and release both mined before their respective deadlines. Preapproval remaining true after settlement is expected: CPP prevents recollection with `hasCollectedPayment`, and collector allowance is exhausted.

## Transaction 6 settlement proof

[BaseScan release transaction](https://sepolia.basescan.org/tx/0x63f302e19c08ffae721c7b9705e322eb331132b5216dd05256a6a4789f472c53). Exact genuine events in receipt order:

| Log | Emitter              | Decoded result                                                                           |
| --- | -------------------- | ---------------------------------------------------------------------------------------- |
| 0   | LimitedCallsEnforcer | Auxiliary wallet count event; raw log retained.                                          |
| 1   | CPP escrow           | `PaymentCaptured(paymentHash,1000000,0,address(0))`.                                     |
| 2   | CPP escrow           | `TokenStoreCreated(operator,0x57EC2910410C3Ef888c6127A3684d04171D5a11a)`.                |
| 3   | Circle test USDC     | `Transfer(TokenStore,seller,1000000)`.                                                   |
| 4   | DealzaOperator       | `OrderReleased(originalOrderId,buyer)`.                                                  |
| 5   | DelegationManager    | `RedeemedDelegation` names the buyer as root delegator and the outer sender as redeemer. |

Outer sender `0xb01caea8c6c47bbf4f4b4c5080ca642043359c2e` is a relayer; destination `0xdb9b1e94b5b69df7e401ddbede43491141047db3` is the existing DelegationManager. The decoded `redeemDelegations` envelope has exactly one default-mode execution, target DealzaOperator, value **0 wei**, and exact `release(originalOrderId)` calldata. The manager runtime matches its previously saved verified runtime. The deployed operator's buyer-only caller check and its genuine `OrderReleased.authorizedBy` establish effective buyer authorization; outer sender equality was not assumed. No new signature was requested by the verifier.

The extra `TokenStoreCreated` event is expected from pinned CPP `_sendTokens`: reservation can place USDC at the deterministic, not-yet-deployed TokenStore address. Before release its code was empty; on this first outgoing transfer CPP deployed the clone and sent the reserved token balance. Both RPCs confirm that code transition. This is CPP's transaction-internal custody deployment, not a verifier redeployment or a second payment.

| Required check                                       | Result / evidence                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release successful and exact order                   | Two matching receipts at reported block; genuine OrderReleased and exact inner calldata.                                                                                                                                                                                                                                                                                                        |
| Buyer authorization                                  | Buyer is stored payer, event authorizedBy and delegation root; no replacement terms or extra execution.                                                                                                                                                                                                                                                                                         |
| Seller receives exactly 1 test USDC                  | Single USDC Transfer of 1,000,000 raw from TokenStore; historical seller 0 → 1.                                                                                                                                                                                                                                                                                                                 |
| Buyer remains 20 test USDC                           | Historical before, after and readback all 20; no buyer transfer in release.                                                                                                                                                                                                                                                                                                                     |
| Reserved balance zero                                | CPP capturableAmount 0 and TokenStore actual token balance 0 on both RPCs.                                                                                                                                                                                                                                                                                                                      |
| No residual custody funds                            | Operator/TokenStore/escrow/collector USDC 0; [native residual checks](verification/first-live-payment/settlement/native-residual-check.json) also show operator/TokenStore ETH 0 before/after and at their recorded readback.                                                                                                                                                                   |
| Zero platform fee and no unexpected payment movement | Capture fee 0, fee receiver zero, exactly one token transfer and exact single execution. Relevant transfer/approval and order/payment events since prior verified readback independently agree on both RPCs and contain only this settlement. Earlier stages have their own retained interval scans. This claim concerns the specified payment/test USDC, not all assets or all wallet history. |
| Original Released                                    | Stored and derived state both Released (4); every other order field unchanged.                                                                                                                                                                                                                                                                                                                  |
| Duplicate remains Voided                             | Complete duplicate order/state unchanged; no collection or preapproval.                                                                                                                                                                                                                                                                                                                         |
| Second release rejected                              | Buyer `eth_call` on both RPCs returns **InvalidState()**, data **0xbaf3f0f7**. No broadcast or overrides.                                                                                                                                                                                                                                                                                       |

**CPP `(true,0,1000000)` does not mean 1 USDC remains in custody.** `refundableAmount` records captured accounting. Seller already holds the funds; Dealza exposes no post-capture refund path and retains no refund liquidity.

## Protection boundaries and test limitations

Dealza prevents the seller from unilaterally releasing an undisputed reserve or calling CPP capture as the operator. Exact-hash buyer preapproval plus buyer funding binds immutable terms; delivery acknowledgment alone never authorizes capture. The buyer explicitly releases while undisputed, or the fixed agreed reviewer decides full release/full return during a dispute before expiry. There is no admin, reviewer replacement, upgrade or arbitrary execution entry point.

This controlled test proves neither physical delivery nor fairness, availability or correctness of a reviewer. It does not guarantee insurance, merchant quality, automatic cancellation/recovery, a refund after capture, wallet/relayer security, RPC availability or mainnet safety. **A dispute does not pause or extend expiry.** The buyer may reclaim uncaptured funds directly from CPP after authorization expiry, including during unresolved disputes; recovery requires a transaction and gas. A seller can deliver and remain unpaid if the deadline passes. Circle issuer pause/blacklist controls can prevent transfers. Test assets have no real-money settlement claim.

The earlier reservation verifier demonstrated seller release/direct-capture rejection using ephemeral calls; it did not broadcast an adversarial transaction. Dispute resolutions, funded seller cancellation and expiry reclaim were covered by local/fork tests, not by this six-step live buyer-release lifecycle. The live unfunded duplicate cancellation is distinct from funded-return acceptance.

Production-preview reads show the real order as Paid to seller, 0 reserved / 1 captured, and 0 fee. Emulated 320/390px widths have no horizontal overflow. **Live history fails** because the default RPC enforces a 200-block log range while `rawLogs` requests 1,000. No injected wallet was present; real frontend wallet switching, mobile wallet flow and frontend-originated checkout remain unverified. [Browser observations](verification/first-live-payment/settlement/browser-QA.json).

## Release verification and repository preservation

- **46 local contract tests**, **36 read-only fork tests**, **121 frontend tests**, and **13 Python script tests** passed. Fork tests mutate only their local fork.
- Production build passed, including ABI source checks, TypeScript and Vite. Offline protocol check passed **77 pinned files** and full compiled CPP ABI.
- Initial online source verification timed out at the explorer. An IPv4 retry passed full escrow verification/source/ABI, collector executable/source verification, pinned upstream sources, independent compiled executable matches for escrow/collector/TokenStore, and Circle test-USDC code/symbol/decimals. Both attempts are retained.
- The dirty working tree was inventoried before edits. Existing scripts, deployment/source evidence and changes were preserved. This focused local commit contains settlement documentation, the verifier, its evidence and release checklist; pre-existing unrelated work stays outside it. The existing README source-verification paragraph remains in the working tree separately.
- [Secret scan](verification/first-live-payment/settlement/secret-scan.json): no flagged credential patterns or sensitive filenames in tracked files/nonignored candidates; 286 historical blobs also scanned without a hit. No `.env`, private key or personal credential file is tracked. This heuristic scan is not an absolute guarantee against all secrets. Public chain addresses and mined transaction/delegation signatures are intentional evidence. Browser `VITE_` values are public; use no secret credentials there.

**Public-release acceptance remains incomplete. Next priority: fix RPC log pagination and verify live order history/discovery.** Then complete real wallet/frontend and recovery-branch acceptance under separate transaction authorization. See the [prioritized Vibeathon checklist](18-VIBEATHON-RELEASE-CHECKLIST.md).

## Reproduce without signing

```sh
npm ci
cd contracts
forge build
forge test
FOUNDRY_PROFILE=fork forge test
python3 scripts/verify_protocol.py
python3 -m unittest discover -s scripts -p 'test_*.py'
cd ..
npm test
npm run build
node web/scripts/verify-complete-payment.mjs
```

The settlement verifier requires curl, existing compiled artifacts and public historical RPC availability. Its RPC method allowlist permits reads and `eth_call` only. It writes PASS only after all assertions; any failure writes FAIL with evidence collected so far. Re-running replaces the saved readback report and may reveal subsequent chain activity. Optional online protocol verification is `python3 scripts/verify_protocol.py --online` from `contracts/`.
