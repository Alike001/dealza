# Dealza web application — implementation and verification

## Current activation status

**The shared deployment record is now populated with the verified live Base Sepolia operator.** Current verification, production-build results, deployed-address payment rehearsal, and remaining live browser/receipt acceptance are in [09-LIVE-DEPLOYMENT-AND-FIRST-PAYMENT.md](09-LIVE-DEPLOYMENT-AND-FIRST-PAYMENT.md). The null-deployment and browser observations below describe the original frontend checkpoint. They are retained as historical evidence.

## Original checkpoint result and deployment boundary

Implemented a responsive React/TypeScript/Vite application with real viem wallet and contract interfaces. **The operator deployment remains null.** The default product shows “Testnet integration pending,” permits local order drafts and informational browsing, and does not fabricate financial balances, order records, receipts, or successful payments.

No fund-moving Solidity was changed. No wallet connection/signing, public blockchain send, token spending, contract deployment, frontend publication, or GitHub push was performed. Browser QA used the pending integration experience without an injected wallet. Test doubles for configured orders/wallets are confined to `web/src/test/` and are not imported by production code.

## Stack and surfaces

Static React application, TypeScript, Vite, and viem; no payment backend, database, private keys, wallet SDK account custody, or server-authoritative financial status. Exact package versions are pinned in `package-lock.json`; tested Node is 24.14.1. The chain client is loaded on demand. Routes use URL fragments so shared checkout works on static hosts without server rewrites.

The visual system uses warm paper, deep green, restrained lime accents, serif headings, and readable agreement sheets. All graphics are local SVG/CSS and describe roles rather than fake payments. No tracking or remote font/image dependency was added. Forms have persistent labels, accessible errors/status regions, keyboard focus states, a skip link, reduced-motion support, and layouts for desktop/tablet/phone.

| Surface | Implemented behavior |
| --- | --- |
| Home / orders | Pending deployment notice, injected-wallet connection, actual public wallet balances when connected, wallet-filtered order discovery from creation logs, paginated older orders, and checkout-link/ID entry |
| Create order | Named buyer/reviewer, exact 6-decimal amount, plain-text description, funding and review/reclaim deadlines, distinct-role/date validation, local draft save, immutable-term review, confirmed creation and share-link generation |
| Shared checkout | Public read without a wallet; immutable seller/buyer/reviewer/amount/fees/deadlines/hash; description verified against its onchain hash; CPP accounting and actual TokenStore reserve check; transaction review before wallet requests |
| Buyer preparation | Exact collector allowance, onchain exact-payment pre-approval, reserve; allowance and protocol state read back independently; token/gas prerequisites visible |
| Seller actions | Delivery evidence hash, voluntary cancellation/return, dispute opening; no seller capture action |
| Buyer actions | Explicit release while undisputed, dispute opening, unfunded cancellation, direct CPP expiry reclaim, allowance revocation |
| Reviewer actions | Fixed reviewer only, active dispute only, full seller release or full buyer return before expiry, with decision hash |
| Recovery | Direct payer → CPP reclaim at/after expiry, including unresolved disputes; derived Reclaimed state while stored state may lag; optional recovery sync |
| Timeline / history | Funding cutoff, capture/review deadline, reclaim boundary, chain timestamp/block, decoded order and CPP events, actual event transaction hashes and explorer links |
| Help | Wallet/network/faucet guidance, custody boundaries, reviewer trust, physical-delivery limits, cancellation/reclaim differences, privacy and evidence preservation |

There is no general owner/admin UI, arbitrary transaction forwarding, charge endpoint, or post-capture refund button.

## Chain integration and safety

`contracts/config/base-sepolia.deployment.json` is the shared deployment record. Its operator, block, and transaction remain null. `web/src/lib/config.ts` centralizes Base Sepolia `84532`, Circle test USDC, existing CPP escrow/collector, explorer, and the read RPC. Protocol addresses/hashes come from existing verified evidence. No URL/query parameter or wallet network can override the operator/token/chain identity.

`contracts.generated.ts` exports the actual operator/collector ABIs from Foundry and the exact verified CPP v1.1.0 ABI. `npm run abi:check` verifies source/ABI provenance hashes; `abi:sync` is an explicit regeneration step after `forge build`. The operator’s expected runtime hash is exported from the reviewed artifact. A clean static build uses these committed interfaces without requiring a Solidity compiler.

Before writes the gateway checks wallet `eth_accounts`/selected account, wallet chain ID, RPC chain ID, operator/escrow/collector runtime hashes, contract constants, and collector escrow binding. It reloads the order and CPP state at a consistent block, checks exact payment hash/operator/token/fees/salt/deadlines, and re-evaluates actor/state permissions. It checks session identity again after simulation and before the wallet request. A changed/disconnected account or another network is rejected.

