# Agreement wizard UX polish

Base: `main` at `fb95368`. This pass preserves the existing five-stage design.

Changes:
- Readable active-step label and completion count; completed checks and mobile step targets of at least 44×44px.
- Wallet panel capped at 560px and the available viewport height, with a short-viewport fallback, a visible heading/close control, and keyboard scrolling to all actions.
- Live preview includes the buyer, agreed reviewer and selected deadlines. Addresses wrap; long preview terms clamp to five lines. Editable terms and the final review retain the full text.
- Final review groups agreement details, participants, deadlines and financial safeguards.
- Draft actions use a native disclosure; autosave status remains visible. Persistence and recovery code are unchanged.
- Step transitions focus the heading and immediately scroll progress into view. Initial heading focus retains normal browser scrolling. Forms no longer stretch to match a taller preview column.

## Verification

- Frontend: **258/258 tests, 15/15 files passed**, with `npm run test --workspace web -- --maxWorkers=1 --testTimeout=15000`. An earlier concurrent run hit 5-second timeouts; its log is retained as `frontend-tests-resource-contention.txt`. No repository timeout settings were changed.
- Additional wizard assertions cover completion, reviewer/deadline preview, review grouping, keyboard navigation, draft disclosure, and verified confirmation focus. See `wizard-tests.txt`.
- TypeScript: `npx tsc --noEmit -p web/tsconfig.json`.
- Production: `npm run build`, including the ABI provenance check and TypeScript check. The existing `ox`/`node:worker_threads` externalization warning remains unchanged from the base build.
- Chromium: details, people, deadlines and final review at **320×740, 390×844, 768×1024 and 1440×900**; no horizontal overflow, and all checked wizard controls meet 44px minimum dimensions.
- Keyboard: Enter to advance/edit/back, visible heading focus and scroll position, Tab from heading to buyer input, native draft disclosure and Save, wallet Tab traversal, and Escape returning focus to the wallet trigger. Existing unit tests also cover wallet dismissal on outside pointer/focus, account/network changes, pending permissions and connection errors.
- Wallet: checked at all four sizes plus **390×400**. Heading starts fully visible; keyboard navigation reaches all actions within the scrolling panel.
- axe-core 4.10.3: WCAG A/AA/2.1 AA and best-practice checks on all 16 wizard/viewport combinations and all five wallet sizes. **No detected WCAG violations; zero wallet violations.** One pre-existing best-practice finding remains: `.testnet-bar` is outside a landmark. Axe marks some color-contrast checks incomplete; visual inspection supplements the automated checks and does not constitute a full assistive-technology audit.
- `protected-paths.txt` confirms all **84 historical untracked files** have identical SHA-256 hashes and that `contracts/` and `web/src/lib/` have no changes from `fb95368`. Financial validation, terms hashing, immutable parameters, wallet protections, pending transactions and receipt verification are unchanged.

## Evidence and limits

`browser-check.js` is a Playwright MCP function. It requires a local development server at `http://127.0.0.1:5173` and axe-core 4.10.3 at `/tmp/dealza-wizard-axe.min.js`. Run it using `browser_run_code_unsafe` with its filename, then save `window.__polishReport` using `browser_evaluate` to `browser-checks.json`.

Screenshots use an explicitly simulated identity-only wallet. Its provider rejects every method except account and chain reads. RPC balance reads are read-only. No signing, broadcasting, new onchain creation, push or deployment occurred. The confirmed sharing stage is covered by isolated gateway tests, not a new live transaction.

Representative screenshots: `details-390.png`, `deadlines-1440.png`, `review-320.png`, `review-390.png`, `review-768.png`, `review-1440.png`, `wallet-320x740.png`, and `wallet-end-390x400.png`. Long-text stress evidence is retained separately.

The final Checkpoint 8 dispute/refund transaction remains an operator task. This polish pass does not execute it. Real extension popups, mobile wallet in-app browsers, touch hardware, other browser engines and screen readers were not exercised.
