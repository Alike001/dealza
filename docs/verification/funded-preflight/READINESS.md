# Funded-wallet deployment preflight — 2026-11-02

**NO-GO for controlled DealzaOperator deployment.** Funding is now sufficient and all three funding transfers succeeded. The named-wallet rehearsal stops at the existing non-EOA gate because the deployer acquired an EIP-7702 delegation. Wallet-specific deployment simulation and a successful complete rehearsal remain required. Do not disable this gate or treat a constructor call as wallet integration acceptance.

## Current balances and account state

Base Sepolia chain 84532, block **53654038**, **20:51:16 UTC**, in [preflight.json](preflight.json). The independent rehearsal attempt at block **53654648**, **20:53:18 UTC**, reports the same balances and blocker.

| Role | Address | ETH | Circle test USDC | Nonce | Account code bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| Deployer | `0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a` | 0.00983 | 20 | 1 | 23 |
| Buyer | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25` | 0.00010 | **21** | 0 | 0 |
| Seller | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf` | 0.00005 | 0 | 0 | 0 |
| Reviewer | `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548` | 0.00002 | 0 | 0 | 0 |

USDC is unpaused, has 6 decimals, and none of the roles is blacklisted. Buyer collector allowance is zero. Buyer has 21,000,000 raw USDC units. No additional funding is indicated by the current preflight; measured full lifecycle gas totals are still unavailable.

## Three successful funding transfers

The transactions were sponsored wallet executions, rather than three ordinary transactions originating from the deployer. The deployer lost exactly the three transfer values, totaling 0.00017 ETH; participant balances increased by the planned values. Its nonce must not be assumed to be 3.

