# UI scope and launch plan

**Future scope only.** Checkpoint 1 implements contracts and local verification. No frontend, deployment, wallet connection, or live financial transaction has been performed. The original schedule below is planning context, not execution evidence. Current named-buyer order flow and the next-step gate are in `02-RELEASE-POLICY.md` and `05-CHECKPOINT-1-REPORT.md`.

## Screens (minimal)
1. Public landing: problem, three-step explainer, testnet-only disclaimer, CTA `Create order`.
2. Create order: seller connects wallet, sets amount in USDC, description (avoid private data), delivery deadline and agreed reviewer.
3. Order share link: `/order/<id>` anyone can open in read-only mode. Buyer sees vendor address, reviewer, amount, deadline, risk disclosures.
4. Checkout and status: buyer connects wallet, authorizes test USDC through CPP, sees actual `PaymentAuthorized` event and reclaim time.
5. Fulfillment/release: seller marks fulfilled with limited public proof; buyer approves release, seller receives funds; dispute path if enabled.
6. Public receipt: transactions with Base Sepolia explorer links, timeline and verifiable payment state.

## Stack
- Web: React + TypeScript + Vite + wagmi/viem (or Next.js if team already prefers it)
- Contracts: Solidity and Foundry, custom restricted operator + pinned audited Commerce Payments Protocol interfaces.
- Optional Postgres for product metadata only. Never treat DB as authoritative for transfer state; no private keys in web server.
- Deploy preview: Cloudflare Pages or Vercel. Base Sepolia first; no real funds or unaudited mainnet settlement.
- No AI, chatbot, MCP, chat bot payments, own token or paid third-party dependency in MVP.

## Suggested build schedule
Nov 2: finalize trust model and create repo. Local operator unit tests and read-only mock UX.
Nov 3-4: real CPP v1.1 testnet authorization and buyer release; analyze integration constraints.
Nov 5-6: order pages, wallet UX and onchain indexing / confirmation.
Nov 7: cancellation/expiry, dispute model (if safe), adversarial tests.
Nov 8: end-to-end test, mobile, accessible UI, public read-only receipts, judge README and video.
Nov 9: final test, polish, submit by 22:00 UTC. No code changes after locked deadline.

## Good defaults
- 0% product fee in MVP.
- Prefer plain HTML order fields + clear staged transaction progress, no superficial AI features.
- Do not support arbitrary tokens or chain switching until the testnet path passes.
- Warn that shipping disputes cannot be resolved automatically and the reviewer is trusted.