Every write is `simulateContract` → wallet transaction → two-confirmation receipt → receipt success and exact sender/target/input/value verification → fresh chain reads. Replacement/cancellation is handled; a different successful transaction is not accepted as the requested action. Pending hashes and confirmed receipt messages do not themselves set financial status. Post-transaction validation reads at or after the confirmed receipt block. Out-of-order responses cannot overwrite a newer snapshot. Failed RPC reads hide unverified financial state and show an error rather than an empty successful record.

Financial labels require consistency among stored order state, derived Dealza status, CPP `(hasCollectedPayment, capturableAmount, refundableAmount)`, and the actual shared TokenStore USDC balance. The shared balance can include other orders and is labelled as such. Paid status is not inferred from a current seller balance (the seller may already have spent the funds), nor from a browser/backend request succeeding. There is no financial-state backend.

### Exact function mapping

| User action | Target / real function |
| --- | --- |
| Create | Dealza `createOrder(buyer, amount, preApprovalExpiry, authorizationExpiry, reviewer, descriptionHash)` |
| Allow / revoke | Circle USDC `approve(existingCollector, exactAmount)` / `approve(existingCollector, 0)` |
| Authorize terms | Existing collector `preApprove(fullPaymentInfo)` |
| Reserve | Dealza `fund(orderId, fullPaymentInfo)` |
| Delivery claim | Dealza `noteDelivery(orderId, evidenceHash)` |
| Buyer release | Dealza `release(orderId)`; CPP capture uses absolute `feeAmount = 0` |
| Open dispute | Dealza `dispute(orderId, evidenceHash)` |
| Reviewer pay / return | Dealza `resolve(orderId, true/false, decisionHash)` |
| Cancel / voluntary return | Dealza `cancel(orderId)` |
| Expiry recovery | Existing CPP escrow `reclaim(fullPaymentInfo)`, signed by payer directly |
| Reconcile recovery history | Dealza `syncRecovery(orderId)` |

All write actions require explicit user interaction, a terms/action acknowledgement, and a review panel before the wallet request. Transaction buttons lock during preflight/signing/pending operations. Evidence/decision content is hashed locally; only its commitment is submitted. No typed-data release signature, Permit2, EIP-3009, relayer, paymaster, or gas sponsorship is implied.

## Terms, history, and privacy

Order descriptions are plain text in the share link’s fragment, not a simulated database order. The app normalizes NFC/outer whitespace, hashes the text, and compares it with the immutable description hash. Mismatches or missing terms are prominently identified; the buyer must review the original offchain agreement and hash instead of trusting changed link text. React renders text without HTML injection. Keep terms concise; long agreements make long links. No personal delivery information belongs there.

Descriptions and evidence are not durably hosted by this app. The participants must preserve/share original agreements and evidence. Local drafts are browser-only, contain no authoritative financial state, and may be unavailable on another device. No fake successful state is used to fill the empty dashboard.

History is queried in pages of 10,000 blocks, in RPC chunks of at most 1,000. Per-order operator/CPP logs are filtered by their indexed order/payment hashes, including direct protocol reclaims. “Load earlier” is explicit; absence in one window is not presented as a complete empty history. Financial reads remain independent of the history window. Public RPC rate limits/pruned history can interrupt browsing; retry or use a suitable public browser RPC. A production indexer could improve discovery at scale but must never become financial authority.

## Verification executed

Fresh logs: `docs/verification/web/`. Verification completed:

| Command / check | Actual result |
| --- | --- |
| `npm test` | **44 passed, 0 failed, 0 skipped**, across 3 test files. [Test log](verification/web/tests.txt) |
| `npm run build` | PASS: source/ABI check, strict TypeScript check, Vite production bundle. [Build log](verification/web/build.txt) |
| `npm run abi:check` | PASS: generated interfaces match recorded Solidity/ABI source provenance |
| `npm audit --omit=dev` | 0 reported production dependency vulnerabilities at execution |
| `git diff 2d611b0 --exit-code -- contracts/src contracts/vendor contracts/abi contracts/foundry.toml` | PASS: reviewed Solidity, pinned interfaces/dependencies, and Foundry settings are unchanged |
| Local production-preview browser checks | PASS: eight home/create viewport checks, draft save, no-wallet guidance, help navigation, unverified shared-order state, no paid state, skip-link focus, no page errors. [Browser evidence](verification/web/browser-QA.json) |

No test transaction was broadcast. Configured-wallet and configured-payment UI tests use clearly identified test-only fixtures; live-wallet end-to-end testing is still blocked by deployment.