| Recipient | ETH | Block | Successful transaction |
| --- | ---: | ---: | --- |
| Buyer | 0.00010 | 53651964 | [0x527c…a2fd](https://sepolia.basescan.org/tx/0x527c272367e67027c28af9a767d138104a68c3bdeb667adf371f4e0ef992a2fd) |
| Seller | 0.00005 | 53652140 | [0x23b1…c4f1](https://sepolia.basescan.org/tx/0x23b128f24fc7fc9054e33c130ededaf5dd22d5a34b786c89c2b154cadb6ac4f1) |
| Reviewer | 0.00002 | 53652412 | [0x3fca…fe70](https://sepolia.basescan.org/tx/0x3fca3aa7446c41a9f332c900d5a8d6c1bfc01b6d7d53af3a732f3bcb4dfafe70) |

[funding-receipts.json](funding-receipts.json) preserves canonical status-1 receipts, matching wallet/recipient/value calldata, and exact sender/recipient native balance changes between each funding block and its parent. Historical blocks and receipts agree on block hashes. All have thousands of L2 confirmations at the balance snapshot; **none was yet at the RPC's `finalized` block 53649053** when checked. Internal traces are not claimed: the default RPC rejects `debug_traceTransaction`, and the alternate public endpoint does not expose it. State transitions and receipt evidence establish the successful funding.

## Exact runtime, constructor, and gas

The reviewed source, vendor tree, ABI, dependency lock, and Foundry configuration have no differences from `2d611b0`. The rebuilt creation bytecode also exactly equals the prior reviewed funding preparation artifact. [deployment-estimate.json](deployment-estimate.json) records a fresh **nonzero-price** public `eth_call` and `eth_estimateGas` at block **53655033**.

- Constructor arguments `[]`; value 0; creation code 9,994 bytes; returned runtime exactly matches all 9,586 artifact bytes.
- Creation SHA-256: `45d2044b191500c9e097982f436a27cad6eb8105f72e161cd59946b854d6094a`.
- Runtime Keccak-256: `0xadbc98ddf155ec9a93328c11d78ff7fe2aeb180cc74bd34222e4313584b2374d`.
- solc 0.8.28, Cancun, via IR, optimizer 100000.
- Execution gas **2,144,685**; proposed 25% buffered limit **2,680,857**.
- Snapshot gas price **6,000,000 wei (0.006 gwei)**; proposed legacy gas price **12,000,000 wei (0.012 gwei)**.
- Oracle L1 upper bound **619,095,836,610 wei**, with creation length plus conservative 128-byte envelope; operator fee at buffered gas 0.
- Estimated execution plus L1 upper bound: **0.000013487205836610 ETH**.
- Buffered gas limit at twice snapshot gas price, plus twice L1/operator estimates: **0.000033408475673220 ETH**. Deployer balance **0.00983 ETH** is sufficient. This is a snapshot cushion, not a future maximum or a wallet-envelope quote.
- Confirmed and pending deployer nonce both **1** at this check. The unsigned direct-CREATE proposal is diagnostic only; it does not validate the sponsored wallet route.

## Rehearsal blocker and required next preparation

The deployer code is `0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b`: an EIP-7702 delegation designator targeting **`0x63c0c19a282a1b52b07dd5a65b58948a07dae32b`**, whose runtime has 11,185 bytes. See [public delegation evidence](deployer-delegation.json) and the [EIP-7702 specification](https://eips.ethereum.org/EIPS/eip-7702), which defines this prefix and permits delegated EOAs to originate transactions. The target implementation and wallet execution/signing route have not been reviewed by this preflight. Delegation alone does not prove that deployment is impossible or that the wallet is compromised.

Both named-wallet commands were actually run from `contracts/`:

```sh
python3 scripts/integration.py preflight --output ../docs/verification/funded-preflight/preflight.json
python3 scripts/integration.py simulate --output ../docs/verification/funded-preflight/rehearsal-attempt.json
```

Both exit **2** with the sole blocker: `deployer is not a plain EOA; wallet-specific transaction simulation is required`. No mutable rehearsal fork starts after that failure. No successful lifecycle rehearsal, participant gas totals, local lifecycle receipts, or actual operator deployment is claimed.

Next, identify the existing wallet's supported contract-creation/signing mechanism without accessing secrets; inspect its delegation implementation and execution envelope; add and validate a narrowly scoped wallet-specific simulation path while retaining rejection of unsupported account code. Then rerun the complete named-wallet rehearsal against actual balances, including gas for buyer recovery. If the supported mechanism uses wallet-internal CREATE instead of an EOA creation transaction, refresh the creator/address, nonce semantics and full envelope fees accordingly. Do not clear delegation, change signer, fund another wallet, or send a transaction as part of this preparation.

The intended funding/signing role remains deployer `0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a`; an actual deployment command is **not approved as ready** while this route is unresolved. A generic `forge create --account …` command would assume a keystore and signing path that have not been established. No keys or keystores were inspected.

After the gate passes and separate deployment authorization, require a genuine successful receipt; compare full onchain runtime to the artifact; verify source using the exact compiler/settings and no constructor arguments; read `ESCROW`, `COLLECTOR`, `USDC`, `CHAIN_ID=84532`, and `MAX_DURATION=2592000`; only then populate the actual address/block/hash in deployment configuration. Reference: [official Foundry deployment documentation](https://getfoundry.sh/forge/deploying/); installed `forge create --help` and `forge verify-contract --help` were also checked. Context7 MCP tools were unavailable in this session.

## Verification and preservation

| Check | Result |
| --- | --- |
| Foundry build | PASS, existing lint warnings |
| Local contract tests | **46 passed**, no failures/skips |
| Historical pinned fork tests | **36 passed**, no failures/skips; block 53589971, distinct from current-wallet rehearsal |
| Preparation reader/gate safety tests | **5 passed**, including rejection of public mutations/signing |
| Online protocol verification | PASS, pinned source/full ABI and escrow/collector/TokenStore executable matches, Circle USDC checks |
| Frontend tests | **44 passed** |
| Frontend production build | PASS, ABI provenance/TypeScript included; existing optional Tempo worker warning |
| Named-wallet preflight / rehearsal | **NO-GO**, delegated deployer requires wallet-specific simulation |

Evidence logs are adjacent to this report. No financial contract logic, dependency/configuration settings, frontend source, or deployment identity changed. The deployment configuration remains null. Existing commits `2d611b0`, `f1458e9`, and `26d1157` are preserved; this preparation and the previously untracked funding-refresh evidence are retained in a separate local follow-on commit. No amend/rebase/reset/push is part of this work.

No live signing, broadcast, spending, deployment, delegation change, secret access, or publishing occurred. Real receipt-based lifecycle acceptance and frontend publication remain outstanding before claiming a functioning published integration for Vibeathon 02.
