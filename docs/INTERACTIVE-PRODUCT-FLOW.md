# Interactive agreement and checkout redesign

Implemented locally on `main`. No Solidity, ABI, deployment configuration, transaction gateway, receipt verification, hash scheme or financial permission rules changed. No signing, broadcasting, funds, push or deployment was used.

## Screenshots and demonstration

| Screen | Before | After |
| --- | --- | --- |
| Creation | [Long form](verification/interactive-redesign/before-create.png) | [Single active stage](verification/interactive-redesign/after-create-1440.png) |
| Checkout | [Existing checkout](verification/interactive-redesign/before-checkout.png) | [Guided checkout with authentic settled state](verification/interactive-redesign/after-checkout-1440.png) |
| Mobile review | — | [320px review](verification/interactive-redesign/review-320.png) |

Creation walkthrough:

1. [Agreement details](verification/interactive-redesign/flow-1-details.png): describe delivery and review expectations, enter an exact USDC amount. Continue validates description and amount.
2. [People involved](verification/interactive-redesign/flow-2-people.png): identify the buyer and agreed reviewer. Seller identity comes from the connected wallet. All three must differ.
3. [Payment deadlines](verification/interactive-redesign/flow-3-deadlines.png): device timezone, absolute deadlines, signing buffer and existing 30-day limit. Refresh restores editable fields and safe progress, capped at this stage.
4. [Review and create](verification/interactive-redesign/review-1440.png): dedicated immutable terms and fingerprint review, with edit links to every earlier stage and an explicit Base Sepolia creation action.
5. Confirmed and sharing: the existing gateway must finish its verified creation path before the share link appears. The authentic transaction hash links to its explorer receipt. Submission alone never shows success. A previously reconciled creation retains the existing verified-order recovery path rather than inventing a receipt.

The browser demonstration stops before the final blockchain action. The complete five-stage transition, including awaiting wallet → submitted without success → verified confirmation and receipt link, is exercised by `wizard.test.tsx`. Its gateway fixture is isolated to tests and is not evidence of a new live creation. No screenshot or new receipt purports to show a live creation performed during this redesign.

Run the complete automated creation demonstration with:

```sh
npm run test --workspace web -- src/test/wizard.test.tsx
```

Checkout now has a five-part payment journey based on the verified snapshot, followed by the existing role-specific actions. Exact allowance, payment pre-approval and reservation remain separate transactions. The amount, participants, deadlines, TokenStore location, financial status and receipt history remain visible. Dispute confirmation explains the running expiry clock; reviewer decisions confirm the full amount, exact recipient and irreversible outcome separately. Cancellation, reviewer return, protocol expiry recovery and recovery-record synchronization remain distinct.

## Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Frontend, including script safety tests | 256 passed, 15 files | [Frontend log](verification/interactive-redesign/frontend-tests.txt) |
| Production build, TypeScript and ABI provenance | Passed | [Build log](verification/interactive-redesign/build.txt) |
| Solidity, fuzz and invariants | 46 passed | [Solidity log](verification/interactive-redesign/solidity-tests.txt) |
| Historical Base Sepolia fork suite | 36 passed | [Fork log](verification/interactive-redesign/fork-tests.txt) |
| Python scripts, including pre-existing untracked tests | 13 passed | [Script log](verification/interactive-redesign/script-tests.txt) |
| Details, people, deadlines, review and live checkout at 320, 390, 768, 1440px | All 20 checks fit without horizontal overflow | [Browser checks](verification/interactive-redesign/browser-checks.json) |
| Original untracked artifacts | All 84 unchanged, SHA-256 checked | [Preservation manifest](verification/interactive-redesign/preservation.json) |

Commands:

```sh
npm run test --workspace web -- --maxWorkers=2
npm run build
(cd contracts && forge test)
(cd contracts && FOUNDRY_PROFILE=fork forge test)
python3 -m unittest discover -s contracts/scripts -p 'test_*.py'
```

The frontend suite uses two workers to avoid existing five-second UI test timeouts under host contention. Tests retain account/network/deployment isolation, signature rejection, deadlines expiring after review, pending recovery, receipt replacement, EIP-7702 compatibility, mismatched terms/state and duplicate prevention coverage. Nine focused wizard/progress tests add single-stage validation, focus, Back navigation, refresh progress, corrupt progress, dedicated review editing, submitted-versus-confirmed sharing, chain-derived payment progress and settled-expiry wording. Existing creation tests now navigate the wizard while retaining their safety assertions.

The browser used only account and chain-ID requests through a provider that rejects all signing/broadcast methods. Completed-payment screenshots use authentic public chain reads and the existing six recorded receipt links. The observed state was paid to seller, 1 USDC captured and zero reserve. The provider represents identity for presentation checks, not possession of the account or a real wallet-extension test.

Prettier and `git diff --check` pass. The build retains the existing viem/ox optional `node:worker_threads` browser-externalization warning; the application builds successfully. No new dependencies were added.

## Checkpoint 8 preservation and re-entry

The v2 editable draft schema and its account/network/deployment storage key are unchanged. Progress uses a separate `:progress` key. Unknown fields, signatures, transaction success and reviewed authorization are never restored. Switching wallet, network or deployment remounts creation state; returning to the original scope restores that scope's editable draft. Earlier invalid fields prevent a progress hint from skipping them.

