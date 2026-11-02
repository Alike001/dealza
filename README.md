# Dealza

## How to Test

Dealza now includes a responsive web application with real Base Sepolia wallet/payment interfaces. **DealzaOperator has not been deployed.** The app deliberately shows **“Testnet integration pending”** and disables onchain order creation and payment actions. There are no sample financial balances, invented receipts, or simulated successful orders in the product.

### Run the web application

Use Node **24 LTS** (tested: 24.14.1) and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173`. No wallet, funds, backend, database, private keys, or Foundry installation is needed to explore the pending integration experience.

Try these flows:

1. Open the home page: the pending integration message and empty order area are explicit.
2. Select **Create an order**, enter terms, amount, named buyer/reviewer addresses and deadlines, and **Save draft**. The draft stays on this device; it creates no order or payment.
3. Open **Connect wallet**. Without an injected wallet, the app explains how to use MetaMask or a compatible wallet. Mobile users can open the page in their wallet’s browser. Connection shares a public address; it does not sign a transaction.
4. Enable Base Sepolia in the wallet. Another network shows a switch prompt and blocks payment actions. Test USDC/ETH balances, when connected, are real public contract reads; missing reads show an error or dash, never an invented zero.
5. Open **How it works** to review the reviewer/expiry/cancellation rules. A valid-format checkout URL remains unverified while the operator is missing; an invalid ID shows a clear error.

No deployment, signatures, broadcasts, or spending are required for the checks above. No live payment can complete until a separately authorized and verified operator deployment is configured.

### Automated frontend verification

```sh
npm test
npm run build
npm run abi:check
npm run preview --workspace web
```

Production output: **`web/dist/`**. The preview command serves that output locally, normally at `http://127.0.0.1:4173`.

Tests cover wallet disconnect/account changes, incorrect networks, declined signatures, reverted payments, pending versus confirmed receipts, expiry during disputes, reviewer permissions, stale reads, mismatched financial records/terms, seller creation, and deployment-pending states. Wallet/RPC fixtures exist only in tests, never in the production application. A passing test with fixtures is not evidence of a real testnet payment.

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

| Configuration | Value |
| --- | --- |
| Chain | Base Sepolia, `84532` |
| Existing CPP escrow | `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c` |
| Existing pre-approval collector | `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea` |
| Circle test USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals) |
| CPP version | v1.1.0, commit `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9` |
| DealzaOperator | **Not deployed**; address/block/transaction are null |

Frontend network configuration: `web/src/lib/config.ts`. Deployment identity: `contracts/config/base-sepolia.deployment.json`. Protocol identity is reused from the verified protocol evidence; ABIs/runtime hash are in `web/src/lib/contracts.generated.ts`.

An optional **public browser RPC** can be set as `VITE_BASE_SEPOLIA_RPC_URL` in `web/.env.local`. `VITE_` values are exposed to every browser visitor: never put a wallet key, seed phrase, secret API credential, or backend token there. The default is `https://sepolia.base.org`. The app verifies chain ID and contract code/configuration before writes; there is no mainnet execution path.

## Connect the real deployment later

The full frontend architecture, function mapping, verification evidence, limitations, and exact activation sequence are in [08-WEB-APPLICATION.md](docs/08-WEB-APPLICATION.md).

1. Fund the test wallets and complete the separately authorized deployment preflight/local rehearsal. No live deployment or payment has been performed by this work.
2. After explicit deployment authorization, deploy **only DealzaOperator**, with **no constructor arguments**, and verify its source/runtime. Reuse the existing CPP contracts.
3. Record the real Base Sepolia operator address, deployment block, and deployment transaction in `contracts/config/base-sepolia.deployment.json`; keep `chainId: 84532`. Never use a predicted address as an actual deployment.
4. Re-run ABI checks, frontend tests/build, protocol verification, and wallet-specific simulations. The app rejects runtime/configuration mismatches.
5. After separate transaction authorization, create a small real order; verify allowance → pre-approval → reservation → delivery evidence → buyer release against receipts, actual USDC balances, CPP accounting, and Dealza status. Use separate orders for seller cancellation, both reviewer verdicts, and disputed expiry reclaim.
6. Publish the frontend only after separate authorization. No site was published or GitHub push performed in this task.

For Vercel: repository root, `npm ci`, `npm run build`, output `web/dist`; root `vercel.json` declares the settings and security headers. For Cloudflare Pages: repository root, build `npm run build`, output `web/dist`, Node 24. `_headers` is copied into the output. Hash-based routes (`/#/order/<id>`) work without a server rewrite. Publishing commands have deliberately not been run.

## Repository and evidence

- `web/` — React/TypeScript/Vite app, injected-wallet adapter, receipt-driven payment gateway, UI and state-machine tests.
- `contracts/src/` — reviewed restricted operator; `contracts/test/` — unit/fuzz/invariant/fork tests.
- `contracts/vendor/`, `contracts/dependencies.lock.json`, `contracts/abi/` — pinned protocol dependencies and exact interfaces, with upstream licenses intact.
- [Protocol facts](docs/01-PROTOCOL-FACTS.md), [lifecycle and limitations](docs/02-RELEASE-POLICY.md), [contract test mapping](docs/03-MVP-ACCEPTANCE-AND-TESTS.md), [original checkpoint](docs/05-CHECKPOINT-1-REPORT.md), [predeployment review](docs/06-PREDEPLOY-REVIEW.md), [web report](docs/08-WEB-APPLICATION.md).

Historical contract verification and fresh frontend evidence are under `docs/verification/`. Tests are not an independent security audit. Upstream CPP, Solady, OpenZeppelin, and forge-std retain their own license notices.
