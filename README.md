# Dealza

**Problem:** Online deals made in DMs often lack clear payment terms and an agreed way to resolve disputes.

**Dealza — Clear agreements. Human decisions.** A Base-powered payment agreement app for people buying and selling through WhatsApp, Telegram, X, and other social channels. The seller records written terms, a named buyer, a fixed trusted reviewer, and deadlines; the buyer reserves test USDC using Coinbase Payment Protocol (CPP). An authorized buyer can release an undisputed payment, while the agreed reviewer can decide a disputed release or return before expiry. **Dealza does not custody the USDC.**

**[Try the live Base Sepolia app](https://dealza-drab.vercel.app/)** · **[Watch the 3-minute Vibeathon demo](https://youtu.be/Pui1nd1uwfs)** · [Source code](https://github.com/Alike001/dealza) · [How it works and safeguards](https://dealza-drab.vercel.app/#/help)

> **Vibestarter Vibeathon 02 submission received — November 9, 2026.** The public app and repository use `main`. This is a **controlled Base Sepolia testnet MVP**, not a production escrow, delivery-verification service, or guarantee of payment recovery.

## Judge quickstart — no wallet or transactions required

Start with the two **real, previously completed** Base Sepolia workflows below. Both are accessible in a fresh browser with no wallet; they are not seeded or fictional payments. The order links include the original offchain terms, which are matched to onchain fingerprints.

| Outcome | Public checkout | Verified final transaction | Actual effect |
| --- | --- | --- | --- |
| **Paid to seller** | [Open completed checkout](https://dealza-drab.vercel.app/#/order/0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd?terms=Dealza%20Checkpoint%206%3A%20fresh%20UI-only%201%20test-USDC%20checkout%3B%20controlled%20test%2C%20no%20physical%20delivery.) | [Buyer-authorized release](https://sepolia.basescan.org/tx/0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023) | **1 test USDC to seller**, 0 reserved; contract `Released (4)` |
| **Returned to buyer** | [Open disputed checkout](https://dealza-drab.vercel.app/#/order/0xbcb5e97254ce461b35efa91372f2d104f0f71c71ab5abff4f374ec36df4397d0?terms=Dealza%20Checkpoint%208%3A%20buyer%20dispute%20and%20reviewer%20return%3B%20controlled%20test%2C%20no%20physical%20delivery.) | [Reviewer-authorized return](https://sepolia.basescan.org/tx/0x3724fb79fef257a8dd5e2168b097755232d5299d90913591bb81d1049fc4e304) | **1 test USDC uncaptured reserve returned to buyer**, 0 reserved; contract `Voided (5)` |

**Suggested judging path:** Open the [home page](https://dealza-drab.vercel.app/) → inspect both outcomes above and their BaseScan receipts → try the [five-stage agreement wizard](https://dealza-drab.vercel.app/#/create) with a **local draft only** → read the [limitations](https://dealza-drab.vercel.app/#/help). **Do not sign or submit a new order just to evaluate the examples.**

**What is real:** A six-transaction buyer-authorized UI checkout with 1 test USDC paid to the seller, plus a separate live buyer-dispute/reviewer-return journey with 1 test USDC returned from CPP custody. Both outcomes were checked against two independent Base Sepolia RPCs, exact events and token transfers; neither test involved physical delivery. [Buyer-release evidence](docs/27-COMPLETE-REAL-UI-CHECKOUT.md) · [Reviewer-return evidence](docs/31-FIRST-LIVE-DISPUTE-AND-RETURN.md) · [Final judge-experience checks](docs/32-FINAL-JUDGE-EXPERIENCE.md).

**What was demonstrated and refined for Vibeathon:** The interactive agreement wizard and checkout guidance, responsive public deployment, real MetaMask buyer checkout, canonical receipt/effect verification, clear completed-payment and returned-reserve pages, and a signed reviewer decision with a genuine Base Sepolia reserve return. The [historical checkpoint reports](docs/) preserve chronology; these statements do not claim every underlying protocol component originated during the event.

**Important limits:** Test assets only; named trusted reviewer cannot be replaced; a dispute does **not** pause expiry; delivery is not independently verified; returns of **uncaptured reserves** are not refunds of already captured seller payments. Broader physical mobile-wallet and expiry-recovery acceptance is not proven, and automated tests are not an independent security audit.

## How to Test

Dealza includes a responsive web application with real Base Sepolia wallet/payment interfaces. **DealzaOperator is deployed and independently verified** at `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`, block **53676176**. The centralized frontend configuration now uses this address. [Deployment evidence and first-payment procedure](docs/09-LIVE-DEPLOYMENT-AND-FIRST-PAYMENT.md). **The first controlled live 1 test-USDC lifecycle passed independent two-RPC verification**: buyer 20 USDC, seller 1 USDC, original Released, duplicate Voided, zero reserved balance and zero platform fee. [All six transactions and settlement proof](docs/17-FIRST-COMPLETE-LIVE-PAYMENT.md).

For judges, the [wallet-free quickstart](#judge-quickstart--no-wallet-or-transactions-required) above links both completed payment outcomes, original terms, onchain receipts, and a safe draft-only exploration path.

Historical deployment preparation: [EIP-7702 resolution](docs/verification/delegation-resolution/READINESS.md). The original deployer was restored to a standard EOA before deployment. Live buyer-release settlement and frontend publication are verified; broader physical-wallet/browser acceptance remains limited as described below.

Public source is now verified with exact creation/runtime matches on Sourcify and fully verified on Blockscout. [Source-verification evidence and public links](docs/10-PUBLIC-SOURCE-VERIFICATION.md). BaseScan-specific status remains unconfirmed; the prepared first-payment procedure is unchanged.

### Run the web application

Use Node **24 LTS** (tested: 24.14.1) and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173`. No wallet, funds, backend, database, private keys, or Foundry installation is needed to browse the application and prepare a local draft.

Try these flows:

1. Open `/#/` for the public product explanation. Open **Your orders** (`/#/orders`) to connect a wallet and discover its real orders. The verified operator is already configured.
2. Select **Create an order**, enter terms, amount, named buyer/reviewer addresses and deadlines, and **Save draft**. The draft stays on this device; it creates no order or payment.
3. Open **Connect wallet**. Without an injected wallet, the app explains how to use MetaMask or a compatible wallet. External mobile-wallet connection is not integrated, and physical wallet in-app browsers have not been verified. Connection shares a public address; it does not sign a transaction.
4. Enable Base Sepolia in the wallet. Another network shows a switch prompt and blocks payment actions. Test USDC/ETH balances, when connected, are real public contract reads; missing reads show an error or dash, never an invented zero.
5. Open **How it works** to review the reviewer/expiry/cancellation rules. Checkout URLs load real orders from the configured deployment; an unknown or invalid ID shows an error.
6. If a transaction is interrupted, use **Recheck saved transaction — no signature**. The saved account/network/operator intent prevents another submission while uncertain. Paste the actual hash from wallet history if needed; do not repeat a payment because of a timeout or an unverified wallet response.

These browsing and draft checks require no signatures or spending. To inspect the settled order locally, open `/#/order/0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f`. It reads **Paid to seller**, 0 reserved and 1 captured. **History now passes real Base Sepolia checks:** both orders show current Released/Voided state, and older activity links to the verified final receipt. Use **Load earlier activity** to reach older records; refreshing starts a fresh recent window. [Checkpoint 5 evidence and audit](docs/19-CHECKPOINT-5-HISTORY-AND-RELEASE-AUDIT.md). [Prioritized release checklist](docs/18-VIBEATHON-RELEASE-CHECKLIST.md). Any new payment tests require separate transaction authorization.

Fresh real UI checkout **Gates 1–6 PASS** for order `0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd`. The buyer/seller report using the actual Dealza frontend and MetaMask; canonical receipts, exact inner routed calls, pinned events, historical/current state and balances are independently verified. The settled shared checkout survives refresh; its history exposes the genuine final transaction and the completed buyer has no release action. [Six transaction hashes, balance movements, screenshot and frontend fix](docs/27-COMPLETE-REAL-UI-CHECKOUT.md). No further payment is needed for this demonstration.

### Base Sepolia setup and roles

- Enable **Base Sepolia (chain 84532)** in MetaMask or a compatible injected wallet. Never send mainnet funds to test this demo.
- Obtain test ETH using the [official Base faucet guide](https://docs.base.org/get-started/get-funds), and test USDC from [Circle’s faucet](https://faucet.circle.com/); select **Base Sepolia**. Your wallet estimates gas. Faucet availability and limits depend on the provider.
- Use different wallet addresses for **seller**, **named buyer**, and **agreed reviewer**. Agree on the reviewer together; the reviewer cannot be replaced.
- The seller creates and shares the agreement. The buyer separately approves the exact collector allowance, authorizes the payment terms, and reserves USDC. Seller evidence does not release funds. The buyer releases an undisputed payment; the reviewer decides a disputed full release/return before expiry.
- Deployed DealzaOperator: `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`. The deployment, CPP bindings, and financial contracts are unchanged.
- No signatures are required to inspect the genuine completed checkout. Fresh payment tests require your own explicit authorization; the recorded demonstration needs no new payment.

| Route                   | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `/#/`                   | Public landing page                                    |
| `/#/orders`             | Wallet-scoped orders and shared-link opener            |
| `/#/create`             | Draft, review, create, share                           |
| `/#/order/<id>?terms=…` | Wallet-free checkout inspection and authorized actions |
| `/#/help`               | Setup, safeguards, privacy and recovery limitations    |

The interface distinguishes submitted transactions from receipt-and-effect verification. Preserve the full shared `terms` query. History is partial until its older windows have been checked. [Public UI implementation and validation](docs/29-PUBLIC-UI-AND-MAIN.md).

### Automated frontend verification

```sh
npm test
npm run build
npm run abi:check
npm run preview --workspace web
```

Production output: **`web/dist/`**. The preview command serves that output locally, normally at `http://127.0.0.1:4173`.

Tests cover wallet disconnect/account changes, incorrect networks, declined signatures, reverted payments, pending versus confirmed receipts, expiry during disputes, reviewer permissions, stale reads, mismatched financial records/terms, seller creation, and deployment-pending states. The latest recorded judge-experience suite passed **330 frontend tests across 18 files** (November 7, 2026); see [the evidence and test log](docs/32-FINAL-JUDGE-EXPERIENCE.md). The earlier 234-test baseline is preserved in [prior verification](docs/30-JUDGE-READY-RELEASE.md). Coverage includes route and draft persistence, exact approval disclosure, keyboard focus, bounded history, authentic routed receipts, canonical block/transaction proof, strict financial events/state, replacements and durable pending recovery. Wallet/RPC fixtures exist only in tests, never in the production application. A passing test with fixtures is not evidence of a real testnet payment.

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

Dealza is a USDC order-payment application for people selling through WhatsApp, Telegram, X, or other social platforms, submitted to **Vibestarter Vibeathon 02**. Seller and buyer keep their own wallets. Offers name a specific buyer and an agreed reviewer before funding.

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

The original settlement verifier is `web/scripts/verify-ui-gate6-settlement.mjs`; it writes to historical evidence and should not be rerun in place. Use the isolated read-only browser replay described in [the public UI report](docs/29-PUBLIC-UI-AND-MAIN.md), saving new results separately. It checks two RPCs, exact events/state/balances, all seven lifecycle events, the original exact approval and duplicate-release rejection. The earlier first-payment verifier/runbooks are historical and use earlier balance assumptions. [Complete real UI checkout](docs/27-COMPLETE-REAL-UI-CHECKOUT.md).

The confirmation UI now applies the already-verified receipt-block snapshot immediately. Lagging RPC reads cannot roll it back; a failed refresh retains the last verified record, explains the delay, pauses actions and retries automatically. Saved receipt reconciliation also updates the visible order. No optimistic payment success or financial-contract changes were introduced.

The full buyer-release UI checkout **and one genuine buyer dispute followed by a reviewer-authorized full return of an uncaptured reserve** have been verified on Base Sepolia. Physical mobile wallets, broader real-device wrong-network/account-switch acceptance and live disputed-expiry recovery remain unverified; coverage from contract/fork/fixture tests is not a substitute for those live tests or an independent audit. The product remains a **Base Sepolia controlled-test demo**.

For Vercel: repository root, `npm ci`, `npm run build`, output `web/dist`; root `vercel.json` declares the settings and security headers. For Cloudflare Pages: repository root, build `npm run build`, output `web/dist`, Node 24. `_headers` is copied into the output. Hash-based routes (`/#/order/<id>`) work without a server rewrite. Node 24 is pinned in `.nvmrc` and the root package engine. The [public launch runbook](docs/28-PUBLIC-LAUNCH-RUNBOOK.md) has exact hosting settings and public acceptance checks. The public Vercel application is available at the URL above; `main` contains the published judge-experience changes. Changes to GitHub do not themselves guarantee that a new Vercel deployment has completed; verify the production deployment independently.

## Repository and evidence

- `web/` — React/TypeScript/Vite app, injected-wallet adapter, receipt-driven payment gateway, UI and state-machine tests.
- `contracts/src/` — reviewed restricted operator; `contracts/test/` — unit/fuzz/invariant/fork tests.
- `contracts/vendor/`, `contracts/dependencies.lock.json`, `contracts/abi/` — pinned protocol dependencies and exact interfaces, with upstream licenses intact.
- [Protocol facts](docs/01-PROTOCOL-FACTS.md), [lifecycle and limitations](docs/02-RELEASE-POLICY.md), [contract test mapping](docs/03-MVP-ACCEPTANCE-AND-TESTS.md), [original checkpoint](docs/05-CHECKPOINT-1-REPORT.md), [predeployment review](docs/06-PREDEPLOY-REVIEW.md), [web report](docs/08-WEB-APPLICATION.md).

Historical contract verification and fresh frontend evidence are under `docs/verification/`. Tests are not an independent security audit. Upstream CPP, Solady, OpenZeppelin, and forge-std retain their own license notices.