All original untracked Checkpoint 8 files remain byte-for-byte intact. This environment cannot certify the contents of the user's separate browser profile, but the storage format remains compatible and safe re-entry was demonstrated locally with:

- Seller: `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`
- Buyer: `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`
- Reviewer: `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548`
- Amount: `1` test USDC
- Description: `Dealza Checkpoint 8: buyer dispute and reviewer return; controlled test, no physical delivery.`
- Fingerprint: `0xccd6ceec3d964158dcbaa50098864f3879fa227175ee1283189a9417e67b6d32`

The original reserve deadline, **2026-11-06 17:00 UTC**, has passed. Its review deadline was **2026-11-08 17:00 UTC**. Do not submit those stale reserve terms. For an uncreated draft, explicitly choose fresh future deadlines in the device timezone, review them again and check existing orders/pending requests before creating. This does not alter an existing onchain agreement. The walkthrough used fresh dates without touching the historical evidence or production browser storage.

## Manual acceptance on Base Sepolia

These are instructions for a later, separately authorized wallet session. No wallet-enabled step below was executed here.

1. Start `npm run dev --workspace web -- --port 5173`, open the printed local URL and use `#/create`. Confirm Base Sepolia chain ID **84532**, operator **0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8**, and the intended seller account. Use test assets only.
2. Enter the Checkpoint 8 description and amount `1`. Try amount `0`, more than six decimal places and whitespace-only terms; Continue must show feedback and remain on details. Enter valid details and advance.
3. Enter the buyer and reviewer above. Try duplicate and incomplete addresses; Continue must remain on people. Correct them, advance, then use Back and confirm every field is preserved.
4. Choose reserve time tomorrow and review time three days from now using the displayed device timezone, both within 30 days. Try a past reserve time and an expiry beyond 30 days; review must be blocked. Compare absolute deadline output with the date inputs.
5. Refresh and reconnect the same seller: progress and fields return, but signing authorization and success do not. Switch to the buyer or another network: seller review must disappear. Return to the seller on Base Sepolia: only that scope's draft returns. A pending request must block duplicate submission and remain available in the existing recovery UI.
6. Open Review. Confirm the exact amount, all three full addresses, deadlines, fee and description fingerprint. Use every Edit link, change a field and review again. The form must not remain appended above the review. Reach the final blockchain button and stop here for a no-transaction acceptance pass.
7. **Only in the later authorized wallet session:** click Create and reject the first request. Expect a rejected message, no success link and retained draft. Retry only after checking pending recovery. After approving a real creation, submission must remain pending; sharing appears only after the gateway verifies the receipt and terms. Open the actual receipt and share link. Repeated clicks must not create duplicate requests.
8. Open the share link as the named buyer. Confirm the linked description matches its hash, seller, reviewer, amount, reserve deadline and release/review deadline. Alter the linked terms in a separate URL and check that the verification warning appears; do not proceed with altered terms. A different wallet must not receive buyer-only actions.
9. Review and acknowledge the terms. First grant **exactly 1 USDC / 1,000,000 raw units** to collector **0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea**. Reject once and check no progress advance. On a later approved transaction, wait for verified allowance. Separately pre-approve the terms; wait for verification. Separately reserve USDC; wait for the verified reserve. No step may advance solely because a button or wallet confirmation was clicked. Seller is not paid by reservation.
10. As seller, submit a delivery reference if desired. The UI must identify it as a hashed claim, not proof of delivery. As buyer, open a dispute before expiry, inspect the running-clock warning and agreed reviewer, then confirm the separate dispute transaction. Ordinary buyer release must become unavailable only after verified state changes.
11. As the agreed reviewer on the disputed agreement, inspect **Return to buyer** and **Pay seller** separately. Confirm exact recipient, full `1 USDC` amount and outcome before any signing. A different wallet, an undisputed agreement or expired state must not expose unauthorized decisions. Exercise the two mutually exclusive outcomes on separate authorized test agreements. A reviewer payment is irreversible through Dealza.
12. On a separate authorized short-deadline agreement, let uncaptured funds expire, including a disputed case. Release/reviewer actions must close. Only the named buyer may reclaim through the protocol. Confirm verified recovery before any recovery-record sync. Cancellation, protocol return and expiry recovery must retain distinct labels and permissions. Captured funds must never be offered as an expiry refund.
13. During any authorized pending transaction, refresh or change accounts and use the existing recovery panel; reconcile the authentic hash before retrying. Verify receipts and final state after reconnect, including a wallet using EIP-7702 when available. No success may be inferred from submission or a replacement without financial-effect verification.

## Usability limits

Wallet addresses remain the source of identity; no new contract fields or invented person names were introduced. Mobile history and full immutable terms require vertical scrolling. Refresh still requires reconnecting the wallet, and pending requests must be reconciled rather than resubmitted. Live wallet rejection and creation were tested with isolated fixtures; this run intentionally did not perform a real creation or fund movement. A manual screen-reader pass and real wallet-extension session remain useful acceptance checks beyond the keyboard/focus and responsive checks performed here.

Git status after the local commit is recorded in [git-status.txt](verification/interactive-redesign/git-status.txt). The original untracked historical files are deliberately excluded from the commit.
