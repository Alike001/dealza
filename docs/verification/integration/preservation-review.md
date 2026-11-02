# Checkpoint 2 preparation preservation — November 2, 2026

Reviewed working tree based on frontend commit `f1458e9b621d66641c6cbdc65289cee9e301a529` and earlier contract checkpoint `2d611b0`. Initially nothing was staged; all pending changes were untracked preparation files. This local preservation commit adds public role configuration, the read-only/local-fork preparation tool, three safety tests, the integration report, and its historical evidence. Existing commits are retained.

## Fresh checks

| Command | Result |
| --- | --- |
| `npm test` | PASS: 44 tests across 3 files |
| `npm run build` | PASS: ABI/source provenance, TypeScript, and production bundle |
| `forge build` (in `contracts/`) | PASS: unchanged compilation; existing timestamp/event lint warnings |
| `forge test` | PASS: 46 tests, including fuzz tests and stateful invariants |
| `FOUNDRY_PROFILE=fork forge test` | PASS: 36 tests at pinned Base Sepolia block 53589971 |
| `python3 -m unittest discover -s scripts -p test_integration.py -v` | PASS: 3 safety tests |
| `python3 scripts/verify_protocol.py` | PASS: 77 pinned files and complete compiled CPP ABI |
| Source/dependency comparison against `f1458e9` | No changes in `contracts/src` or `contracts/vendor` |

The web build emitted a browser externalization warning for the transitive `node:worker_threads` import; it completed successfully. No financial contract logic was changed to address warnings.

## Secret and action review

Inspected all pending file contents, JSON fields, scripts, and evidence logs. Scanned for private-key blocks, secret assignments, credential-bearing URLs, and common provider tokens. No secret findings. Public role addresses, labeled runtime/creation hashes, and unsigned public creation bytecode are not signing credentials. No sensitive `.env` file is included; the existing tracked `web/.env.example` contains only the public RPC example. The final staged contents are checked again before commit.

The preparation tool exposes only `preflight` and `simulate`. Its public RPC method allowlist rejects send/sign/unlock/mutation operations. Mutable rehearsal calls target an internally started loopback Anvil instance; failed public prerequisites prevent that fork from starting. The three safety tests verify those restrictions and role validation. The complete named-wallet rehearsal remains unexecuted and unproven.

No live preflight or online protocol refresh was performed during this preservation review. Existing evidence files retain their original blocks and results. Passing fork tests establish behavior against a pinned historical snapshot, not current wallet readiness or real deployment success.

## Remaining deployment requirements

- Refresh funding preflight: historical block 53612382 showed zero test ETH for all four roles and 1 buyer test USDC, below the 3-USDC rehearsal minimum.
- Complete the named-role rehearsal and gas table after funding prerequisites pass.
- Deploy only after separate authorization, verify runtime/source, and record confirmed `operator`, `deploymentBlock`, and `deploymentTransaction` in `contracts/config/base-sepolia.deployment.json`; all three are currently null.
- Recheck the frontend against that actual deployment and retain real lifecycle receipts after separately authorized transactions.
- Connect/select the hosting project and publish only after separate authorization; retain a real public URL for the November 9, 2026 submission. Repository Vercel settings already exist. A custom public browser RPC is optional; frontend secret credentials are not required.

This review performed builds, tests, local Git preservation, and read-only RPC access for fork tests. No deployment, wallet signature, live transaction, funds transfer, GitHub push, or site publishing was performed. Deployment readiness remains NO-GO pending fresh evidence.
