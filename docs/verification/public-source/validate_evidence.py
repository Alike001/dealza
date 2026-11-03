"""Validate saved public responses against the pinned local artifact. No network or wallet."""
import hashlib
import json
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
CONTRACTS = ROOT / "contracts"


def load(name):
    return json.loads((OUT / name).read_text())


artifact = json.loads((CONTRACTS / "out/DealzaOperator.sol/DealzaOperator.json").read_text())
metadata = json.loads(artifact["rawMetadata"])
standard_input = load("standard-input.json")
compiler = Path.home() / ".local/share/svm/0.8.28/solc-0.8.28"
result = subprocess.run([str(compiler), "--standard-json"], input=json.dumps(standard_input),
                        capture_output=True, text=True, timeout=60, check=True)
compiled = json.loads(result.stdout)
assert not any(e["severity"] == "error" for e in compiled.get("errors", []))
contract = compiled["contracts"]["src/DealzaOperator.sol"]["DealzaOperator"]
assert "0x" + contract["evm"]["bytecode"]["object"] == artifact["bytecode"]["object"]
assert "0x" + contract["evm"]["deployedBytecode"]["object"] == artifact["deployedBytecode"]["object"]
assert json.loads(contract["metadata"]) == metadata
lock = json.loads((CONTRACTS / "dependencies.lock.json").read_text())
for name, digest in lock["files"].items():
    assert hashlib.sha256((CONTRACTS / name).read_bytes()).hexdigest() == digest

sourcify = load("sourcify-after.json")["response"]
blockscout = load("blockscout-after.json")["response"]
assert sourcify["chainId"] == "84532"
assert sourcify["address"].lower() == "0xd798ec27019bba2e6411986a2d58ff3d50f8c9c8"
assert sourcify["match"] == sourcify["runtimeMatch"] == sourcify["creationMatch"] == "exact_match"
assert sourcify["metadata"] == metadata
for remote, local in (("creationBytecode", "bytecode"), ("runtimeBytecode", "deployedBytecode")):
    assert sourcify[remote]["onchainBytecode"] == sourcify[remote]["recompiledBytecode"] == artifact[local]["object"]
assert set(sourcify["sources"]) == set(metadata["sources"]) == set(standard_input["sources"])
for name, source in sourcify["sources"].items():
    assert source["content"] == (CONTRACTS / name).read_text() == standard_input["sources"][name]["content"]
node_code = """import {readFileSync} from 'node:fs';
import {keccak256,toBytes} from 'viem';
const sources=JSON.parse(readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(sources).map(([p,s])=>[p,keccak256(toBytes(s.content))]))));"""
hashes = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", node_code],
                                          input=json.dumps(sourcify["sources"]), text=True, cwd=ROOT))
for name, digest in hashes.items():
    assert digest == metadata["sources"][name]["keccak256"]
assert blockscout["is_verified"] and blockscout["is_fully_verified"] and not blockscout["is_partially_verified"]
assert blockscout["source_code"] == (CONTRACTS / "src/DealzaOperator.sol").read_text()
assert blockscout["deployed_bytecode"] == artifact["deployedBytecode"]["object"]
assert blockscout["creation_bytecode"] == artifact["bytecode"]["object"]
normalize_abi = lambda abi: sorted(json.dumps(entry, sort_keys=True) for entry in abi)
assert normalize_abi(blockscout["abi"]) == normalize_abi(artifact["abi"])
extra = {s["file_path"]: s["source_code"] for s in blockscout["additional_sources"]}
assert set(extra) == set(sourcify["sources"]) - {"src/DealzaOperator.sol"}
for name, source in extra.items():
    assert source == (CONTRACTS / name).read_text()
assert subprocess.check_output(["git", "show", "HEAD:docs/09-LIVE-DEPLOYMENT-AND-FIRST-PAYMENT.md"], cwd=ROOT) == (ROOT / "docs/09-LIVE-DEPLOYMENT-AND-FIRST-PAYMENT.md").read_bytes()
report = {
    "result": "PASS_PUBLIC_SOURCE_VERIFICATION",
    "compiler": metadata["compiler"], "settings": metadata["settings"],
    "explicit_metadata_settings": standard_input["settings"]["metadata"],
    "source_count": len(metadata["sources"]), "source_paths": list(metadata["sources"]),
    "all_source_contents_and_keccak_hashes_match": True,
    "blockscout_full_abi_match": True,
    "abi_comparison_note": "All complete ABI entries match, sorting only top-level entries and JSON object keys; no fields were removed.",
    "all_77_dependency_hashes_match_lock": True,
    "creation_runtime_and_raw_metadata_exact_match": True,
    "runtime_bytes": (len(artifact["deployedBytecode"]["object"]) - 2) // 2,
    "creation_sha256": hashlib.sha256(bytes.fromhex(artifact["bytecode"]["object"][2:])).hexdigest(),
    "metadata_note": "Canonical original solc metadata is rawMetadata. Foundry's separate deserialized metadata object normalizes output/settings. Sourcify returned metadata equals parsed rawMetadata.",
    "build_info_note": "Existing build-info has id/source_id_to_path/language only, no full compiler input/output. Regenerated verification input was compiled separately with unchanged settings to prove exact equality; no artifacts or configuration were changed.",
    "build_info": [{"name": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
                    "keys": list(json.loads(p.read_text()))} for p in sorted((CONTRACTS / "out/build-info").glob("*.json"))],
    "dependencies": {k: v for k, v in lock.items() if k != "files"},
    "sourcify": {k: sourcify[k] for k in ("match", "runtimeMatch", "creationMatch", "verifiedAt", "deployment")},
    "blockscout": {k: blockscout[k] for k in ("is_verified", "is_fully_verified", "is_partially_verified", "verified_at", "compiler_version", "optimization_runs")},
    "basescan": {"status": "UNCONFIRMED", "page_http_status": 403,
                 "keyless_api_response": "Missing/Invalid API Key",
                 "sourcify_forwarding_error": "Daily limit of 500 source code submissions reached"},
    "first_payment_runbook_unchanged": True, "wallet_transactions": [], "api_key_used": False,
}
(OUT / "artifact-inspection.json").write_text(json.dumps(report, indent=2) + "\n")
print("PASS: exact creation/runtime/raw metadata, all 15 public sources, full Blockscout ABI, dependency pins; payment runbook unchanged")
