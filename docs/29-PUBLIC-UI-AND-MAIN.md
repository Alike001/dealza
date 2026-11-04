# Public Dealza UI and main branch migration

Dealza now has a complete public landing page and a separate order dashboard. The interface keeps the existing cream, forest-green, lime-accent and serif-display identity. This is a **Base Sepolia controlled-test demonstration** for Vibeathon 02 on Base. No new blockchain transaction, contract deployment, push, GitHub repository creation or Vercel deployment was performed.

## Routes and behavior

| Route                   | Result                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/#/`                   | “Make online deals clearer before money moves.” Hero, agreement diagram, social-commerce problem, four-step payment workflow, buyer/seller benefits, CPP integration, reviewer/expiry limits, FAQ and final CTA.                              |
| `/#/orders`             | Dedicated order workspace, wallet-scoped roles and verified status, clearer rows, shared-link opener, loading/error/empty states and truthful bounded-history pagination.                                                                     |
| `/#/create`             | Agreement/amount, people and deadlines remain in the existing validated form. Review receives keyboard focus; wallet/network-scoped autosaved drafts and signing guards are retained.                                                         |
| `/#/order/<id>?terms=…` | Wallet-free inspection, prominent deadline and financial state, exact allowance cap and spender, separate terms authorization/reservation explanations, role-specific action explanations, readable receipts and original onchain provenance. |
| `/#/help`               | Existing setup, trust, privacy and recovery explanation with improved readability and dashboard return link.                                                                                                                                  |

The wallet provider remains above the router. Wallet controls and pending-transaction recovery remain in the persistent application shell. Wallet disclosure supports Escape, focus return, a labelled controlled panel, loading and unavailable balances. Navigation preserves checkout IDs and encoded agreement terms. No automatic signing or payment was added.

The interface distinguishes submission from verification. A financial confirmation is shown only after the existing gateway verifies the canonical receipt and required effects. A previously verified creation without a new receipt is labelled “Agreement verified.” Missing/failed reads do not become invented zero balances or successful payments.

## Preserved financial core

No changes to `contracts/`, `web/src/lib/`, deployed addresses, generated ABIs, CPP bindings, PaymentInfo encoding, financial authorization, receipt proof, duplicate-submission protection or recovery storage. The existing monotonic receipt-block snapshot behavior remains intact: stale or failed reads cannot roll settlement back.

The new `PaymentGuidance` components only explain state and proposed actions; they do not decide permissions or submit transactions. Delivery evidence remains a seller claim, never a delivery guarantee or release authorization. Reviewers are trusted, fixed participants. Disputes do not extend expiry. Recovery needs a buyer transaction and gas. No insurance, chargebacks, decentralized arbitration or guaranteed refunds are offered.

## Branch and diagnostic preservation

The pre-change checks matched `master` at `f23ea57c0aca9a27c3d7494d68927b779b2c0832`: 22 commits, 472 tracked files, no tracked edits, no remotes and 54 untracked files. A private backup outside the repository preserves all 54 with relative paths, sizes and SHA-256 checksums; the original files remain in place. Its directory is restricted to the local user. The backup and its private inventory are not staged or published.

`backup/pre-public-ui-f23ea57` retains that exact original commit. A non-forcing `git branch -m master main` preserved HEAD and all 22 historical commits. New UI and documentation commits extend that history. Only individually reviewed paths are staged. The target remains **Alike001/dealza**, default/production branch **main**. Local branch naming does not itself configure GitHub's default branch.

Historical settlement evidence is unchanged. All new results are under [verification/public-ui-launch](verification/public-ui-launch/). The original `verify-ui-gate6-settlement.mjs` overwrites its historical destination and was not rerun in place.

## Verification

