# Order creation: relayed MetaMask execution misreported as replacement

The two creation attempts **both succeeded onchain**. Do not submit a third creation for this checkout. The frontend incorrectly rejected valid relayed executions before inspecting their genuine `OrderCreated` events.

## Verified incident

Network: Base Sepolia (84532). Seller: `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`. Operator: `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`.

Authoritative capture: [chain-evidence.json](verification/transaction-replacement/chain-evidence.json). It pins reads to block **53837220**, hash `0xc9ae6d30d0cfcada8186c29a34d99f2087e901177994f1c579e2909ac6d04f8a`, and verifies the operator runtime against the generated pinned hash. A deployment-to-snapshot event scan, filtered by seller, found exactly two orders. The transaction list indexed under the seller's address omits relayed executions, so that list alone is insufficient.

| Transaction                                                                                                                                                          | Confirmed execution                                                                                                                                                                                                    | Result                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`0x26498a…9749e6`](https://sepolia.basescan.org/tx/0x26498aaab70c0e6fef9009b046584cf8abf5873760ba3381f336c89aed9749e6), block 53694732                              | Type 4; relayer `0xb42f812a44c22cc6b861478900401ee759ebead6` → execution contract `0xdb9b1e94b5b69df7e401ddbede43491141047db3`; seller authorization nonce 0 delegates to `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b` | Successful inner `createOrder`; genuine operator event for original order `0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f` |
| [`0x7f1683…b84ca0`](https://sepolia.basescan.org/tx/0x7f168316d9df0afe2d041276cd33beda9bc94c8755f6c68e5b46b83d7fb84ca0), block 53696890                              | Seller → self; outer nonce 1; empty calldata; seller authorization nonce 2 targets zero address                                                                                                                        | Delegation **revocation**, no order event. This is separate from the successful first creation.                                                |
| [`0x0a041c…7f0b06b`](https://sepolia.basescan.org/tx/0x0a041cd43fd4931414cdcc4672a5621741e53fd46d20b5d0fe576439c7f0b06b), block 53829603; full hash supplied by user | Type 4; relayer `0xb01caea8c6c47bbf4f4b4c5080ca642043359c2e` → same execution contract; seller authorization nonce 3 delegates to the same target                                                                      | Successful inner `createOrder`; genuine operator event for duplicate `0x808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97`      |

For all three transactions, receipt status is success. The script recovers each authorization's authority, rather than assuming its signer from the outer sender. It decodes embedded create calldata as a diagnostic; the verified operator's receipt events and contract read-back establish creation.

At the snapshot:

- Seller code: `0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b` (23-byte EIP-7702 delegation indicator).
- Confirmed account nonce **4**, pending account nonce **4**. This does not rule out a wallet-local request that has not reached the queried RPC.
- Seller balance: **49,812,291,697,244 wei = 0.000049812291697244 ETH**.
- Operator `sellerNonce(seller)`: **2**. This is the contract's order counter, not the account transaction nonce.
- Both orders have stored status **1** and derived status **1** (created, awaiting payment), amount **1,000,000 units = 1 test USDC**, buyer `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`, reviewer `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548`, and description hash `0xb28c8133d0699cbe2cda54262423de1d3c2fb55227e1508afa38602334c4ced4`.
- Both orders have identical funding cutoff **2026-11-03 17:00 UTC** and payment/review expiry **2026-11-05 17:00 UTC**. Their IDs, salts and payment hashes differ. These are the actual stored deadlines; the older preparation proposal is not the authoritative record of the submitted terms.

## Exact application bug

`chainGateway.send()` fetched the receipt's outer transaction and unconditionally required `from === seller`, `to === operator`, exact `createOrder` calldata, and zero value. When MetaMask returned the hash of a relayed execution, all three identity fields described the relayer envelope instead of the seller's inner call. The guard threw the message “Your wallet replaced this action with a different transaction” **even when `onReplaced` never ran**, before creation-event and state verification could execute.

Thus that error was not evidence of same-nonce replacement. Both receipts contain the actual requested order creations. A successful upgrade-only or revoke-only transaction is a different case: it cannot establish creation without the matching operator event and read-back.

## Wallet RPC audit

`wallet.tsx` uses injected EIP-1193 providers discovered through EIP-6963 or the browser provider. Connection/session methods are `eth_accounts`, `eth_requestAccounts`, `eth_chainId`; explicit network switching uses `wallet_switchEthereumChain`, with `wallet_addEthereumChain` only when the chain is unknown.

The submission path remains `createWalletClient(custom(provider))` → `writeContract` → Viem `sendTransaction`. Installed Viem **2.57.14** initially requests **`eth_sendTransaction`**. Its wallet namespace support cache can route to **`wallet_sendTransaction`**; selected invalid-input/invalid-params/unsupported-method errors can trigger that fallback. Inspect `node_modules/viem/actions/wallet/sendTransaction.ts` and `writeContract.ts`. An instrumented provider regression test runs the real installed Viem wallet action and verifies both successful ordinary submission and the invalid-params fallback, including the actual encoded request fields.

Dealza does **not** request `wallet_sendCalls`, `wallet_getCapabilities`, a smart-account capability, `signAuthorization`, or an authorization list. It does not construct a delegation transaction or choose a relayer. The confirmed outer transactions show wallet-managed authorization and execution. No browser RPC recording, extension version or confirmation-screen record was supplied, so the precise MetaMask setting/UI decision and whether a namespace fallback occurred in these live attempts cannot be determined. The application-side failure is confirmed without guessing about that wallet-side decision.

References: [EIP-7702 authorization and zero-address code clearing](https://eips.ethereum.org/EIPS/eip-7702), [Viem writeContract](https://viem.sh/docs/contract/writeContract), [Viem receipt replacement detection](https://viem.sh/docs/actions/public/waitForTransactionReceipt), [MetaMask eth_sendTransaction](https://docs.metamask.io/metamask-connect/evm/reference/json-rpc-api/eth_sendTransaction/). Context7 was used for current Viem documentation; the installed source and instrumented tests establish the exact local RPC behavior.

## Compatibility change and verification rules

The fix changes order-creation verification, not account configuration or financial terms:

1. Keep simulation, session/network checks, pinned deployment verification, two confirmations and successful receipt status.
2. Keep exact outer transaction identity for direct calls. A mismatched direct call, nonzero-value envelope, contract deployment, pure delegation change or cancellation cannot use the creation exception.
3. Permit a zero-value, nonempty relayed envelope only when creation's independent proof verifier is present. No relayer allowlist or assumption that type 4 is successful is used.
4. Require **exactly one** matching `OrderCreated` event from the configured, verified operator. Match seller, buyer, reviewer, description hash, token, operator, payer, receiver, amount, every deadline, zero fees/fee receiver, and salt/order ID. An event with a different amount, deadline or participant is insufficient.
5. Read the identified order back at a block no earlier than the receipt. Require the event's full payment struct, reviewer, description hash and payment hash to agree with the contract and existing protocol/financial consistency checks. Only then emit `confirmed`, return the order ID, show a link and clear the scoped draft.
6. Do not auto-resubmit after upgrades, errors or timeouts. Keep account/network/deployment-scoped draft autosaving. A restored draft explicitly tells users to inspect existing orders before retrying a submission.

Replacement notices now distinguish gas repricing, cancellation and a reported replacement. A confirmed delegation-only transaction is identified separately. **Other payment actions retain their existing direct-transaction identity requirement**; this patch does not claim generalized relayed payment-action support. A later compatibility change for those actions needs its own action-specific execution and financial-state proof.

Changed files: `web/src/lib/chainGateway.ts`, `web/src/lib/transactions.ts`, and the restoration notice in `web/src/components/CreateOrder.tsx`. Tests exercise direct and relayed creation (including already-delegated accounts without a new authorization), unrelated upgrade/replacement transactions, repricing, cancellations, reverted receipts, event/term tampering, missing events, multiple matching events, failed reads, the real Viem RPC boundary and preservation of strict verification for other actions. Existing draft scope/recovery tests remain in the frontend suite.

## Safest next manual transaction

**Do not create another order, approve USDC or reserve funds yet.** Retain the original order `0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f` and manually cancel the second unfunded duplicate `0x808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97`.

The read-only investigation script prepared and successfully simulated this ordinary operator call at block 53837220, estimating **33,943 gas**. It did not request a signature or broadcast anything:

```json
{
  "chainId": "0x14a34",
  "from": "0xF74aD341e10187073a0eef55356D136F1be5E3Cf",
  "to": "0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8",
  "value": "0x0",
  "data": "0xc4d252f5808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97"
}
```

This is `cancel(bytes32)` for the duplicate, not a delegation change. Re-read both orders immediately before the manual cancellation: if either is funded or has changed status, stop and reassess. Use the verified operator's contract interface or another independently reviewed wallet contract call; the unchanged payment-action path is not generalized for relay envelopes. Confirm the genuine operator cancellation event and refreshed status before proceeding with the retained original checkout. No account downgrade, delegation revocation, redeployment or new order is needed to resolve the duplicate.

## Reproduce the investigation and checks

```sh
node web/scripts/investigate-order-creation.mjs
npm test
npm run build
forge test --root contracts
FOUNDRY_PROFILE=fork BASE_SEPOLIA_RPC_URL=https://base-sepolia-rpc.publicnode.com forge test --root contracts
git diff --check
```

The investigation script only creates a public client, makes read-only RPC calls, recovers public authorization authorities, verifies and records orders, and prepares unsigned calldata. It stores no private keys, seed phrases or authorization signatures. The fork tests execute only inside Foundry's local fork; they do not broadcast to Base Sepolia.

Final results: **113 frontend tests passed**, **46 local contract tests passed**, and **36 fork tests passed**. The production build (including TypeScript and ABI provenance checks) passed. Vite emitted its dependency warning about externalizing `node:worker_threads` from `ox`; it did not fail the build. `git diff --check` passed.

Final test evidence is stored under [verification/transaction-replacement](verification/transaction-replacement/): `web-tests.txt`, `web-build.txt`, `contract-tests.txt`, `fork-tests.txt` and `diff-check.txt`. No Solidity source was changed. No deployment, signature, broadcast, live fund movement, delegation modification or GitHub push was performed.