The browser pending-integration experience was checked at widths 1440, 768, 390, and 320. An initial decorative-orbit overflow at two widths was fixed and rechecked; home and creation forms fit without horizontal overflow. No-wallet guidance, draft saving, and help navigation were exercised. The browser console had no runtime errors. The first development-server launch had an npm argument-forwarding mistake; the corrected workspace command served normally. One new share-link assertion used an unsupported asymmetric DOM matcher; it was corrected to inspect the actual input value. These setup/test issues are not represented as successful payment simulations.

Build warning: viem’s transitive `ox` dependency includes an optional Tempo `node:worker_threads` module, which Vite externalizes for browsers. Base Sepolia uses the injected-wallet/HTTP path; the tested browser experience has no runtime error. This is retained as a dependency warning, not hidden or described as live-wallet coverage. Chain code is split from initial UI to avoid an oversized initial chunk.

## Blockers and limits

- The real DealzaOperator is not deployed/configured. Real creation, reservation, capture, reviewer settlement, cancellation/reclaim, and live history are implemented interfaces but have not been executed through a deployed Dealza operator. No real order ID or transaction hash is claimed.
- Wallet funding/deployment preparation remains a separate gate. Earlier named-wallet preflight recorded zero gas balances; it must be refreshed rather than treated as current forever.
- Supports direct transactions from compatible injected wallets, including MetaMask and wallet in-app browsers. WalletConnect, wrapped smart-account user-operation flows, and sponsored gas are not implemented.
- Named-buyer offers require the buyer address before creation. The reviewer is fixed before funding, trusted, and cannot be replaced. There is no onchain reviewer-acceptance obligation or guaranteed response time.
- **Dispute does not extend expiry.** At the deadline the buyer can reclaim uncaptured funds even if review is unresolved and the seller really delivered. UI cannot determine physical delivery, promise a fair ruling, or guarantee refunds after capture.
- USDC issuer pause/blacklist/upgrade and public RPC availability remain external dependencies. Tests and internal reviews are not an independent audit.
- The frontend is built locally, not publicly hosted. Vercel/Cloudflare settings are prepared; no deployment/push command was run.

## Exact activation steps after separate authorization

1. Re-run named-wallet funding checks and the deployment/integration local rehearsal; keep any failed/uncertain preflight as NO-GO. Use Base Sepolia only, small Circle test USDC, and test ETH for every signer.
2. Obtain explicit authorization to deploy only DealzaOperator, no constructor arguments, with the reviewed Foundry settings. Reuse canonical CPP infrastructure. Confirm and verify the real receipt, source/runtime, and contract constants.
3. Fill `contracts/config/base-sepolia.deployment.json` with `chainId: 84532`, actual operator address, actual numeric deployment block, and actual deployment transaction hash. Do not use a predicted/local-fork address as a deployed one.
4. Run `npm ci`, `npm run abi:check`, `npm test`, `npm run build`, and protocol verification. Runtime/code/binding mismatches must prevent transactions. Do not weaken that check to accept a different contract.
5. Manually test read-only public checkout, injected wallet changes/disconnect, wrong-network rejection, named participant permissions, displayed amount/recipient/fees/terms/hash/deadlines, and recovered status after a direct CPP call.
6. After separate authorization for each live action, execute small, separate orders for (a) buyer release, (b) seller voluntary return, (c) reviewer release, (d) reviewer return, and (e) unresolved dispute expiry reclaim. Confirm actual receipt events, token balances, CPP accounting, and derived Dealza status. Seller capture and duplicate release remain read-only rejection checks.
7. For Vercel later: root directory = repository root, install `npm ci`, build `npm run build`, output `web/dist`; root `vercel.json` supplies headers/settings. For Cloudflare Pages: same root/build/output, Node 24, `_headers` copied from `web/public/`. Hash routing requires no path rewrite. Only publish after explicit authorization; no hosted URL exists yet.
8. Record genuine deployed addresses, transaction hashes and explorer URLs in the integration report, then run live browser acceptance checks. Current automated fixture tests do not substitute for this step.

## Local checkpoint scope

The focused frontend checkpoint contains the web workspace/lockfile, static-host configuration, null shared deployment record, generated frontend interfaces, README, and this report/evidence. Earlier Checkpoint 2 preparation files (`contracts/scripts/integration.py`, its safety tests/public role configuration, `docs/07-BASE-SEPOLIA-INTEGRATION.md`, and its evidence) remain separate, uncommitted workspace work. They were not deleted or marked as a passed funded rehearsal. The frontend build does not depend on them. Reviewed Solidity and pinned vendor sources remain unchanged from `2d611b0`.
