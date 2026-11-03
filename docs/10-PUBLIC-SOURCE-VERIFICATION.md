# DealzaOperator public source verification

**PASS: publicly source-verified on Sourcify and Base Sepolia Blockscout. BaseScan-specific verification remains unconfirmed.**

Contract: `0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8`, Base Sepolia chain **84532**. Existing deployment transaction: `0x73c6b79e93387e6e0f69ceae5185f6a9049ef8fbb2526ada2c70f145e1b96fe1`, block **53676176**.

Public sources:

- [Verified contract on Blockscout](https://base-sepolia.blockscout.com/address/0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8?tab=contract).
- [Sourcify source repository](https://repo.sourcify.dev/84532/0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8).
- [Sourcify actual verification response with sources and metadata](https://sourcify.dev/server/v2/contract/84532/0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8?fields=all).
- [BaseScan contract page](https://sepolia.basescan.org/address/0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8#code): link provided for reference; source verification on this explorer is **not confirmed**.

## Actual results

Before submission, Sourcify returned HTTP 404 and Blockscout returned deployment bytecode without verified-source fields. BaseScan's page returned HTTP 403; the Etherscan V2 keyless source lookup returned HTTP 200 with `status: "0"`, `message: "NOTOK"`, `result: "Missing/Invalid API Key"`. No Etherscan API key was available in the process environment, and no secret files were opened.

Foundry's Sourcify submission completed with job `dcf52633-c6b0-4a2b-9907-6313185a418b`. Success was then independently checked through fresh public GET requests, rather than inferred from submission:

| Verifier | Returned verified-source result |
| --- | --- |
| Sourcify | `match`, `creationMatch`, and `runtimeMatch` all **`exact_match`**; verified **2026-11-02T22:35:54Z** |
| Sourcify deployment | Actual address/chain, deployment transaction, deployer, and block 53676176 agree with the saved deployment evidence |
| Sourcify sources | All **15** returned source contents match the local compilation closure and metadata Keccak hashes |
| Sourcify bytecode | Returned onchain and recompiled creation/runtime bytes exactly equal the reviewed local artifact, including metadata |
| Sourcify metadata | Returned metadata equals the artifact's original parsed `rawMetadata` |
| Blockscout | `is_verified: true`, `is_fully_verified: true`, `is_partially_verified: false`; verified **2026-11-02T22:36:08.971497Z** |
| Blockscout sources and ABI | Operator source, all 14 dependency sources, complete ABI, and complete creation/runtime bytecode match local files/artifact; ABI comparison normalizes top-level entry order only, preserving every field |
| BaseScan / Etherscan | **UNCONFIRMED**. Sourcify's automatic Etherscan forwarding returned **`Daily limit of 500 source code submissions reached`** |

Sourcify also forwarded the verification to Blockscout. Blockscout's returned source data confirms the resulting verification; forwarding alone was not treated as success. The Etherscan forwarding error does not invalidate the confirmed Sourcify/Blockscout matches.

Saved evidence: [Sourcify result](verification/public-source/sourcify-after.json), [completed job and external verifier outcomes](verification/public-source/sourcify-job.json), [Blockscout result](verification/public-source/blockscout-after.json), [Foundry log](verification/public-source/sourcify-forge-attempt.txt), and [validated artifact/source inspection](verification/public-source/artifact-inspection.json). Initial failed/unverified responses are preserved alongside them.

## Exact pinned compilation

| Setting | Value |
| --- | --- |
| Compiler | Solidity **0.8.28+commit.7893614a** |
| Contract target | `src/DealzaOperator.sol:DealzaOperator` |
| Optimizer | Enabled, **100000** runs |
| Pipeline / EVM | `viaIR: true`, **cancun** |
| Metadata | `bytecodeHash: "ipfs"`, `appendCBOR: true`, `useLiteralContent: false` |
| Linked libraries | `{}` |
| Constructor arguments | None |
| Runtime | **9586 bytes**, Keccak `0xadbc98ddf155ec9a93328c11d78ff7fe2aeb180cc74bd34222e4313584b2374d` |
| Creation SHA-256 | `45d2044b191500c9e097982f436a27cad6eb8105f72e161cd59946b854d6094a` |

All **77** dependency-manifest file hashes match `contracts/dependencies.lock.json`. CPP is v1.1.0 commit `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9`; the locked upstream dependency commits and all remappings are preserved in `artifact-inspection.json`. No dependencies, Solidity, compiler settings, metadata settings, frontend configuration, or deployment identity changed.

The original Foundry `out/build-info` files contain only build ID, source-ID mappings, and language; they do not contain complete saved standard compiler input/output. Their names and hashes are recorded in the inspection evidence. Foundry regenerated the [standard JSON input](verification/public-source/standard-input.json) from the existing pinned project. A separate in-memory compilation with the installed exact solc and **unchanged settings** reproduced the original creation bytes, runtime bytes, and original raw metadata exactly; it did not overwrite repository artifacts. Foundry's deserialized `metadata` object normalizes some output/settings, so canonical metadata comparisons use the artifact's `rawMetadata`.

## Source-only submission used

From `contracts/`, with Foundry 1.8.5:

```sh
forge verify-contract \
  0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8 \
  src/DealzaOperator.sol:DealzaOperator \
  --chain 84532 \
  --compiler-version v0.8.28+commit.7893614a \
  --num-of-optimizations 100000 \
  --via-ir --evm-version cancun \
  --verifier sourcify \
  --creation-transaction-hash 0x73c6b79e93387e6e0f69ceae5185f6a9049ef8fbb2526ada2c70f145e1b96fe1 \
  --rpc-url https://sepolia.base.org \
  --watch --retries 2 --delay 5
```

The same pinned options with `--show-standard-json-input` generated the saved input before submission. There was no flattening, no constructor suffix, no settings workaround, no wallet key, and no API key. This command submits source to a verification service; it does not execute an EVM transaction.

To recheck the saved public responses against the local artifact and sources, run from the repository root:

```sh
python3 docs/verification/public-source/validate_evidence.py
```

The validator uses the existing installed compiler for an in-memory comparison, local Node dependencies for Keccak, and no network/wallet calls. [Validation output](verification/public-source/evidence-validation.txt) records the result. Contract/frontend tests were not rerun for this documentation and source-publication task; no application or financial logic changed.

## Remaining blockers and preservation

There is **no remaining blocker to public source availability** on Sourcify/Blockscout. A BaseScan-specific verified-source response is still needed if BaseScan is required: retry after the forwarding quota resets or use the Etherscan V2 route with a valid privately supplied credential, then confirm its actual `getsourcecode` result. No API key has been exposed or committed, and no HTTP 403 or submitted request is represented as verified source.

The entire [first-payment procedure](09-LIVE-DEPLOYMENT-AND-FIRST-PAYMENT.md) is preserved byte-for-byte. Its earlier statement that public source verification was unconfirmed is historical and is superseded by this report; its six MetaMask confirmations, authorization boundary, and remaining real-payment acceptance work are unchanged. No wallet connection, signing, blockchain broadcast, USDC spend, redeployment, Solidity edit, or GitHub push occurred. Evidence and this report were recorded locally; no new Git commit was requested or created for this task.
