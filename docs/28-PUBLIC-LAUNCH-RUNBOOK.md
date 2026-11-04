# Public launch runbook — existing Base Sepolia demo

**Ready to publish the reviewed static frontend after manual authorization. No deployment or push has been performed.** All six real UI checkout gates are settled; [full proof](27-COMPLETE-REAL-UI-CHECKOUT.md). No backend, database, wallet secret, contract change, redeployment or extra payment is required.

## Shortest path: public GitHub repository, then Vercel

1. Review the final local commits and [public UI report](29-PUBLIC-UI-AND-MAIN.md). Local `main` preserves the original 22 commits; `backup/pre-public-ui-f23ea57` retains the original tip. All 54 historical untracked files were copied with checksums to a private directory outside the repository and remain unchanged locally. Never upload that backup or the entire working directory.
2. Verify the intended **Alike001/dealza** repository and access first. If absent, manually create an empty public repository without a conflicting README. If it already contains history, inspect it before integrating; do not overwrite it. No remote, repository creation, push, or default-branch change on GitHub was performed by this implementation.
3. When publication is separately authorized, connect the intended remote and publish the reviewed **main** branch without force. Verify GitHub’s default branch is **main**. In Vercel import that repository with root **`.`**, production branch **main**, Node **24.x**, and the exact settings below. Review the resulting deployment settings before manually starting publication.
4. Use the generated HTTPS `vercel.app` production URL first. A custom domain is optional and does not block the demonstration. Confirm the production URL is accessible in a signed-out/incognito browser without Vercel authentication.
5. Complete the public acceptance checks below, save the actual URL and screenshots, then use that URL and the genuine settlement receipt in the Vibeathon demo/submission.

## Production settings already prepared

| Setting             | Value                                                            |
| ------------------- | ---------------------------------------------------------------- |
| Root directory      | Repository root `.`                                              |
| Framework           | Other / `null` in existing `vercel.json`                         |
| Node                | **24.x**; `.nvmrc` and root package engine agree; tested 24.14.1 |
| Install             | `npm ci`                                                         |
| Build               | `npm run build`                                                  |
| Output              | **web/dist**                                                     |
| Browser RPC         | `VITE_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org`             |
| Log query maximum   | `VITE_RPC_LOG_BLOCKS=200`                                        |
| History page window | `VITE_HISTORY_BLOCKS=2000`                                       |
| Chain               | **Base Sepolia 84532**, existing pinned operator/CPP/USDC        |

The three `VITE_` values are public, build-time configuration. Defaults already match this table, so no environment entry is required for the first deployment. If the public RPC rate-limits the public origin, use another verified **public browser-accessible Base Sepolia endpoint**, test CORS/chain/history behavior and rebuild. Do not put a secret RPC credential, private key, seed phrase or server token in any `VITE_` variable.

`vercel.json` sets install/build/output and CSP, nosniff, referrer and Permissions-Policy headers. `web/public/_headers` supplies the equivalent static-host headers. Security policy permits HTTPS RPC requests and blocks third-party scripts/frames. Host-specific response/header enforcement still needs verification on the actual public URL.

This is hash routing: `/#/order/<full-id>?terms=...`. The server only serves `/`; no catch-all function or SPA rewrite is required. Keep the exact shared `terms` query to display the human-readable agreement; its fingerprint is checked against chain storage.

These settings follow current [Vercel configuration documentation](https://vercel.com/docs/project-configuration/vercel-json) and [Node version configuration](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). No Vercel CLI command, login, project creation or deployment was executed by this audit.

## Public acceptance — read-only, no new financial action

- Open home (`/#/`), orders (`/#/orders`), create/draft and help routes on the production URL. Reload them; shared order links must retain their hash/query. Check a narrow mobile viewport and copy/share behavior.
- Open `/#/order/0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd` with the original matching description: `Dealza Checkpoint 6: fresh UI-only 1 test-USDC checkout; controlled test, no physical delivery.` Expected: **Paid to seller**, **0 USDC reserved**, **1 captured**, fee **0**.
- Reload the settled checkout. Connect the named buyer only to inspect it; no signature or payment is needed. The completed order must expose no release/fund action. Wrong networks must remain blocked. Do not create a replacement order to test the existing result.
- Use **Load earlier activity** until the release appears. **Release recorded** and **USDC paid to seller** must link to `0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023`, block **54007444**. Recent history is explicitly incomplete until older pages load.
- Check browser Network/Console for public-origin RPC success, chain **84532**, CORS and CSP failures. Confirm public RPC reads can retrieve contract code, historical receipt/state and bounded logs. Verify actual `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` response headers.
- Temporarily block the RPC in browser DevTools: the last verified record must be labelled as such, financial actions paused, and retry must recover when reads return. A failed read must not imply failed settlement or trigger resubmission.
- Open the actual final transaction on an explorer. The UI's BaseScan URL contains the genuine hash; Blockscout is an independently checked alternative: https://base-sepolia.blockscout.com/tx/0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023.
- Save the actual public URL, commit/build identity, response-header evidence, settled checkout screenshot and console/RPC outcome. Until this is done, public-host acceptance is **PENDING**, even though the local production build passes.

## Demonstration scope and remaining risk

Ship this as a **controlled Base Sepolia testnet demonstration**. Show the exact buyer/seller, immutable terms, 1 USDC reservation, event-only seller acknowledgment and explicit buyer release. There was no physical delivery and no guaranteed refund after capture.

Dispute/reviewer return, funded seller cancellation and unresolved-dispute expiry reclaim pass local/fork/fixture checks. They have not completed live signed frontend acceptance. Additional live testing would require separately authorized fresh orders and transactions; none is authorized here. These are disclosure/acceptance limits for the demo, and blockers to claiming complete live coverage or production financial safety. Disputes never extend expiry; recovery requires a transaction and gas; the fixed reviewer cannot be replaced; USDC issuer controls remain an external dependency.

Physical mobile wallets, systematic wrong-network/account-switch/return behavior and independent security review remain outstanding. No mainnet deployment, server/indexer, new features or more contract development is needed to publish the existing demonstrated happy path.

## Alternative host

Cloudflare Pages can publish the same output: repository root, Node **24**, build **npm run build**, output **web/dist**, using copied `_headers` and the same hash URLs. Prefer one host for the first launch; do not add another infrastructure dependency merely to show this demo. Public-origin acceptance remains required on whichever host is chosen.

## Submission packet

Use the final public repository URL, public frontend URL, [six-gate proof](27-COMPLETE-REAL-UI-CHECKOUT.md), settled receipt, verified source links and a short video showing the actual app. Recheck the official Vibeathon 02 submission requirements/deadline in the organizer's current channel; the project's November 9 target is a planning date, not a newly verified official deadline. No submission was made by this audit.
