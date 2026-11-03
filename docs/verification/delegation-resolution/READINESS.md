# Deployment readiness after EIP-7702 investigation — 2026-11-02

**GO for separately authorized Base Sepolia deployment only**, using the original deployer **`0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a` as a standard MetaMask EOA**. The user manually restored it and confirmed it is available in MetaMask. No replacement account is needed now. [Final decision](decision.json), [user confirmation](signer-confirmation.json), [final on-chain refresh](final-refresh.json).

Final independent refresh: Base Sepolia block **53671209**; all four role accounts still have empty code, confirmed/pending nonces agree, gas price remains 6,000,000 wei, and all buffered budgets remain funded.

This is readiness, not deployment authorization. DealzaOperator is **not deployed**; the actual operator/address/block/transaction configuration remains null. The real payment lifecycle and publication remain outstanding for Vibeathon 02 on November 9. No agent transaction, transfer, signature, delegation change, private-key export, push, or publication occurred.

## Current account state and the change from the earlier report

Fresh preflight block **53669902** shows deployer code **`0x`**, confirmed/pending nonce **3**, and balance **0.009829799473135824 ETH**. All four roles have empty code and distinct addresses. Buyer still has **21 Circle test USDC**, seller/reviewer need no initial USDC, and buyer collector allowance is zero. No role is USDC-blacklisted; USDC is unpaused with six decimals. [Preflight](preflight.json).

