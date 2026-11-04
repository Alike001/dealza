# Judge-ready UX release — 4 November 2026

Local UX polish for **Alike001/dealza**, branch **main**. Public website: **https://dealza-drab.vercel.app/**. This work does not push, deploy, sign or broadcast transactions. The public acceptance checks below apply to the existing deployed version; the polished version was tested in production preview.

## Changes

- Direct wallet buttons replace the select-plus-connect flow. EIP-6963 names and provider object identity are preserved; late announcements improve fallback names without duplicating providers. Legacy provider labels use each provider’s own flag. Discovery makes no account requests and never connects automatically, including to already-authorized accounts. After refresh, choose the wallet again.
- Connecting, declined, failed and connected feedback; exact account chip; network feedback; Base Sepolia public balances with retry; full address copy and truthful clipboard failure feedback. Disconnect invalidates in-flight identity reads. Account/network changes clear uncertain identity before reading it again. Listeners are removed on provider changes and unmount. A pending connection cannot be submitted twice.
- Panel closes on successful connection, Escape, outside pointer, navigation or focus leaving. Escape and successful connection return focus to the trigger while outside actions keep their own focus. Mobile panels fit within the viewport and scroll vertically.
- Cream/forest-green identity retained. Hero switches to one column before the illustration becomes cramped; smaller illustration text/padding, clear CTA hierarchy, compact mobile navigation, active navigation and hover/focus states. FAQ uses native keyboard-accessible disclosures. No dependencies or decorative animation added.
- **View a real completed payment** on home, orders, help and footer opens the genuine order `0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd` with its exact original matching terms: `Dealza Checkpoint 6: fresh UI-only 1 test-USDC checkout; controlled test, no physical delivery.`
- Completed checkout says **Payment complete** and exposes six direct historical receipt links, sourced from the existing canonical gate evidence. These links do not replace onchain state, the gateway or dynamic history. New/other orders do not receive recorded-test receipts. No fake transaction records or physical-delivery claims.
- Help offers a two-minute read-only judge walkthrough and local-draft path. Existing checkout guidance continues to distinguish connection, exact allowance, terms preapproval, reservation, seller delivery claim, buyer release, reviewer action and expiry recovery. Submitted requests still require canonical receipt/effect verification before success.
- README records the public website/repository, operator, network, genuine settlement and limitations, and removes stale claims that publication is outstanding.

## Verification performed

| Check                                       | Result                                                                                                                                                                    | Evidence                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Frontend baseline before edits              | 234 passed                                                                                                                                                                | [Baseline log](verification/judge-ready/baseline-frontend-tests.txt)                                                  |
| Final frontend                              | **247 passed** (13 new regressions)                                                                                                                                       | [Log](verification/judge-ready/frontend-tests.txt)                                                   |
| Contracts                                   | **46 passed**                                                                                                                                                             | [Log](verification/judge-ready/contract-tests.txt)                                                   |
| Forks                                       | **36 passed**, local fork execution                                                                                                                                       | [Log](verification/judge-ready/fork-tests.txt)                                                       |
| Python                                      | **13 passed**                                                                                                                                                             | [Log](verification/judge-ready/python-tests.txt)                                                     |
| Production build / TypeScript               | PASS                                                                                                                                                                      | [Log](verification/judge-ready/production-build.txt)                                                 |
| ABI/source provenance                       | PASS                                                                                                                                                                      | [Log](verification/judge-ready/abi-check.txt)                                                        |
| Home, orders, create, help, shared checkout | All at **320, 390, 768, 1440px**, no horizontal overflow; labelled fields and 44px nav targets                                                                            | [Layouts](verification/judge-ready/browser-layouts.json)                                             |
| Genuine completed checkout                  | Matching terms/participants, Released / Paid to seller, **0 reserved / 1 USDC captured**, wallet-free refresh PASS                                                        | Layout evidence and screenshots below                                                                |
| Historical live receipt replay              | All **six** genuine receipts verified through unchanged gateway; saved pending intents reconciled and cleared; final state checked live                                   | [Replay](verification/judge-ready/six-gate-replay.json)                                              |
| Wallet/provider/account/network             | Simulated EIP-6963 MetaMask/Rabby choices, zero initial requests, account switch, wrong network, disconnect/provider switch and viewport fit PASS                         | [Simulated browser evidence](verification/judge-ready/browser-wallet-simulated.json), frontend tests |
| Errors and keyboard                         | Actual Chromium FAQ Enter open/close, six genuine receipt links, induced RPC failure retains verified settlement and pauses actions; restored RPC recovers                | [Interactions](verification/judge-ready/browser-interactions.json)                                   |
| Public production URL                       | HTTP 200, wallet-free completed order and refresh PASS; public-origin JSON-RPC/CORS succeeds with chain `0x14a34`, 47 observed RPC responses all HTTP 200, no page errors | [Public acceptance](verification/judge-ready/public-acceptance.json)                                 |
| Public security headers                     | CSP, HSTS, nosniff, referrer-policy and permissions-policy present                                                                                                        | [Fresh HEAD response](verification/judge-ready/public-headers.txt)                                   |