| Check                                        | Result / evidence                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-change frontend                          | 226 passed in the implementation baseline.                                                                                                                                                                                                                                          |
| Final frontend                               | **234 passed**: original 226 plus eight focused public-product regressions. [Log](verification/public-ui-launch/frontend-tests.txt).                                                                                                                                                |
| Default contracts                            | **46 passed**, including fuzz/invariants. [Log](verification/public-ui-launch/contract-tests.txt).                                                                                                                                                                                  |
| Pinned-chain forks                           | **36 passed**, isolated fork only. [Log](verification/public-ui-launch/fork-tests.txt).                                                                                                                                                                                             |
| Python scripts                               | **13 passed**. [Log](verification/public-ui-launch/script-tests.txt).                                                                                                                                                                                                               |
| TypeScript, ABI provenance, production build | **PASS**, Node 24.14.1, output `web/dist`. [Log](verification/public-ui-launch/production-build.txt).                                                                                                                                                                               |
| Browser layouts                              | Production preview at **320, 390, 768 and 1440px**: all five routes, no horizontal overflow; labelled fields and 44px navigation targets. [Evidence](verification/public-ui-launch/browser-layouts.json).                                                                           |
| Shared checkout                              | Genuine order `0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd`: Released / “Paid to seller,” **0 USDC reserved, 1 USDC captured**; original terms retained; reload passes without a wallet.                                                                     |
| Wallet/account/network                       | Real production frontend and RPC with an isolated identity-only adapter: wrong-network feedback, account-role update, completed-buyer no-release and draft navigation pass. Only account/chain reads permitted. [Evidence](verification/public-ui-launch/browser-identity.json).    |
| Pending transactions                         | Existing recovery tests plus a new route-navigation persistence regression pass. Genuine saved intents are reconciled by the live six-gate replay below.                                                                                                                            |
| Genuine historical receipts                  | **All six real UI checkout receipts PASS** through the unchanged gateway and live public RPC, including canonical routed-call verification and receipt-block financial effects. [Replay](verification/public-ui-launch/six-gate-replay.json). No signing/sending methods permitted. |
| RPC failure                                  | Temporarily aborted real RPC requests: retained verified settlement with an explicit stale-read warning and paused actions; removing interception and retrying restored current reads. [Evidence](verification/public-ui-launch/rpc-outage.json).                                   |

The audit before implementation encountered one history-test timeout (225/226 on that initial run); the isolated file and full rerun passed. The implementation baseline and final suites passed. A first build caught an unsupported Testing Library query option in a new test; it was corrected without weakening any assertion. [Original typecheck failure](verification/public-ui-launch/initial-build-typecheck-failure.txt). The final build passes. Vite retains the existing `node:worker_threads` externalization warning from the transitive `ox` dependency; the read-only browser checks complete without page errors.

Existing large application files remain larger than a suggested 300-line source limit to avoid refactoring verified financial state handling during a visual change. New presentation modules are split into smaller focused files. CSS is separated into landing and application polish styles; no styling library or dependency was added.

## Screenshots

Actual production-preview captures; no fabricated transactions or mock product images:

- Landing: [1440px](verification/public-ui-launch/landing-1440.png), [390px](verification/public-ui-launch/landing-390.png).
- Orders: [1440px](verification/public-ui-launch/orders-1440.png), disconnected empty state.
- Seller creation: [390px](verification/public-ui-launch/create-390.png), blank form.
- Genuine settled checkout: [1440px](verification/public-ui-launch/checkout-1440.png), [390px](verification/public-ui-launch/checkout-390.png).
- Retained settlement during an intentional [RPC failure](verification/public-ui-launch/rpc-failure.png).

History may be loading in a screenshot and remains explicitly bounded. An empty recent history window does not mean an order lacks older events. The replay independently verifies the genuine historical receipts and state.

## Reproduce locally

```sh
npm ci
npm test
npm run build
npm run abi:check
npm run preview --workspace web -- --port 4174
```

`web/scripts/check-public-ui.browser.js` is a Playwright function for production-preview layouts, screenshots and wallet-free settled-order refresh. Run it from the repository root with an isolated browser; adjust its local origin if necessary. Screenshots write only to the new public-UI evidence directory. Capture its returned JSON separately.

For the real historical receipt replay, run `npm run dev --workspace web -- --port 5174`, then execute the function in `web/scripts/replay-ui-checkout.browser.js` in an isolated Playwright page (strip its trailing semicolon when passing it as a function expression). Poll `window.__dealzaUIReplay.done` and serialize its result with BigInts converted to strings. The script refuses a preexisting pending intent, allows only `eth_accounts`/`eth_chainId` on its identity provider and never accesses MetaMask. `ui-replay-evidence.mjs` supplies authentic recorded context and is not imported by production. Save new runs separately; do not replace original settlement evidence.

## Publication readiness and remaining limits

**Local implementation and regression checks are ready for reviewed publication. Nothing is publicly published by this work.** No remote is configured. Verify access/history for `Alike001/dealza`, publish only reviewed `main` commits when separately authorized, and set/verify the GitHub default branch as `main`. Import into Vercel with root `.`, Node 24, `npm ci`, `npm run build`, output `web/dist` and production branch `main`. [Publication and public-origin acceptance procedure](28-PUBLIC-LAUNCH-RUNBOOK.md).

Public URL access, production-origin RPC/CORS, enforced hosting headers, and GitHub/Vercel settings remain pending until publication. The preview is not a public hosting acceptance test. The six-gate replay is not a new signed checkout. Physical mobile wallets, screen-reader acceptance, live signed reviewer decisions, funded cancellation and disputed-expiry recovery remain unaccepted; do not claim them from fixtures, forks or viewport emulation. No independent security audit or mainnet readiness is claimed.