The code transition occurred at block **53667094**: [transaction `0x426c…eaa1`](https://sepolia.basescan.org/tx/0x426cfab87fa5229521ec740d80ee667f0fa29508180f5ec7794f7faadbe8eaa1) is type 4, from/to the deployer, with a zero-address authorization. Adjacent-block reads show the earlier indicator becoming `0x`, and nonce 1 becoming 3. This was an existing on-chain action, subsequently confirmed by the user as their manual switch; the agent only read it. [Transition evidence](account-change.json).

## What the previous delegation actually was

The earlier code was independently fetched from Base Sepolia at block **53654038**:

`0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b`

It is exactly **23 bytes**: `0xef0100` followed by the 20-byte target **`0x63c0c19a282a1b52b07dd5a65b58948a07dae32b`**. Recognition uses exact length and hex validation, not a prefix-only assumption. [Delegation evidence](delegation.json).

The target matches MetaMask's published **v1.3.0 EIP7702StatelessDeleGatorImpl**. Its **11,185-byte** runtime hash is **`0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2`**. Verification included:

- The [official versioned deployment listing](https://github.com/MetaMask/delegation-framework/blob/v1.3.0/documents/Deployments.md), saved locally as [official-deployments.md](official-deployments.md).
- MetaMask's Base Sepolia deployment transaction `0x18ef…fb71`, comparing live transaction input/from/to and transaction/receipt block identity with the [official broadcast record](official-delegator-deployment.json). The default RPC prunes the old deployment header at block 23680810; no independent canonical-header check for that old block is claimed. The retrieved [live transaction/receipt](official-delegator-live-transaction.json) and publisher record agree.
- Sourcify's exact runtime verification, comparing every live byte with its verified on-chain bytecode, and comparing all eight project `src/` files to the official v1.3.0 sources. [Saved verification response](delegator-sourcify.json). This is verified-compilation evidence from Sourcify, not an independent local compilation of MetaMask's dependency tree.

The target therefore matched the official implementation; this does not establish wallet ownership, audit every delegation permission, or validate a sponsored signing route.

## Why the ordinary-EOA gate was conservative

`integration.py` rejects any nonempty role code before starting its normal rehearsal. That restriction is a supported-wallet policy, **not an Ethereum prohibition on delegated EOAs deploying contracts**. [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) permits valid delegated accounts to originate transactions. An existing delegated EOA can originate an ordinary direct-CREATE transaction. A new type-4 authorization transaction itself requires a destination and cannot directly create a contract by omitting it.

An owned local fork at block 53654038 successfully executed direct CREATE from the still-delegated deployer, with **no code/balance/nonce overrides**. Nonce **1** predicted **`0xD3B7B900e7159B05d7B4716D16f0462bbbde3248`**, the receipt matched, the resulting runtime was exact, and delegation was preserved. [Historical deployment diagnostic](historical-delegated-create.json). Local impersonation proves execution compatibility; it does **not** prove a MetaMask signature or sponsored/bundler envelope.

The earlier funding transactions were sponsored wallet executions. Their success did not validate ordinary contract creation through that route. The original non-EOA gate is retained; it was not deleted or bypassed to obtain a normal passing result. The historical diagnostic is separate and cannot authorize a live transaction. The current normal rehearsal passes because the user restored empty code.

## Constructor, runtime, prediction, and signing route

[Read-only deployment evidence](deployment.json) records:

- Constructor arguments **`[]`**, value **0**, creation **9,994 bytes**, expected runtime **9,586 bytes**. Creation exactly matches the reviewed funded-preflight artifact.
- Creation SHA-256 **`45d2044b191500c9e097982f436a27cad6eb8105f72e161cd59946b854d6094a`**.
- Runtime Keccak-256 **`0xadbc98ddf155ec9a93328c11d78ff7fe2aeb180cc74bd34222e4313584b2374d`**.
- A public constructor `eth_call` at **nonzero proposed gas price** returned the exact expected runtime; `eth_estimateGas` returned **2,144,685**. The normal preflight's separate zero-price smoke test is not used as funded proof.
- Current direct-CREATE prediction: **`0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`**, using confirmed/pending nonce **3**. The predicted address had empty code and zero nonce. The actual local deployment matched it and all `ESCROW`, `COLLECTOR`, `USDC`, `CHAIN_ID=84532`, and `MAX_DURATION=2592000` reads passed.
- Supported route: **Foundry 1.8.5 `forge create --browser` → MetaMask ordinary `eth_sendTransaction` contract creation**, from the confirmed standard EOA. The installed [CLI help](forge-create-help.txt), current [Foundry signer-mode documentation](https://github.com/foundry-rs/foundry/blob/master/docs/dev/scripting.md), and [MetaMask RPC documentation](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/evm/reference/json-rpc-api/eth_sendTransaction.mdx) were checked. The user confirmed account availability; no wallet connection, signing prompt, or signature was exercised by the agent.

No `authorizationList`, type-4 transaction, wallet self-call, factory, or bundler is part of the proposed deployment. Recheck empty code, nonce, fees, and account selection immediately before any separately authorized send. Any intervening outgoing transaction invalidates the nonce-3 prediction. Never populate the actual deployment configuration with a predicted address.

## Funded lifecycle and gas

The unchanged normal integration gate and the corrected rehearsal passed **36 locally executed transactions, six order scenarios, and ten negative checks**. Outcomes: buyer release, seller cancellation, reviewer release, reviewer void, disputed expiry with direct payer reclaim and state synchronization, and unfunded cancellation with allowance cleanup. Exact payment hashes/events, balances, CPP reserve/capture accounting, authorization restrictions, runtime, and terminal Dealza states were checked. [Normal rehearsal](rehearsal.json), [successful command log](rehearsal.txt).

The first current-state rehearsal stopped after deployment because Anvil's automatic fee settings rejected the seller's funded balance. The fix explicitly supplies the observed **nonzero public gas price** in estimation, simulation, and local execution; no wallet funding is fabricated. [Original failure](rehearsal-initial-attempt.txt), [diagnosis](rehearsal-debug.txt). Unit tests cover the fee propagation, positive-price requirement, unchanged public mutation rejection, indicator boundaries, unknown-target rejection, and invalid fallback configuration.

At the deployment snapshot: gas price **6,000,000 wei**, proposed price **12,000,000 wei**, deployment gas limit **2,680,857** (25% buffer), L1 fee upper bound **647,507,139,341 wei**, operator fee **0**. Public deployment budget: **0.000033465298278682 ETH**.

The full diagnostic prices every transaction using its data length plus a conservative 128-byte signed-envelope allowance, the Base oracle's L1 upper bound and operator fee, 25% gas headroom, twice snapshot execution price, and twice L1/operator estimates. Deployer below uses the larger public constructor budget. All roles are funded at this snapshot:

| Role | Available ETH | Buffered lifecycle budget ETH | Result |
| --- | ---: | ---: | --- |
| Deployer | 0.009829799473135824 | 0.000033465298278682 | PASS |
| Buyer | 0.0001 | 0.000028042045342274 | PASS |
| Seller | 0.00005 | 0.000028537018924632 | PASS |
| Reviewer | 0.00002 | 0.000002922481802504 | PASS |

[Per-transaction and role budgets](local-diagnostic.json). These are snapshot cushions, not future fee guarantees or quotes for sponsored envelopes. Local fork fees are not evidence of a real Base L1 debit. The raw `diagnostic.txt` log conservatively prints NO-GO for live signing because that process does not consume user confirmation; it is not the final signed-off deployment decision. The diagnostic's automatic signing status remains outside its scope; [decision.json](decision.json) combines actual successful checks with the user's separately recorded signer confirmation.

## Exact manual MetaMask actions

No further delegation switch, account creation, or funding is required for the selected current route.

1. Open MetaMask and select **`0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a`** in the account selector. Select **Base Sepolia**, chain **84532**. Under the account's three-dot menu → **Account details → Smart account**, confirm Base Sepolia remains in standard mode; do not toggle it or approve a new upgrade. [MetaMask account-mode instructions](https://support.metamask.io/configure/accounts/switch-to-or-revert-from-a-smart-account/).
2. **Only after separate deployment authorization**, start Foundry's browser-wallet deployment locally, connect MetaMask to its local browser page, and permit only this deployer account. The reviewed command shape, from `contracts/`, is below. It has **not** been run; refresh its nonce/gas parameters first.

```sh
forge create src/DealzaOperator.sol:DealzaOperator \
  --rpc-url https://sepolia.base.org --chain 84532 \
  --browser --from 0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a \
  --legacy --nonce 3 --gas-limit 2680857 --gas-price 12000000 \
  --broadcast
```

3. In the future MetaMask confirmation, verify the sender, Base Sepolia, **contract deployment**, zero native value, and the creation data matching [deployment.json](deployment.json). There are no constructor arguments or token approvals. Use direct ETH gas payment; reject a switch-to-smart-account, sponsorship, authorization, or unexpected recipient request because that changes the reviewed route. Confirm only after the separate authorization and fresh checks. No seed phrase, private key, or account export is needed.
4. After a genuine status-1 receipt, require the actual receipt address to match the fresh prediction, compare the full runtime, verify source/settings, and read all immutable protocol constants. Only then populate `base-sepolia.deployment.json`. Payment execution and publishing need their own authorization and real receipt-based verification.

If standard mode becomes unavailable, use [base-sepolia.standard-eoa.roles.template.json](../../../contracts/config/base-sepolia.standard-eoa.roles.template.json). Its `deployer: null` is deliberately rejected by the loader. To create a candidate manually: MetaMask account selector → **Add account or hardware wallet → + Ethereum account → name it → Add account**; inspect its Base Sepolia smart-account setting and verify on-chain code `0x` before using it. [Official account creation instructions](https://support.metamask.io/configure/accounts/how-to-add-accounts-in-your-wallet/). New MetaMask accounts can have smart functionality auto-enabled; a new account is not assumed plain. Supply only its public address, preserve buyer/seller/reviewer, arrange any necessary test ETH manually, and rerun preflight, fee estimates, prediction, and full rehearsal with that roles file. No candidate was invented, funded, or substituted automatically.

## Verification and preservation

| Check | Result |
| --- | --- |
| Foundry build | PASS; existing lint warnings |
| Local contract tests | **46 passed**, zero failures/skips |
| Pinned historical protocol fork tests | **36 passed**, zero failures/skips |
| Python preparation/safety tests | **11 passed** |
| Online protocol verifier | PASS; 77 pinned files, complete ABI, escrow/collector/TokenStore executable matches, Circle USDC checks |
| Current funded named-wallet rehearsal | **36 local transactions, six scenarios, ten negative checks passed** |
| Historical delegated direct CREATE | PASS locally; exact runtime/prediction; delegation preserved |
| Constructor, current prediction, role fee budgets | PASS |
| Financial source, vendor, Foundry settings, frontend source and dependency lock preservation | PASS; no diff from `57f1a5a` |

Adjacent logs preserve the real results and failed attempts. The default RPC's pruned historical-header response is retained in [pruned-header-attempt.txt](pruned-header-attempt.txt). Initial diagnostic stops were retained; they do not replace the final successful rehearsal or the signed-off decision. The frontend was not changed or retested in this task.

Commit **`57f1a5a`** and all existing ancestors remain intact. No amend, rebase, reset, financial Solidity change, or GitHub push occurred. The only behavioral preparation change is explicit public snapshot gas pricing for local rehearsal. Real payment receipts and a published Dealza remain future acceptance work.