Tests cover declined/failed connection, pending connection, exact provider identity, account/network events, stale reads after disconnect, balance retry/copy, dismissal/focus, explicit selection, genuine order link and recorded receipt scoping. Existing suites retain strict authorization, transaction verification, replacement and durable pending recovery coverage. The live replay is read-only reconciliation of historical transactions, not a newly signed checkout.

Two initial preview checks used a tab retaining an asset reference across a concurrent rebuild and hit a missing old chunk. A fresh document against the completed build passes; this was a local verification setup issue, not an RPC failure. An initial FAQ keyboard assertion failed because the unit-test DOM does not emulate native summary keyboard activation. The unit test uses native click activation; real Chromium separately verifies Enter opening and closing. Final tests pass. The existing transitive `ox`/`node:worker_threads` build warning remains; production-preview acceptance has no page errors. The RPC-outage check intentionally generates failed network requests.

## Screenshots

All new captures are actual application pages. The wallet screenshot alone uses explicitly simulated provider discovery.

- Landing: [1440px](verification/judge-ready/landing-1440.png), [390px](verification/judge-ready/landing-390.png).
- Orders: [1440px](verification/judge-ready/orders-1440.png).
- Create: [390px](verification/judge-ready/create-390.png).
- Genuine completed checkout: [1440px](verification/judge-ready/checkout-1440.png), [390px](verification/judge-ready/checkout-390.png).
- [320px wallet choices — simulated providers](verification/judge-ready/wallet-simulated-320.png).
- [Retained settlement during induced RPC outage](verification/judge-ready/rpc-failure.png).
- [Existing public checkout](verification/judge-ready/public-checkout.png), before deployment of this polish.

History remains bounded and explicitly incomplete until older windows are read. Screenshots may show history loading. Direct recorded receipt links make the genuine test evidence inspectable immediately without manufacturing history events.

## Preservation and reproduction

Started at `36e5899` on `main`, no tracked edits; fetched `origin/main` and verified **0 ahead / 0 behind**. The historical backup branch and all existing commits remain. The original **54 untracked diagnostic files** were inventoried and SHA-256 checked before/after; none are staged, modified or removed. Historical payment evidence remains unchanged. New evidence is isolated under `docs/verification/judge-ready/`.

No changes to Solidity, CPP bindings, verified addresses, deployment records, generated ABIs, payment authorization requirements, gateway/receipt proof, transaction submission or recovery storage. Wallet adapter changes concern explicit provider choice, identity lifecycle and presentation. No wallet upgrade, EIP-7702 delegation, signing flow, new payment or deployment.

```sh
npm test
npm run build
npm run abi:check
npm run preview --workspace web -- --port 4174
cd contracts
forge test
FOUNDRY_PROFILE=fork forge test
cd ..
python3 -m unittest discover -s contracts/scripts -p 'test_*.py'
```

For viewport/refresh reproduction, run the existing Playwright function `web/scripts/check-public-ui.browser.js` against a fresh preview document, changing its output directory from `public-ui-launch` to a **new** destination; never overwrite historical evidence. For live receipt reconciliation, use `web/scripts/replay-ui-checkout.browser.js` against the dev server at 5174 in an isolated context and save `window.__dealzaUIReplay` separately. The provider rejects every signing/sending method. It does not access MetaMask.

## Suggested GitHub metadata

Prepared only; repository metadata was not changed.

**Description:** Base Sepolia USDC payment agreements for social commerce, with explicit buyer release, a named reviewer, and verifiable onchain receipts.

**Website:** https://dealza-drab.vercel.app/

**Topics:** `base`, `base-sepolia`, `usdc`, `commerce-payments`, `solidity`, `react`, `typescript`, `vibeathon`, `social-commerce`.

## Publication readiness and limits

Ready for reviewed publication as a **Base Sepolia controlled-test demo**. Push/deploy are manual and were not performed. Public checks confirm the existing live release; deployment of these local commits requires a new public smoke check afterward.

No actual MetaMask extension, second real injected wallet, physical mobile wallet, WalletConnect or external mobile-wallet handoff was tested in this pass. Those integration paths are not claimed from simulated providers or viewport emulation. The earlier genuine six-step MetaMask checkout remains the actual-wallet evidence. No screen-reader acceptance, independent security audit, or newly signed cancellation/reviewer/disputed-expiry acceptance is claimed. Reviewer trust, nonautomatic expiry recovery, post-capture refund limitations, public terms/records and USDC issuer controls remain unchanged.
