# Dealza

**Complete real MetaMask UI checkout verified on Base Sepolia: all six gates PASS.** Final release [`0x6408…c023`](https://sepolia.basescan.org/tx/0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023): buyer **19 USDC**, seller **2 USDC**, reserve **0**, captured **1 USDC**, fee **0**, order **Released**. Controlled test; no physical delivery occurred. [Complete evidence](docs/27-COMPLETE-REAL-UI-CHECKOUT.md) · [Public launch runbook](docs/28-PUBLIC-LAUNCH-RUNBOOK.md) · [Release checklist](docs/18-VIBEATHON-RELEASE-CHECKLIST.md). **Website and GitHub publication have not been performed by this audit.**

## How to Test

Dealza includes a responsive web application with real Base Sepolia wallet/payment interfaces. **DealzaOperator is deployed and independently verified** at `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`, block **53676176**. The centralized frontend configuration now uses this address. [Deployment evidence and first-payment procedure](docs/09-LIVE-DEPLOYMENT-AND-FIRST-PAYMENT.md). **The first controlled live 1 test-USDC lifecycle passed independent two-RPC verification**: buyer 20 USDC, seller 1 USDC, original Released, duplicate Voided, zero reserved balance and zero platform fee. [All six transactions and settlement proof](docs/17-FIRST-COMPLETE-LIVE-PAYMENT.md).

Historical deployment preparation: [EIP-7702 resolution](docs/verification/delegation-resolution/READINESS.md). The original deployer was restored to a standard EOA before deployment. Live buyer-release settlement is verified; frontend publication and full wallet/browser acceptance remain outstanding.

Public source is now verified with exact creation/runtime matches on Sourcify and fully verified on Blockscout. [Source-verification evidence and public links](docs/10-PUBLIC-SOURCE-VERIFICATION.md). BaseScan-specific status remains unconfirmed; the prepared first-payment procedure is unchanged.

### Run the web application

Use Node **24 LTS** (tested: 24.14.1) and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173`. No wallet, funds, backend, database, private keys, or Foundry installation is needed to browse the application and prepare a local draft.

Try these flows:

1. Open the home page: the verified operator is configured. Connect a wallet to discover its real orders.
2. Select **Create an order**, enter terms, amount, named buyer/reviewer addresses and deadlines, and **Save draft**. The draft stays on this device; it creates no order or payment.
3. Open **Connect wallet**. Without an injected wallet, the app explains how to use MetaMask or a compatible wallet. Mobile users can open the page in their wallet’s browser. Connection shares a public address; it does not sign a transaction.
4. Enable Base Sepolia in the wallet. Another network shows a switch prompt and blocks payment actions. Test USDC/ETH balances, when connected, are real public contract reads; missing reads show an error or dash, never an invented zero.
5. Open **How it works** to review the reviewer/expiry/cancellation rules. Checkout URLs load real orders from the configured deployment; an unknown or invalid ID shows an error.
6. If a transaction is interrupted, use **Recheck saved transaction — no signature**. The saved account/network/operator intent prevents another submission while uncertain. Paste the actual hash from wallet history if needed; do not repeat a payment because of a timeout or an unverified wallet response.

These browsing and draft checks require no signatures or spending. To inspect the settled order locally, open `/#/order/0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f`. It reads **Paid to seller**, 0 reserved and 1 captured. **History now passes real Base Sepolia checks:** both orders show current Released/Voided state, and older activity links to the verified final receipt. Use **Load earlier activity** to reach older records; refreshing starts a fresh recent window. [Checkpoint 5 evidence and audit](docs/19-CHECKPOINT-5-HISTORY-AND-RELEASE-AUDIT.md). [Prioritized release checklist](docs/18-VIBEATHON-RELEASE-CHECKLIST.md). Any new payment tests require separate transaction authorization.

Fresh real UI checkout **Gates 1–6 PASS** for order `0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd`. The buyer/seller report using the actual Dealza frontend and MetaMask; canonical receipts, exact inner routed calls, pinned events, historical/current state and balances are independently verified. The settled shared checkout survives refresh; its history exposes the genuine final transaction and the completed buyer has no release action. [Six transaction hashes, balance movements, screenshot and frontend fix](docs/27-COMPLETE-REAL-UI-CHECKOUT.md). No further payment is needed for this demonstration.

### Automated frontend verification

```sh
npm test
npm run build
npm run abi:check
npm run preview --workspace web
```

Production output: **`web/dist/`**. The preview command serves that output locally, normally at `http://127.0.0.1:4173`.

Tests cover wallet disconnect/account changes, incorrect networks, declined signatures, reverted payments, pending versus confirmed receipts, expiry during disputes, reviewer permissions, stale reads, mismatched financial records/terms, seller creation, and deployment-pending states. Current verification passes **226 frontend tests**, including bounded history, authentic routed receipts, canonical block/transaction proof, strict financial events/state, replacements and durable pending recovery. Wallet/RPC fixtures exist only in tests, never in the production application. A passing test with fixtures is not evidence of a real testnet payment.

The committed frontend ABIs are generated from the existing Solidity artifacts and pinned CPP v1.1.0 ABI. Their source hashes are checked during the production build. A clean frontend build does not need generated Foundry outputs. If Solidity interfaces intentionally change, run:

```sh
cd contracts
forge build
cd ..
npm run abi:sync
npm run build
npm test
```

Review regenerated ABI/runtime hashes before committing. Do not change fund-moving Solidity to accommodate a frontend shortcut.

### Contracts and protocol checks

Install [Foundry](https://getfoundry.sh/introduction/installation/), Python 3, and curl. Solidity dependencies are vendored and hash-locked; no `forge install` is necessary. Tested with Foundry 1.8.5, solc 0.8.28, Cancun, via IR, optimizer 100000.

```sh
cd contracts
forge build
forge test
python3 scripts/verify_protocol.py
FOUNDRY_PROFILE=fork forge test
python3 scripts/verify_protocol.py --online
```

The default Solidity profile runs offline tests; the fork profile uses read-only Base Sepolia RPC and local fork storage. The pinned fork block is 53589971. Override the public RPC with `BASE_SEPOLIA_RPC_URL` if rate-limited. These commands do not broadcast transactions or use wallets.

## Product and payment rules

Dealza is a USDC order-payment application for people selling through WhatsApp, Telegram, X, or other social platforms, entered in **Vibestarter Vibeathon 02**. Seller and buyer keep their own wallets. Offers name a specific buyer and an agreed reviewer before funding.

Buyer funding has three separate wallet transactions: exact USDC allowance to the existing collector, authorization of the exact CPP payment terms, and reservation. Reserved USDC stays in CPP’s TokenStore, not in DealzaOperator. Seller delivery evidence never releases funds. An undisputed buyer can explicitly release; a disputed order requires the agreed reviewer’s full-release or full-return decision before expiry. The reviewer cannot be replaced and there is no admin override.

**A dispute does not freeze or extend CPP expiry.** At the deadline the buyer may reclaim uncaptured funds directly from CPP even if the review is unresolved. Recovery needs a buyer transaction and test ETH; it is not automatic. A seller who delivered may remain unpaid if the deadline passes.

The application cannot verify physical delivery and does not guarantee reviewer fairness, buyer protection, insurance, or refunds after capture. USDC issuer controls can block transfers. The protocol’s captured accounting is not retained refund liquidity. No AI, chatbot, autonomous agent, own token, or custody service.

## Centralized Base Sepolia configuration

| Configuration                   | Value                                                                |
| ------------------------------- | -------------------------------------------------------------------- |
| Chain                           | Base Sepolia, `84532`                                                |
| Existing CPP escrow             | `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c`                         |
| Existing pre-approval collector | `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea`                         |
| Circle test USDC                | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals)            |
| CPP version                     | v1.1.0, commit `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9`            |
| DealzaOperator                  | `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`, block `53676176`       |
| Deployment transaction          | `0x73c6b79e93387e6e0f69ceae5185f6a9049ef8fbb2526ada2c70f145e1b96fe1` |

Frontend network configuration: `web/src/lib/config.ts`. Deployment identity: `contracts/config/base-sepolia.deployment.json`. Protocol identity is reused from the verified protocol evidence; ABIs/runtime hash are in `web/src/lib/contracts.generated.ts`.

An optional **public browser RPC** can be set as `VITE_BASE_SEPOLIA_RPC_URL` in `web/.env.local`. `VITE_` values are exposed to every browser visitor: never put a wallet key, seed phrase, secret API credential, or backend token there. The default is `https://sepolia.base.org`. History requests default to at most **200 inclusive blocks**, configured by `VITE_RPC_LOG_BLOCKS` (integer 1–200). `VITE_HISTORY_BLOCKS` controls each UI window (default 2,000, integer 1–10,000). Set smaller limits for stricter providers and rebuild. Log reads are serialized, range errors shrink the request, and transient failures have bounded retries. Recent windows remain explicitly incomplete until older pages are checked; failed pages retain their cursor for retry. The app verifies chain ID and contract code/configuration before writes; there is no mainnet execution path.

## Verified settlements and remaining acceptance

The deployed runtime, creation input, receipt, pinned protocol configuration, USDC implementation, and absence of operator admin/upgrade powers are independently checked. The frontend reads the actual address and block from the shared deployment record. Reproduce the read-only verification and isolated simulation:

```sh
cd contracts
forge build
python3 scripts/verify_live_deployment.py --simulate --output-dir ../docs/verification/live-deployment
```

This tool has no public send/sign mode. Its six payment transactions run only on an internally allocated loopback fork, with actual funded participant balances and the existing deployed operator. It neither redeploys nor adds gas/tokens.

[The completed live lifecycle](docs/17-FIRST-COMPLETE-LIVE-PAYMENT.md) records all six canonical transactions, decoded events, historical balances, buyer authorization and duplicate-release rejection. Release [`0x63f302e19c08ffae721c7b9705e322eb331132b5216dd05256a6a4789f472c53`](https://base-sepolia.blockscout.com/tx/0x63f302e19c08ffae721c7b9705e322eb331132b5216dd05256a6a4789f472c53) mined in block **53885645** on **2026-11-03 at 09:43:17 UTC**. CPP `PaymentCaptured`, a single TokenStore-to-seller transfer of **1,000,000 raw USDC**, and buyer-authorized `OrderReleased` prove settlement. CPP remaining refundable accounting is not retained refund liquidity.

Reproduce the current fresh-order settlement verification without a wallet: `node web/scripts/verify-ui-gate6-settlement.mjs`. It checks two RPCs, exact events/state/balances, all seven lifecycle events, the original exact approval and duplicate-release rejection. The earlier first-payment verifier/runbooks are historical and use earlier balance assumptions. [Complete real UI checkout](docs/27-COMPLETE-REAL-UI-CHECKOUT.md).

The confirmation UI now applies the already-verified receipt-block snapshot immediately. Lagging RPC reads cannot roll it back; a failed refresh retains the last verified record, explains the delay, pauses actions and retries automatically. Saved receipt reconciliation also updates the visible order. No optimistic payment success or financial-contract changes were introduced.

The full happy-path UI checkout is verified. Physical mobile wallets, broader wrong-network/account-switch behavior and live signed funded-cancellation/reviewer/disputed-expiry-recovery branches remain acceptance limits. Contract/fork/fixture coverage for these branches passes; it is not live UI acceptance or an independent audit. Publish as a **Base Sepolia controlled-test demo**, with these limits explicit.

For Vercel: repository root, `npm ci`, `npm run build`, output `web/dist`; root `vercel.json` declares the settings and security headers. For Cloudflare Pages: repository root, build `npm run build`, output `web/dist`, Node 24. `_headers` is copied into the output. Hash-based routes (`/#/order/<id>`) work without a server rewrite. Node 24 is pinned in `.nvmrc` and the root package engine. The [public launch runbook](docs/28-PUBLIC-LAUNCH-RUNBOOK.md) has exact hosting settings and public acceptance checks. Publishing commands have deliberately not been run.

## Repository and evidence

- `web/` — React/TypeScript/Vite app, injected-wallet adapter, receipt-driven payment gateway, UI and state-machine tests.
- `contracts/src/` — reviewed restricted operator; `contracts/test/` — unit/fuzz/invariant/fork tests.
- `contracts/vendor/`, `contracts/dependencies.lock.json`, `contracts/abi/` — pinned protocol dependencies and exact interfaces, with upstream licenses intact.
- [Protocol facts](docs/01-PROTOCOL-FACTS.md), [lifecycle and limitations](docs/02-RELEASE-POLICY.md), [contract test mapping](docs/03-MVP-ACCEPTANCE-AND-TESTS.md), [original checkpoint](docs/05-CHECKPOINT-1-REPORT.md), [predeployment review](docs/06-PREDEPLOY-REVIEW.md), [web report](docs/08-WEB-APPLICATION.md).

Historical contract verification and fresh frontend evidence are under `docs/verification/`. Tests are not an independent security audit. Upstream CPP, Solady, OpenZeppelin, and forge-std retain their own license notices.
